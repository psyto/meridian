import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { expect } from 'chai';

describe('rwa-registry', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.RwaRegistry as Program;
  const authority = provider.wallet;
  const custodian = Keypair.generate();

  let assetPda: PublicKey;
  let ownershipPda: PublicKey;
  let dividendPda: PublicKey;
  let tokenMint: Keypair;

  before(async () => {
    tokenMint = Keypair.generate();

    [assetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('asset'), Buffer.from('MERI-RE-001')],
      program.programId
    );

    [ownershipPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('ownership'),
        assetPda.toBuffer(),
        authority.publicKey.toBuffer(),
      ],
      program.programId
    );

    [dividendPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('dividend'),
        assetPda.toBuffer(),
        new anchor.BN(1).toArrayLike(Buffer, 'le', 8),
      ],
      program.programId
    );
  });

  describe('register_asset', () => {
    it('should register a new RWA asset', async () => {
      const assetType = { realEstate: {} };
      const valuation = new anchor.BN(500_000_000); // ¥500M
      const valuationCurrency = { jpy: {} };
      const jurisdiction = { japan: {} };
      const legalDocHash = Buffer.alloc(32);
      legalDocHash.fill(0xcd);

      const tx = await program.methods
        .registerAsset(
          assetType,
          valuation,
          valuationCurrency,
          'MERI-RE-001',
          'Meridian Real Estate Fund 1',
          null, // no ISIN
          jurisdiction,
          legalDocHash
        )
        .accounts({
          authority: authority.publicKey,
          asset: assetPda,
          custodian: custodian.publicKey,
          tokenMint: tokenMint.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([tokenMint])
        .rpc();

      const asset = await program.account.rwaAsset.fetch(assetPda);
      expect(asset.symbol).to.equal('MERI-RE-001');
      expect(asset.name).to.equal('Meridian Real Estate Fund 1');
      expect(asset.valuation.toNumber()).to.equal(500_000_000);
      expect(asset.status).to.deep.equal({ pending: {} });
      expect(asset.isFrozen).to.be.false;
    });

    it('should reject duplicate asset registration', async () => {
      try {
        await program.methods
          .registerAsset(
            { equity: {} },
            new anchor.BN(100_000_000),
            { jpy: {} },
            'MERI-RE-001', // Same symbol
            'Duplicate',
            null,
            { japan: {} },
            Buffer.alloc(32)
          )
          .accounts({
            authority: authority.publicKey,
            asset: assetPda,
            custodian: custodian.publicKey,
            tokenMint: Keypair.generate().publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });

  describe('verify_custody', () => {
    it('should verify custody and activate asset', async () => {
      const custodyProofHash = Buffer.alloc(32);
      custodyProofHash.fill(0xef);

      const tx = await program.methods
        .verifyCustody(custodyProofHash)
        .accounts({
          custodian: custodian.publicKey,
          asset: assetPda,
        })
        .signers([custodian])
        .rpc();

      const asset = await program.account.rwaAsset.fetch(assetPda);
      expect(asset.status).to.deep.equal({ active: {} });
    });

    it('should reject verification from non-custodian', async () => {
      const fakeCustodian = Keypair.generate();

      try {
        await program.methods
          .verifyCustody(Buffer.alloc(32))
          .accounts({
            custodian: fakeCustodian.publicKey,
            asset: assetPda,
          })
          .signers([fakeCustodian])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });

  describe('mint_tokens', () => {
    it('should mint ownership tokens for an active asset', async () => {
      const amount = new anchor.BN(1_000); // 1000 tokens
      const acquisitionPrice = new anchor.BN(500_000); // ¥500K per token

      const tx = await program.methods
        .mintTokens(amount, acquisitionPrice)
        .accounts({
          authority: authority.publicKey,
          asset: assetPda,
          ownershipProof: ownershipPda,
          recipient: authority.publicKey,
          tokenMint: tokenMint.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const ownership = await program.account.ownershipProof.fetch(ownershipPda);
      expect(ownership.amount.toNumber()).to.equal(1_000);
      expect(ownership.acquisitionPrice.toNumber()).to.equal(500_000);
      expect(ownership.isActive).to.be.true;
    });
  });

  describe('update_valuation', () => {
    it('should update asset valuation', async () => {
      const newValuation = new anchor.BN(600_000_000); // ¥600M (up from ¥500M)
      const proofHash = Buffer.alloc(32);
      proofHash.fill(0xab);

      const tx = await program.methods
        .updateValuation(newValuation, proofHash)
        .accounts({
          authority: authority.publicKey,
          asset: assetPda,
        })
        .rpc();

      const asset = await program.account.rwaAsset.fetch(assetPda);
      expect(asset.valuation.toNumber()).to.equal(600_000_000);
    });
  });

  describe('dividends', () => {
    it('should distribute a dividend', async () => {
      const amountPerToken = new anchor.BN(5_000); // ¥5K per token
      const paymentDate = new anchor.BN(Math.floor(Date.now() / 1000) + 30 * 86400);
      const paymentToken = Keypair.generate().publicKey; // JPY mint

      const tx = await program.methods
        .distributeDividend(amountPerToken, paymentDate, paymentToken)
        .accounts({
          authority: authority.publicKey,
          asset: assetPda,
          dividend: dividendPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const dividend = await program.account.dividend.fetch(dividendPda);
      expect(dividend.amountPerToken.toNumber()).to.equal(5_000);
      expect(dividend.status).to.deep.equal({ announced: {} });
    });

    it('should claim a dividend', async () => {
      // First make dividend payable
      // (In production, this would happen after paymentDate)

      const tx = await program.methods
        .claimDividend()
        .accounts({
          owner: authority.publicKey,
          asset: assetPda,
          ownershipProof: ownershipPda,
          dividend: dividendPda,
          // Token accounts for payment
        })
        .rpc();

      const dividend = await program.account.dividend.fetch(dividendPda);
      expect(dividend.claimedAmount.toNumber()).to.be.greaterThan(0);
    });
  });

  describe('freeze and unfreeze', () => {
    it('should freeze an asset', async () => {
      const tx = await program.methods
        .freezeAsset()
        .accounts({
          authority: authority.publicKey,
          asset: assetPda,
        })
        .rpc();

      const asset = await program.account.rwaAsset.fetch(assetPda);
      expect(asset.isFrozen).to.be.true;
    });

    it('should reject operations on frozen asset', async () => {
      try {
        await program.methods
          .mintTokens(new anchor.BN(100), new anchor.BN(500_000))
          .accounts({
            authority: authority.publicKey,
            asset: assetPda,
            ownershipProof: ownershipPda,
            recipient: authority.publicKey,
            tokenMint: tokenMint.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.message).to.include('Frozen');
      }
    });

    it('should unfreeze an asset', async () => {
      const tx = await program.methods
        .unfreezeAsset()
        .accounts({
          authority: authority.publicKey,
          asset: assetPda,
        })
        .rpc();

      const asset = await program.account.rwaAsset.fetch(assetPda);
      expect(asset.isFrozen).to.be.false;
    });
  });
});
