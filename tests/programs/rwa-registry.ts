import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
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
  const recordDate = new anchor.BN(1);

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
        recordDate.toArrayLike(Buffer, 'le', 8),
      ],
      program.programId
    );
  });

  describe('register_asset', () => {
    it('should register a new RWA asset', async () => {
      const legalDocHash = Buffer.alloc(32);
      legalDocHash.fill(0xcd);

      const tx = await program.methods
        .registerAsset({
          custodian: custodian.publicKey,
          assetType: { realEstate: {} },
          valuation: new anchor.BN(500_000_000),
          valuationCurrency: { jpy: {} },
          name: 'Meridian Real Estate Fund 1',
          symbol: 'MERI-RE-001',
          isin: null,
          jurisdiction: { japan: {} },
          legalDocumentHash: Array.from(legalDocHash),
        })
        .accounts({
          authority: authority.publicKey,
          asset: assetPda,
          tokenMint: tokenMint.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
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
        const dupMint = Keypair.generate();
        await program.methods
          .registerAsset({
            custodian: custodian.publicKey,
            assetType: { equity: {} },
            valuation: new anchor.BN(100_000_000),
            valuationCurrency: { jpy: {} },
            name: 'Duplicate',
            symbol: 'MERI-RE-001',
            isin: null,
            jurisdiction: { japan: {} },
            legalDocumentHash: Array.from(Buffer.alloc(32)),
          })
          .accounts({
            authority: authority.publicKey,
            asset: assetPda,
            tokenMint: dupMint.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([dupMint])
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
        .verifyCustody(Array.from(custodyProofHash))
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
          .verifyCustody(Array.from(Buffer.alloc(32)))
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
      const payer = (provider.wallet as any).payer as Keypair;
      const amount = new anchor.BN(1_000);

      // Create the ATA before minting
      const recipientTokenAccount = await createAssociatedTokenAccount(
        provider.connection,
        payer,
        tokenMint.publicKey,
        authority.publicKey,
      );

      const tx = await program.methods
        .mintTokens(amount, authority.publicKey)
        .accounts({
          authority: authority.publicKey,
          asset: assetPda,
          tokenMint: tokenMint.publicKey,
          recipientToken: recipientTokenAccount,
          ownershipProof: ownershipPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const ownership = await program.account.ownershipProof.fetch(ownershipPda);
      expect(ownership.amount.toNumber()).to.equal(1_000);
      expect(ownership.isActive).to.be.true;
    });
  });

  describe('update_valuation', () => {
    it('should update asset valuation', async () => {
      const newValuation = new anchor.BN(600_000_000);
      const proofHash = Buffer.alloc(32);
      proofHash.fill(0xab);

      const tx = await program.methods
        .updateValuation(newValuation, Array.from(proofHash))
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
      const paymentToken = Keypair.generate().publicKey;
      // Set payment date in the past so dividend is immediately claimable
      const paymentDate = new anchor.BN(Math.floor(Date.now() / 1000) - 1);

      const tx = await program.methods
        .distributeDividend({
          amountPerToken: new anchor.BN(5_000),
          totalAmount: new anchor.BN(5_000_000),
          paymentToken,
          recordDate,
          paymentDate,
        })
        .accounts({
          authority: authority.publicKey,
          asset: assetPda,
          dividend: dividendPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const dividend = await program.account.dividend.fetch(dividendPda);
      expect(dividend.amountPerToken.toNumber()).to.equal(5_000);
      expect(dividend.status).to.deep.equal({ payable: {} });
    });

    it('should claim a dividend', async () => {
      const tx = await program.methods
        .claimDividend()
        .accounts({
          owner: authority.publicKey,
          asset: assetPda,
          ownershipProof: ownershipPda,
          dividend: dividendPda,
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
      // Use the ATA that was created in the mint_tokens test
      const recipientTokenAccount = getAssociatedTokenAddressSync(
        tokenMint.publicKey,
        authority.publicKey,
      );

      try {
        await program.methods
          .mintTokens(new anchor.BN(100), authority.publicKey)
          .accounts({
            authority: authority.publicKey,
            asset: assetPda,
            tokenMint: tokenMint.publicKey,
            recipientToken: recipientTokenAccount,
            ownershipProof: ownershipPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
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
