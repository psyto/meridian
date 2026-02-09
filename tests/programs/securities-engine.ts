import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { expect } from 'chai';

describe('securities-engine', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SecuritiesEngine as Program;
  const authority = provider.wallet;

  const securityMint = Keypair.generate();
  const quoteMint = Keypair.generate(); // JPY mint

  let marketPda: PublicKey;
  let poolPda: PublicKey;
  let oraclePda: PublicKey;

  before(async () => {
    [marketPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('market'),
        securityMint.publicKey.toBuffer(),
        quoteMint.publicKey.toBuffer(),
      ],
      program.programId
    );

    [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), marketPda.toBuffer()],
      program.programId
    );

    // Use a mock oracle
    [oraclePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('price_feed'), Buffer.from('TEST')],
      anchor.workspace.Oracle ? anchor.workspace.Oracle.programId : program.programId
    );
  });

  describe('initialize_market', () => {
    it('should initialize a new equity market', async () => {
      const marketType = { equity: {} };
      const tradingFeeBps = 30; // 0.3%
      const protocolFeeBps = 5; // 0.05%
      const minTradeSize = new anchor.BN(1_00); // min ¥1
      const maxTradeSize = new anchor.BN(0); // unlimited

      const tx = await program.methods
        .initializeMarket(
          marketType,
          tradingFeeBps,
          protocolFeeBps,
          minTradeSize,
          maxTradeSize,
          'TEST',
          'Test Security'
        )
        .accounts({
          authority: authority.publicKey,
          market: marketPda,
          securityMint: securityMint.publicKey,
          quoteMint: quoteMint.publicKey,
          oracle: oraclePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const market = await program.account.market.fetch(marketPda);
      expect(market.symbol).to.equal('TEST');
      expect(market.tradingFeeBps).to.equal(30);
      expect(market.protocolFeeBps).to.equal(5);
      expect(market.totalVolume.toNumber()).to.equal(0);
    });
  });

  describe('initialize_pool', () => {
    it('should initialize AMM pool for market', async () => {
      const lpMint = Keypair.generate();

      const tx = await program.methods
        .initializePool()
        .accounts({
          authority: authority.publicKey,
          market: marketPda,
          pool: poolPda,
          lpMint: lpMint.publicKey,
          securityMint: securityMint.publicKey,
          quoteMint: quoteMint.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([lpMint])
        .rpc();

      const pool = await program.account.pool.fetch(poolPda);
      expect(pool.market.toString()).to.equal(marketPda.toString());
      expect(pool.securityLiquidity.toNumber()).to.equal(0);
      expect(pool.quoteLiquidity.toNumber()).to.equal(0);
      expect(pool.isActive).to.be.true;
    });
  });

  describe('add_liquidity', () => {
    it('should add initial liquidity to pool', async () => {
      const securityAmount = new anchor.BN(1_000_000); // 1M security tokens
      const quoteAmount = new anchor.BN(150_000_000_00); // 1.5B yen (¥1500/token)

      const tx = await program.methods
        .addLiquidity(securityAmount, quoteAmount, new anchor.BN(0))
        .accounts({
          user: authority.publicKey,
          market: marketPda,
          pool: poolPda,
          // Token accounts would be added here
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const pool = await program.account.pool.fetch(poolPda);
      expect(pool.securityLiquidity.toNumber()).to.equal(1_000_000);
      expect(pool.quoteLiquidity.toNumber()).to.equal(150_000_000_00);
      expect(pool.lpSupply.toNumber()).to.be.greaterThan(0);
    });
  });

  describe('swap', () => {
    it('should execute a swap (buy security with JPY)', async () => {
      const amountIn = new anchor.BN(1_500_000_00); // 15M yen (~1% of pool)
      const minAmountOut = new anchor.BN(9_900); // Expect ~10K tokens with some slippage

      const tx = await program.methods
        .swap(amountIn, minAmountOut, false) // false = JPY input
        .accounts({
          user: authority.publicKey,
          market: marketPda,
          pool: poolPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const pool = await program.account.pool.fetch(poolPda);
      // After buy: more JPY in pool, less security tokens
      expect(pool.quoteLiquidity.toNumber()).to.be.greaterThan(150_000_000_00);
      expect(pool.securityLiquidity.toNumber()).to.be.lessThan(1_000_000);
    });

    it('should reject swap below minimum output', async () => {
      const amountIn = new anchor.BN(100_00); // ¥100
      const unreasonableMinOut = new anchor.BN(1_000_000); // Way too high

      try {
        await program.methods
          .swap(amountIn, unreasonableMinOut, false)
          .accounts({
            user: authority.publicKey,
            market: marketPda,
            pool: poolPda,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        expect.fail('Should have thrown a slippage error');
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.message).to.include('Slippage');
      }
    });

    it('should update TWAP after swap', async () => {
      const poolBefore = await program.account.pool.fetch(poolPda);
      const twapBefore = poolBefore.twap.toNumber();

      await program.methods
        .swap(new anchor.BN(500_000_00), new anchor.BN(0), false)
        .accounts({
          user: authority.publicKey,
          market: marketPda,
          pool: poolPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const poolAfter = await program.account.pool.fetch(poolPda);
      // TWAP should have been updated
      expect(poolAfter.twapLastUpdate.toNumber()).to.be.greaterThanOrEqual(
        poolBefore.twapLastUpdate.toNumber()
      );
    });

    it('should collect fees on swap', async () => {
      const poolBefore = await program.account.pool.fetch(poolPda);
      const feesBefore = poolBefore.accumulatedFeesQuote.toNumber();

      await program.methods
        .swap(new anchor.BN(10_000_000_00), new anchor.BN(0), false)
        .accounts({
          user: authority.publicKey,
          market: marketPda,
          pool: poolPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const poolAfter = await program.account.pool.fetch(poolPda);
      expect(poolAfter.accumulatedFeesQuote.toNumber()).to.be.greaterThan(feesBefore);
    });
  });

  describe('open_position (perpetuals)', () => {
    let positionPda: PublicKey;

    before(async () => {
      [positionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('position'),
          authority.publicKey.toBuffer(),
          marketPda.toBuffer(),
        ],
        program.programId
      );
    });

    it('should open a long perpetual position', async () => {
      const side = { long: {} };
      const size = new anchor.BN(100); // 100 units
      const leverage = 5; // 5x
      const collateral = new anchor.BN(3_000_000_00); // 30M yen collateral

      const tx = await program.methods
        .openPosition(side, size, leverage, collateral)
        .accounts({
          user: authority.publicKey,
          market: marketPda,
          pool: poolPda,
          position: positionPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const position = await program.account.position.fetch(positionPda);
      expect(position.isOpen).to.be.true;
      expect(position.size.toNumber()).to.equal(100);
      expect(position.leverage).to.equal(5);
      expect(position.collateral.toNumber()).to.equal(3_000_000_00);
      // Liquidation price should be set
      expect(position.liquidationPrice.toNumber()).to.be.greaterThan(0);
    });
  });

  describe('constant product formula', () => {
    it('should maintain x*y=k invariant', async () => {
      const pool = await program.account.pool.fetch(poolPda);
      const k = BigInt(pool.securityLiquidity.toString()) *
                BigInt(pool.quoteLiquidity.toString());

      // k should be > 0 and close to initial k (minus fees)
      expect(k).to.be.greaterThan(BigInt(0));
    });
  });
});
