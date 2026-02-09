import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { expect } from 'chai';

describe('transfer-hook', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TransferHook as Program;
  const authority = provider.wallet;
  const mintKeypair = Keypair.generate();

  let registryPda: PublicKey;
  let registryBump: number;

  before(async () => {
    [registryPda, registryBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('kyc_registry'), mintKeypair.publicKey.toBuffer()],
      program.programId
    );
  });

  describe('initialize_registry', () => {
    it('should initialize KYC registry', async () => {
      const tx = await program.methods
        .initializeRegistry()
        .accounts({
          authority: authority.publicKey,
          registry: registryPda,
          mint: mintKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const registry = await program.account.kycRegistry.fetch(registryPda);
      expect(registry.authority.toString()).to.equal(authority.publicKey.toString());
      expect(registry.totalWhitelisted.toNumber()).to.equal(0);
      expect(registry.isActive).to.be.true;
    });
  });

  describe('whitelist management', () => {
    const verifiedWallet = Keypair.generate();
    let whitelistPda: PublicKey;

    before(async () => {
      [whitelistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('whitelist'), verifiedWallet.publicKey.toBuffer()],
        program.programId
      );
    });

    it('should add a wallet to the whitelist', async () => {
      const kycLevel = { standard: {} };
      const jurisdiction = { japan: {} };
      const kycHash = Buffer.alloc(32);
      kycHash.fill(0xab);
      const dailyLimit = new anchor.BN(0); // unlimited (trust-type)
      const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 365 * 86400); // 1 year

      const tx = await program.methods
        .addToWhitelist(kycLevel, jurisdiction, kycHash, dailyLimit, expiryTimestamp)
        .accounts({
          authority: authority.publicKey,
          registry: registryPda,
          whitelistEntry: whitelistPda,
          wallet: verifiedWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const entry = await program.account.whitelistEntry.fetch(whitelistPda);
      expect(entry.wallet.toString()).to.equal(verifiedWallet.publicKey.toString());
      expect(entry.isActive).to.be.true;
    });

    it('should reject adding a wallet with blocked jurisdiction (USA)', async () => {
      const usWallet = Keypair.generate();
      const [usPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('whitelist'), usWallet.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .addToWhitelist(
            { standard: {} },
            { usa: {} },
            Buffer.alloc(32),
            new anchor.BN(0),
            new anchor.BN(Math.floor(Date.now() / 1000) + 365 * 86400)
          )
          .accounts({
            authority: authority.publicKey,
            registry: registryPda,
            whitelistEntry: usPda,
            wallet: usWallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.message).to.include('Jurisdiction');
      }
    });

    it('should remove a wallet from the whitelist', async () => {
      const tempWallet = Keypair.generate();
      const [tempPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('whitelist'), tempWallet.publicKey.toBuffer()],
        program.programId
      );

      // Add first
      await program.methods
        .addToWhitelist(
          { basic: {} },
          { japan: {} },
          Buffer.alloc(32),
          new anchor.BN(100_000_00),
          new anchor.BN(Math.floor(Date.now() / 1000) + 30 * 86400)
        )
        .accounts({
          authority: authority.publicKey,
          registry: registryPda,
          whitelistEntry: tempPda,
          wallet: tempWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Then remove
      await program.methods
        .removeFromWhitelist()
        .accounts({
          authority: authority.publicKey,
          registry: registryPda,
          whitelistEntry: tempPda,
          wallet: tempWallet.publicKey,
        })
        .rpc();

      const entry = await program.account.whitelistEntry.fetch(tempPda);
      expect(entry.isActive).to.be.false;
    });
  });

  describe('transfer validation', () => {
    it('should validate transfer between whitelisted wallets', async () => {
      const sender = Keypair.generate();
      const recipient = Keypair.generate();

      const [senderPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('whitelist'), sender.publicKey.toBuffer()],
        program.programId
      );
      const [recipientPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('whitelist'), recipient.publicKey.toBuffer()],
        program.programId
      );

      const expiry = new anchor.BN(Math.floor(Date.now() / 1000) + 365 * 86400);

      // Whitelist both
      await program.methods
        .addToWhitelist(
          { standard: {} },
          { japan: {} },
          Buffer.alloc(32),
          new anchor.BN(0),
          expiry
        )
        .accounts({
          authority: authority.publicKey,
          registry: registryPda,
          whitelistEntry: senderPda,
          wallet: sender.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .addToWhitelist(
          { standard: {} },
          { japan: {} },
          Buffer.alloc(32),
          new anchor.BN(0),
          expiry
        )
        .accounts({
          authority: authority.publicKey,
          registry: registryPda,
          whitelistEntry: recipientPda,
          wallet: recipient.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Verify both are whitelisted
      const senderEntry = await program.account.whitelistEntry.fetch(senderPda);
      const recipientEntry = await program.account.whitelistEntry.fetch(recipientPda);
      expect(senderEntry.isActive).to.be.true;
      expect(recipientEntry.isActive).to.be.true;
    });
  });

  describe('daily limits', () => {
    it('should enforce daily transaction limits', async () => {
      const limitedWallet = Keypair.generate();
      const [limitedPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('whitelist'), limitedWallet.publicKey.toBuffer()],
        program.programId
      );

      const dailyLimit = new anchor.BN(1_000_000_00); // 10M yen limit

      await program.methods
        .addToWhitelist(
          { basic: {} },
          { singapore: {} },
          Buffer.alloc(32),
          dailyLimit,
          new anchor.BN(Math.floor(Date.now() / 1000) + 365 * 86400)
        )
        .accounts({
          authority: authority.publicKey,
          registry: registryPda,
          whitelistEntry: limitedPda,
          wallet: limitedWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const entry = await program.account.whitelistEntry.fetch(limitedPda);
      expect(entry.dailyLimit.toNumber()).to.equal(1_000_000_00);
      expect(entry.dailyVolume.toNumber()).to.equal(0);
    });
  });
});
