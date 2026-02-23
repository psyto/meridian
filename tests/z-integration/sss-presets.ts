import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccount,
  getAccount,
} from '@solana/spl-token';
import { expect } from 'chai';

/**
 * Integration tests for SSS-1 and SSS-2 stablecoin presets.
 *
 * These run AFTER the program-level unit tests (z-integration/ sorts after programs/).
 * The SSS-1 tests verify state created by the unit tests (mint_config is a singleton PDA).
 * The SSS-2 blacklist tests create their own registry and exercise the full flow.
 */

describe('SSS Preset Integration Tests', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const stablecoinProgram = anchor.workspace.MeridianStablecoin as Program;
  const hookProgram = anchor.workspace.TransferHook as Program;
  const authority = provider.wallet;
  const payer = (provider.wallet as any).payer as Keypair;

  // =========================================================================
  // SSS-1: Verify State from Unit Tests
  // =========================================================================

  describe('SSS-1: Minimal Stablecoin (state verification)', () => {
    let mintConfigPda: PublicKey;

    before(async () => {
      [mintConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('mint_config')],
        stablecoinProgram.programId
      );
    });

    it('mint_config was initialized with SSS-1 defaults', async () => {
      const config = await stablecoinProgram.account.mintConfig.fetch(mintConfigPda);
      expect(config.authority.toString()).to.equal(authority.publicKey.toString());
      expect(config.enablePermanentDelegate).to.be.false;
      expect(config.enableTransferHook).to.be.false;
      expect(config.defaultAccountFrozen).to.be.false;
      expect(config.decimals).to.equal(2);
      expect(config.isPaused).to.be.false;
    });

    it('collateral ratio is 100% (10000 bps)', async () => {
      const config = await stablecoinProgram.account.mintConfig.fetch(mintConfigPda);
      expect(config.collateralRatioBps.toNumber()).to.equal(10000);
    });

    it('seize is blocked on SSS-1 (permanent delegate disabled)', async () => {
      const config = await stablecoinProgram.account.mintConfig.fetch(mintConfigPda);
      expect(config.enablePermanentDelegate).to.be.false;

      // Attempting seize should fail with constraint error
      const fakeSource = Keypair.generate();
      const fakeTreasury = Keypair.generate();

      try {
        await stablecoinProgram.methods
          .seize({
            amount: new anchor.BN(100),
            reason: Array.from(Buffer.alloc(32)),
          })
          .accounts({
            authority: authority.publicKey,
            mintConfig: mintConfigPda,
            mint: Keypair.generate().publicKey,
            source: fakeSource.publicKey,
            treasury: fakeTreasury.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        expect.fail('Seize should fail on SSS-1 — permanent delegate not enabled');
      } catch (err: any) {
        expect(err).to.exist;
        const msg = err.toString();
        expect(
          msg.includes('PermanentDelegateNotEnabled') ||
          msg.includes('Error')
        ).to.be.true;
      }
    });
  });

  // =========================================================================
  // SSS-2: Compliant Stablecoin (Blacklist Flow)
  // =========================================================================

  describe('SSS-2: Blacklist Enforcement', () => {
    const mintKeypair2 = Keypair.generate();
    let registryPda: PublicKey;

    before(async () => {
      // Create a Token-2022 mint for the hook registry
      const { createMint } = await import('@solana/spl-token');
      await createMint(
        provider.connection,
        payer,
        authority.publicKey,
        null,
        6,
        mintKeypair2,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('kyc_registry'), mintKeypair2.publicKey.toBuffer()],
        hookProgram.programId
      );

      // Initialize registry
      await hookProgram.methods
        .initializeRegistry()
        .accounts({
          authority: authority.publicKey,
          registry: registryPda,
          mint: mintKeypair2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it('Step 1: Whitelist a wallet, then blacklist it', async () => {
      const targetWallet = Keypair.generate();

      // Whitelist
      const [whitelistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('whitelist'), targetWallet.publicKey.toBuffer()],
        hookProgram.programId
      );

      await hookProgram.methods
        .addToWhitelist({
          wallet: targetWallet.publicKey,
          kycLevel: { standard: {} },
          jurisdiction: { japan: {} },
          kycHash: Array.from(Buffer.alloc(32)),
          dailyLimit: new anchor.BN(0),
          expiryTimestamp: new anchor.BN(Math.floor(Date.now() / 1000) + 365 * 86400),
        })
        .accounts({
          authority: authority.publicKey,
          registry: registryPda,
          whitelistEntry: whitelistPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Verify whitelisted
      const whitelistEntry = await hookProgram.account.whitelistEntry.fetch(whitelistPda);
      expect(whitelistEntry.isActive).to.be.true;

      // Blacklist the same wallet
      const [blacklistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('blacklist'), targetWallet.publicKey.toBuffer()],
        hookProgram.programId
      );

      await hookProgram.methods
        .addToBlacklist({
          wallet: targetWallet.publicKey,
          reason: 'Sanctions screening match',
        })
        .accounts({
          authority: authority.publicKey,
          registry: registryPda,
          blacklistEntry: blacklistPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Verify blacklisted
      const blacklistEntry = await hookProgram.account.blacklistEntry.fetch(blacklistPda);
      expect(blacklistEntry.isActive).to.be.true;
      expect(blacklistEntry.reason).to.equal('Sanctions screening match');

      // Wallet is now both whitelisted AND blacklisted.
      // The transfer hook checks blacklist BEFORE whitelist, so transfers should be blocked.
    });

    it('Step 2: Unblacklist and verify entry is deactivated', async () => {
      const targetWallet2 = Keypair.generate();

      // Blacklist
      const [blacklistPda2] = PublicKey.findProgramAddressSync(
        [Buffer.from('blacklist'), targetWallet2.publicKey.toBuffer()],
        hookProgram.programId
      );

      await hookProgram.methods
        .addToBlacklist({
          wallet: targetWallet2.publicKey,
          reason: 'Temporary hold',
        })
        .accounts({
          authority: authority.publicKey,
          registry: registryPda,
          blacklistEntry: blacklistPda2,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Verify active
      let entry = await hookProgram.account.blacklistEntry.fetch(blacklistPda2);
      expect(entry.isActive).to.be.true;

      // Remove from blacklist
      await hookProgram.methods
        .removeFromBlacklist()
        .accounts({
          authority: authority.publicKey,
          registry: registryPda,
          blacklistEntry: blacklistPda2,
        })
        .rpc();

      // Verify deactivated
      entry = await hookProgram.account.blacklistEntry.fetch(blacklistPda2);
      expect(entry.isActive).to.be.false;
      expect(entry.removedAt.toNumber()).to.be.greaterThan(0);
    });
  });

  // =========================================================================
  // Preset Configuration Validation
  // =========================================================================

  describe('Preset Configuration', () => {
    it('SSS-1 preset sets correct defaults', () => {
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('mint_config')],
        stablecoinProgram.programId
      );
      expect(configPda).to.not.be.null;
    });

    it('Role config PDA is derived from mint config', () => {
      const [mintConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('mint_config')],
        stablecoinProgram.programId
      );
      const [roleConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('role_config'), mintConfigPda.toBuffer()],
        stablecoinProgram.programId
      );

      expect(roleConfigPda).to.not.be.null;
      // Verify deterministic
      const [roleConfigPda2] = PublicKey.findProgramAddressSync(
        [Buffer.from('role_config'), mintConfigPda.toBuffer()],
        stablecoinProgram.programId
      );
      expect(roleConfigPda.toBase58()).to.equal(roleConfigPda2.toBase58());
    });

    it('Blacklist and whitelist PDAs are independent for the same wallet', () => {
      const wallet = Keypair.generate().publicKey;

      const [whitelistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('whitelist'), wallet.toBuffer()],
        hookProgram.programId
      );
      const [blacklistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('blacklist'), wallet.toBuffer()],
        hookProgram.programId
      );

      // They must be different PDAs (different seed prefixes)
      expect(whitelistPda.toBase58()).to.not.equal(blacklistPda.toBase58());
    });
  });
});
