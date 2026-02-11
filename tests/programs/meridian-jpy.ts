import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { expect } from 'chai';

describe('meridian-jpy', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MeridianJpy as Program;
  const authority = provider.wallet;

  let mintConfigPda: PublicKey;
  let mintConfigBump: number;
  let mintKeypair: Keypair;
  let collateralVaultPda: PublicKey;
  let issuerPda: PublicKey;
  let transferHookProgramId: PublicKey;

  before(async () => {
    mintKeypair = Keypair.generate();

    transferHookProgramId = anchor.workspace.TransferHook
      ? anchor.workspace.TransferHook.programId
      : Keypair.generate().publicKey;

    [mintConfigPda, mintConfigBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('mint_config')],
      program.programId
    );

    [collateralVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('collateral_vault'), mintConfigPda.toBuffer()],
      program.programId
    );

    [issuerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('issuer'), authority.publicKey.toBuffer()],
      program.programId
    );
  });

  describe('initialize', () => {
    it('should initialize JPY mint with Token-2022', async () => {
      const tx = await program.methods
        .initialize({
          freezeAuthority: null,
          priceOracle: null,
        })
        .accounts({
          authority: authority.publicKey,
          mintConfig: mintConfigPda,
          mint: mintKeypair.publicKey,
          transferHookProgram: transferHookProgramId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([mintKeypair])
        .rpc();

      const mintConfig = await program.account.mintConfig.fetch(mintConfigPda);
      expect(mintConfig.authority.toString()).to.equal(authority.publicKey.toString());
      expect(mintConfig.isPaused).to.be.false;
      expect(mintConfig.totalSupply.toNumber()).to.equal(0);
      expect(mintConfig.collateralRatioBps.toNumber()).to.equal(10000);
    });
  });

  describe('issuer management', () => {
    it('should register an issuer', async () => {
      const tx = await program.methods
        .registerIssuer({
          issuerAuthority: authority.publicKey,
          issuerType: { trustBank: {} },
          dailyMintLimit: new anchor.BN(1_000_000_000_00),
          dailyBurnLimit: new anchor.BN(1_000_000_000_00),
        })
        .accounts({
          authority: authority.publicKey,
          mintConfig: mintConfigPda,
          issuer: issuerPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const issuer = await program.account.issuer.fetch(issuerPda);
      expect(issuer.isActive).to.be.true;
      expect(issuer.dailyMintLimit.toNumber()).to.equal(1_000_000_000_00);
    });

    it('should update issuer configuration', async () => {
      const newDailyLimit = new anchor.BN(2_000_000_000_00);

      const tx = await program.methods
        .updateIssuer({
          dailyMintLimit: newDailyLimit,
          dailyBurnLimit: null,
          isActive: null,
        })
        .accounts({
          authority: authority.publicKey,
          mintConfig: mintConfigPda,
          issuer: issuerPda,
        })
        .rpc();

      const issuer = await program.account.issuer.fetch(issuerPda);
      expect(issuer.dailyMintLimit.toNumber()).to.equal(2_000_000_000_00);
    });

    it('should reject unauthorized issuer registration', async () => {
      const fakeAuthority = Keypair.generate();
      const [fakeIssuerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('issuer'), fakeAuthority.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .registerIssuer({
            issuerAuthority: fakeAuthority.publicKey,
            issuerType: { distributor: {} },
            dailyMintLimit: new anchor.BN(0),
            dailyBurnLimit: new anchor.BN(0),
          })
          .accounts({
            authority: fakeAuthority.publicKey,
            mintConfig: mintConfigPda,
            issuer: fakeIssuerPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([fakeAuthority])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });

  describe('collateral vault', () => {
    it('should initialize collateral vault', async () => {
      const tx = await program.methods
        .initializeVault({
          collateralType: { fiatJpy: {} },
          auditor: authority.publicKey,
        })
        .accounts({
          authority: authority.publicKey,
          mintConfig: mintConfigPda,
          collateralVault: collateralVaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const vault = await program.account.collateralVault.fetch(collateralVaultPda);
      expect(vault.totalCollateral.toNumber()).to.equal(0);
    });

    it('should update collateral', async () => {
      const depositAmount = new anchor.BN(100_000_000_00);
      const proofHash = Buffer.alloc(32);

      const tx = await program.methods
        .updateCollateral({
          amount: depositAmount,
          isDeposit: true,
          proofHash: Array.from(proofHash),
        })
        .accounts({
          authority: authority.publicKey,
          mintConfig: mintConfigPda,
          collateralVault: collateralVaultPda,
        })
        .rpc();

      const vault = await program.account.collateralVault.fetch(collateralVaultPda);
      expect(vault.totalCollateral.toNumber()).to.equal(100_000_000_00);
    });
  });

  describe('mint and burn', () => {
    const recipient = Keypair.generate();
    let recipientAta: PublicKey;

    before(async () => {
      const payer = (provider.wallet as any).payer as Keypair;
      // Create the Token-2022 ATA for the recipient before minting
      recipientAta = await createAssociatedTokenAccount(
        provider.connection,
        payer,
        mintKeypair.publicKey,
        recipient.publicKey,
        undefined,
        TOKEN_2022_PROGRAM_ID,
      );
    });

    it('should mint JPY tokens to a verified recipient', async () => {
      const amount = new anchor.BN(1_000_000_00);
      const reference = Buffer.alloc(32);

      const tx = await program.methods
        .mint({
          amount,
          reference: Array.from(reference),
        })
        .accounts({
          issuerAuthority: authority.publicKey,
          mintConfig: mintConfigPda,
          issuer: issuerPda,
          mint: mintKeypair.publicKey,
          recipientTokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const mintConfig = await program.account.mintConfig.fetch(mintConfigPda);
      expect(mintConfig.totalSupply.toNumber()).to.equal(1_000_000_00);
    });

    it('should burn JPY tokens for redemption', async () => {
      const amount = new anchor.BN(500_000_00);
      const redemptionInfo = Buffer.alloc(64);

      const tx = await program.methods
        .burn({
          amount,
          redemptionInfo: Array.from(redemptionInfo),
        })
        .accounts({
          holder: recipient.publicKey,
          mintConfig: mintConfigPda,
          mint: mintKeypair.publicKey,
          holderTokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([recipient])
        .rpc();

      const mintConfig = await program.account.mintConfig.fetch(mintConfigPda);
      expect(mintConfig.totalSupply.toNumber()).to.equal(500_000_00);
    });

    it('should reject minting when paused', async () => {
      await program.methods
        .pause()
        .accounts({
          authority: authority.publicKey,
          mintConfig: mintConfigPda,
        })
        .rpc();

      let mintFailed = false;
      try {
        await program.methods
          .mint({
            amount: new anchor.BN(1_000_00),
            reference: Array.from(Buffer.alloc(32)),
          })
          .accounts({
            issuerAuthority: authority.publicKey,
            mintConfig: mintConfigPda,
            issuer: issuerPda,
            mint: mintKeypair.publicKey,
            recipientTokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
      } catch (err: any) {
        mintFailed = true;
      }

      // Always unpause for subsequent tests
      await program.methods
        .unpause()
        .accounts({
          authority: authority.publicKey,
          mintConfig: mintConfigPda,
        })
        .rpc();

      expect(mintFailed).to.be.true;
    });
  });

  describe('pause and unpause', () => {
    it('should pause operations', async () => {
      await program.methods
        .pause()
        .accounts({
          authority: authority.publicKey,
          mintConfig: mintConfigPda,
        })
        .rpc();

      const mintConfig = await program.account.mintConfig.fetch(mintConfigPda);
      expect(mintConfig.isPaused).to.be.true;
    });

    it('should unpause operations', async () => {
      await program.methods
        .unpause()
        .accounts({
          authority: authority.publicKey,
          mintConfig: mintConfigPda,
        })
        .rpc();

      const mintConfig = await program.account.mintConfig.fetch(mintConfigPda);
      expect(mintConfig.isPaused).to.be.false;
    });

    it('should reject pause from non-authority', async () => {
      const fakeAuthority = Keypair.generate();

      try {
        await program.methods
          .pause()
          .accounts({
            authority: fakeAuthority.publicKey,
            mintConfig: mintConfigPda,
          })
          .signers([fakeAuthority])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });

  describe('audit', () => {
    it('should submit an audit report', async () => {
      const auditHash = Buffer.alloc(32);
      auditHash.fill(1);

      const tx = await program.methods
        .submitAudit({
          verifiedAmount: new anchor.BN(100_000_000_00),
          auditHash: Array.from(auditHash),
        })
        .accounts({
          auditor: authority.publicKey,
          mintConfig: mintConfigPda,
          collateralVault: collateralVaultPda,
        })
        .rpc();

      const vault = await program.account.collateralVault.fetch(collateralVaultPda);
      expect(vault.lastAuditAt.toNumber()).to.be.greaterThan(0);
    });
  });
});
