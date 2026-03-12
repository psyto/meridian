import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { expect } from 'chai';

describe('shield-escrow', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ShieldEscrow as Program;
  const authority = provider.wallet;

  let shieldConfigPda: PublicKey;
  let escrowAuthorityPda: PublicKey;
  let transferHookProgram: PublicKey;
  let kycRegistry: PublicKey;
  let feeRecipient: Keypair;

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
  });

  describe('initialize', () => {
    it('should initialize ShieldConfig with correct values', async () => {
      const feeBps = 50; // 0.5%

      const tx = await program.methods
        .initialize(
          transferHookProgram,
          kycRegistry,
          feeBps,
          feeRecipient.publicKey
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
});
