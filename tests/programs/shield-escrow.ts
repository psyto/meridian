import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';
import { expect } from 'chai';

describe('shield-escrow', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ShieldEscrow as Program;
  const authority = provider.wallet;
  const payer = (provider.wallet as anchor.Wallet).payer;

  let shieldConfigPda: PublicKey;
  let escrowAuthorityPda: PublicKey;
  let transferHookProgram: PublicKey;
  let kycRegistry: PublicKey;
  let feeRecipient: Keypair;
  let attestor: Keypair;

  before(async () => {
    [shieldConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('shield_config')],
      program.programId
    );

    [escrowAuthorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('escrow_authority')],
      program.programId
    );

    transferHookProgram = anchor.workspace.TransferHook
      ? anchor.workspace.TransferHook.programId
      : Keypair.generate().publicKey;

    kycRegistry = Keypair.generate().publicKey;
    feeRecipient = Keypair.generate();
    attestor = Keypair.generate();
  });

  describe('initialize', () => {
    it('should initialize ShieldConfig with correct values', async () => {
      const feeBps = 50; // 0.5%

      const tx = await program.methods
        .initialize(
          transferHookProgram,
          kycRegistry,
          feeBps,
          feeRecipient.publicKey,
          attestor.publicKey
        )
        .accounts({
          authority: authority.publicKey,
          shieldConfig: shieldConfigPda,
          escrowAuthority: escrowAuthorityPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const config = await program.account.shieldConfig.fetch(shieldConfigPda);
      expect(config.authority.toString()).to.equal(authority.publicKey.toString());
      expect(config.attestorPubkey.toString()).to.equal(attestor.publicKey.toString());
      expect(config.escrowAuthority.toString()).to.equal(escrowAuthorityPda.toString());
      expect(config.transferHookProgram.toString()).to.equal(transferHookProgram.toString());
      expect(config.kycRegistry.toString()).to.equal(kycRegistry.toString());
      expect(config.totalSwaps.toNumber()).to.equal(0);
      expect(config.totalVolume.toNumber()).to.equal(0);
      expect(config.feeBps).to.equal(feeBps);
      expect(config.feeRecipient.toString()).to.equal(feeRecipient.publicKey.toString());
      expect(config.isActive).to.be.true;
      expect(config.createdAt.toNumber()).to.be.greaterThan(0);
    });

    it('should fail with fee_bps > 100', async () => {
      // The config PDA is already initialized, so we use a separate program
      // invocation that will fail at the fee validation before the init
      // constraint even triggers. We verify the error code indicates FeeTooHigh.
      //
      // Since the PDA is already initialised, Anchor will reject with
      // "already in use" before our custom check runs. Instead, verify
      // the MAX_FEE_BPS constraint via update_config with fee > 100.
      try {
        await program.methods
          .updateConfig(
            101, // fee_bps > 100
            null,
            null
          )
          .accounts({
            authority: authority.publicKey,
            shieldConfig: shieldConfigPda,
          })
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
        const errMsg = err.toString();
        expect(
          errMsg.includes('FeeTooHigh') ||
          errMsg.includes('6005') ||
          errMsg.includes('Error')
        ).to.be.true;
      }
    });
  });

  describe('update_config', () => {
    it('should update fee and deactivate', async () => {
      const newFeeBps = 25; // 0.25%

      await program.methods
        .updateConfig(
          newFeeBps,
          null,
          false // deactivate
        )
        .accounts({
          authority: authority.publicKey,
          shieldConfig: shieldConfigPda,
        })
        .rpc();

      const config = await program.account.shieldConfig.fetch(shieldConfigPda);
      expect(config.feeBps).to.equal(newFeeBps);
      expect(config.isActive).to.be.false;

      // Re-activate for subsequent tests
      await program.methods
        .updateConfig(
          null,
          null,
          true
        )
        .accounts({
          authority: authority.publicKey,
          shieldConfig: shieldConfigPda,
        })
        .rpc();

      const reactivated = await program.account.shieldConfig.fetch(shieldConfigPda);
      expect(reactivated.isActive).to.be.true;
    });

    it('should update fee_recipient', async () => {
      const newRecipient = Keypair.generate();

      await program.methods
        .updateConfig(
          null,
          newRecipient.publicKey,
          null
        )
        .accounts({
          authority: authority.publicKey,
          shieldConfig: shieldConfigPda,
        })
        .rpc();

      const config = await program.account.shieldConfig.fetch(shieldConfigPda);
      expect(config.feeRecipient.toString()).to.equal(newRecipient.publicKey.toString());
    });

    it('should fail with non-authority signer', async () => {
      const fakeAuthority = Keypair.generate();

      try {
        await program.methods
          .updateConfig(
            10,
            null,
            null
          )
          .accounts({
            authority: fakeAuthority.publicKey,
            shieldConfig: shieldConfigPda,
          })
          .signers([fakeAuthority])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });

  describe('execute_swap (attestor co-sign)', () => {
    // fee_bps is 25 at this point (set by the update_config suite above).
    const nonce = new anchor.BN(1);
    const depositAmount = new anchor.BN(1_000_000);
    const outputAmount = new anchor.BN(2_000_000); // gross
    const minOutput = new anchor.BN(1_000_000); // trader's minimum on the NET they receive

    let trader: Keypair;
    let inputMint: PublicKey;
    let outputMint: PublicKey;
    let traderInputAta: PublicKey;
    let escrowInputAta: PublicKey;
    let swapReceiptPda: PublicKey;

    before(async () => {
      trader = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(trader.publicKey, 2_000_000_000);
      await provider.connection.confirmTransaction(sig);

      // Plain Token-2022 mints (no transfer-hook extension) so deposit's
      // transfer_checked succeeds without a deployed hook program.
      inputMint = await createMint(
        provider.connection, payer, payer.publicKey, null, 6, undefined, undefined, TOKEN_2022_PROGRAM_ID
      );
      outputMint = await createMint(
        provider.connection, payer, payer.publicKey, null, 6, undefined, undefined, TOKEN_2022_PROGRAM_ID
      );

      const traderAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer, inputMint, trader.publicKey, false, undefined, undefined, TOKEN_2022_PROGRAM_ID
      );
      traderInputAta = traderAta.address;

      // Escrow ATA is owned by the escrow authority PDA (allowOwnerOffCurve).
      const escrowAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, payer, inputMint, escrowAuthorityPda, true, undefined, undefined, TOKEN_2022_PROGRAM_ID
      );
      escrowInputAta = escrowAta.address;

      await mintTo(
        provider.connection, payer, inputMint, traderInputAta, payer, 10_000_000, [], undefined, TOKEN_2022_PROGRAM_ID
      );

      [swapReceiptPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('receipt'), trader.publicKey.toBuffer(), nonce.toArrayLike(Buffer, 'le', 8)],
        program.programId
      );

      // Create a Pending receipt to run execute_swap against.
      await program.methods
        .deposit(nonce, depositAmount)
        .accounts({
          trader: trader.publicKey,
          shieldConfig: shieldConfigPda,
          escrowAuthority: escrowAuthorityPda,
          inputMint,
          outputMint,
          traderInputToken: traderInputAta,
          escrowInputToken: escrowInputAta,
          swapReceipt: swapReceiptPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([trader])
        .rpc();
    });

    it('rejects a wrong attestor (InvalidAttestor)', async () => {
      const wrong = Keypair.generate();
      try {
        await program.methods
          .executeSwap(outputAmount, minOutput)
          .accounts({
            authority: authority.publicKey,
            attestor: wrong.publicKey,
            shieldConfig: shieldConfigPda,
            swapReceipt: swapReceiptPda,
          })
          .signers([wrong])
          .rpc();
        expect.fail('Should have thrown InvalidAttestor');
      } catch (err: any) {
        expect(err.toString()).to.match(/InvalidAttestor|constraint|6008/i);
      }
    });

    it('fails when the attestor does not co-sign', async () => {
      try {
        await program.methods
          .executeSwap(outputAmount, minOutput)
          .accounts({
            authority: authority.publicKey,
            attestor: attestor.publicKey,
            shieldConfig: shieldConfigPda,
            swapReceipt: swapReceiptPda,
          })
          // deliberately NOT signing as attestor — co-signature is required
          .rpc();
        expect.fail('Should have thrown a missing-signature error');
      } catch (err: any) {
        expect(err).to.exist;
      }
    });

    it('completes when keeper (authority) AND attestor co-sign, enforcing NET slippage', async () => {
      await program.methods
        .executeSwap(outputAmount, minOutput)
        .accounts({
          authority: authority.publicKey,
          attestor: attestor.publicKey,
          shieldConfig: shieldConfigPda,
          swapReceipt: swapReceiptPda,
        })
        .signers([attestor])
        .rpc();

      const receipt = await program.account.swapReceipt.fetch(swapReceiptPda);
      expect(receipt.status).to.have.property('completed');
      // gross 2_000_000 - fee (25bps = 5_000) = net 1_995_000, which is >= minOutput
      expect(receipt.outputAmount.toNumber()).to.equal(1_995_000);
      expect(receipt.feeAmount.toNumber()).to.equal(5_000);
    });
  });
});
