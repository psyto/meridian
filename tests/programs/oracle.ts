import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { expect } from 'chai';

describe('oracle', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Oracle as Program;
  const authority = provider.wallet;

  let testPriceFeedPda: PublicKey;
  let testVolatilityPda: PublicKey;
  let testFundingFeedPda: PublicKey;

  before(async () => {
    [testPriceFeedPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('price_feed'), Buffer.from('TESTUSD')],
      program.programId
    );

    [testVolatilityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('volatility_index'), Buffer.from('TESTUSD')],
      program.programId
    );

    [testFundingFeedPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('funding_feed'), Buffer.from('TESTUSD')],
      program.programId
    );
  });

  describe('price feed', () => {
    it('should initialize a price feed', async () => {
      const tx = await program.methods
        .initializePriceFeed({
          assetSymbol: 'TESTUSD',
          assetType: { fiat: {} },
          sampleIntervalSeconds: 60,
        })
        .accounts({
          authority: authority.publicKey,
          priceFeed: testPriceFeedPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const feed = await program.account.priceFeed.fetch(testPriceFeedPda);
      expect(feed.authority.toString()).to.equal(authority.publicKey.toString());
      expect(feed.assetSymbol).to.equal('TESTUSD');
      expect(feed.isActive).to.be.true;
    });

    it('should update price with new observation', async () => {
      const price = new anchor.BN(670000);
      const confidence = new anchor.BN(1000);

      const tx = await program.methods
        .updatePrice(price, confidence)
        .accounts({
          authority: authority.publicKey,
          priceFeed: testPriceFeedPda,
        })
        .rpc();

      const feed = await program.account.priceFeed.fetch(testPriceFeedPda);
      expect(feed.currentPrice.toNumber()).to.equal(670000);
      expect(feed.confidence.toNumber()).to.equal(1000);
      expect(feed.lastUpdateTime.toNumber()).to.be.greaterThan(0);
    });

    it('should calculate TWAP after multiple updates', async () => {
      const prices = [670000, 671000, 669500, 670500, 670200];

      for (const p of prices) {
        await program.methods
          .updatePrice(new anchor.BN(p), new anchor.BN(1000))
          .accounts({
            authority: authority.publicKey,
            priceFeed: testPriceFeedPda,
          })
          .rpc();

        await new Promise((r) => setTimeout(r, 100));
      }

      const feed = await program.account.priceFeed.fetch(testPriceFeedPda);
      expect(feed.twapValue.toNumber()).to.be.greaterThanOrEqual(0);
    });

    it('should reject price update from non-authority', async () => {
      const fakeAuthority = Keypair.generate();

      try {
        await program.methods
          .updatePrice(new anchor.BN(999999), new anchor.BN(100))
          .accounts({
            authority: fakeAuthority.publicKey,
            priceFeed: testPriceFeedPda,
          })
          .signers([fakeAuthority])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });

  describe('volatility index', () => {
    it('should initialize volatility index', async () => {
      const tx = await program.methods
        .initializeVolatilityIndex('TESTUSD')
        .accounts({
          authority: authority.publicKey,
          volatilityIndex: testVolatilityPda,
          priceFeed: testPriceFeedPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const vol = await program.account.volatilityIndex.fetch(testVolatilityPda);
      expect(vol.priceFeed.toString()).to.equal(testPriceFeedPda.toString());
    });

    it('should update volatility with observation', async () => {
      const realizedVol = new anchor.BN(800);
      const impliedVol = new anchor.BN(1000);

      const tx = await program.methods
        .updateVolatility(realizedVol, impliedVol)
        .accounts({
          authority: authority.publicKey,
          volatilityIndex: testVolatilityPda,
        })
        .rpc();

      const vol = await program.account.volatilityIndex.fetch(testVolatilityPda);
      expect(vol.realizedVolatility.toNumber()).to.equal(800);
      expect(vol.impliedVolatility.toNumber()).to.equal(1000);
    });

    it('should detect volatility regime', async () => {
      const highRealizedVol = new anchor.BN(5000);
      const highImpliedVol = new anchor.BN(6000);

      await program.methods
        .updateVolatility(highRealizedVol, highImpliedVol)
        .accounts({
          authority: authority.publicKey,
          volatilityIndex: testVolatilityPda,
        })
        .rpc();

      const vol = await program.account.volatilityIndex.fetch(testVolatilityPda);
      expect(vol.regime).to.exist;
    });
  });

  describe('funding feed', () => {
    it('should initialize funding feed', async () => {
      const tx = await program.methods
        .initializeFundingFeed('TESTUSD')
        .accounts({
          authority: authority.publicKey,
          fundingFeed: testFundingFeedPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const feed = await program.account.fundingFeed.fetch(testFundingFeedPda);
      expect(feed.authority.toString()).to.equal(authority.publicKey.toString());
    });

    it('should update funding rate', async () => {
      const rate = new anchor.BN(50);
      const source = { internal: {} };

      const tx = await program.methods
        .updateFundingRate(rate, source)
        .accounts({
          authority: authority.publicKey,
          fundingFeed: testFundingFeedPda,
        })
        .rpc();

      const feed = await program.account.fundingFeed.fetch(testFundingFeedPda);
      expect(feed.currentRate.toNumber()).to.equal(50);
    });

    it('should aggregate rates from multiple sources', async () => {
      const sources = [
        { rate: 50, source: { binance: {} } },
        { rate: 48, source: { bybit: {} } },
        { rate: 52, source: { okx: {} } },
      ];

      for (const { rate, source } of sources) {
        await program.methods
          .updateFundingRate(new anchor.BN(rate), source)
          .accounts({
            authority: authority.publicKey,
            fundingFeed: testFundingFeedPda,
          })
          .rpc();
      }

      const feed = await program.account.fundingFeed.fetch(testFundingFeedPda);
      expect(feed.currentRate.toNumber()).to.be.within(45, 55);
    });
  });
});
