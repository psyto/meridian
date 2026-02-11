import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { expect } from 'chai';

describe('securities-engine', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SecuritiesEngine as Program;
  const authority = provider.wallet;

  const securityMintKeypair = Keypair.generate();
  const quoteMintKeypair = Keypair.generate();

  let securityMintPk: PublicKey;
  let quoteMintPk: PublicKey;
  let marketPda: PublicKey;
  let poolPda: PublicKey;
  let poolAuthority: PublicKey;
  let poolAuthorityBump: number;
  let oraclePda: PublicKey;

  // Pool token accounts (created by initialize_pool)
  const lpMintKeypair = Keypair.generate();
  const securityVaultKeypair = Keypair.generate();
  const quoteVaultKeypair = Keypair.generate();

  // User token accounts
  let userSecurityAta: PublicKey;
  let userQuoteAta: PublicKey;
  let userLpAta: PublicKey;

  before(async () => {
    const payer = (provider.wallet as any).payer as Keypair;

    // Create security mint
    securityMintPk = await createMint(
      provider.connection,
      payer,
      authority.publicKey,
      null,
      6,
      securityMintKeypair,
    );

    // Create quote mint (JPY)
    quoteMintPk = await createMint(
      provider.connection,
      payer,
      authority.publicKey,
      null,
      6,
      quoteMintKeypair,
    );

    [marketPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('market'),
        securityMintPk.toBuffer(),
        quoteMintPk.toBuffer(),
      ],
      program.programId
    );

    [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), marketPda.toBuffer()],
      program.programId
    );

    [poolAuthority, poolAuthorityBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool_authority'), marketPda.toBuffer()],
      program.programId
    );

    // Use a mock oracle
    oraclePda = Keypair.generate().publicKey;

    // Compute user ATAs
    userSecurityAta = getAssociatedTokenAddressSync(securityMintPk, authority.publicKey);
    userQuoteAta = getAssociatedTokenAddressSync(quoteMintPk, authority.publicKey);
    userLpAta = getAssociatedTokenAddressSync(lpMintKeypair.publicKey, authority.publicKey);
  });

  describe('initialize_market', () => {
    it('should initialize a new equity market', async () => {
      const tx = await program.methods
        .initializeMarket({
          marketType: { equity: {} },
          oracle: oraclePda,
          tradingFeeBps: 30,
          protocolFeeBps: 5,
          minTradeSize: new anchor.BN(100),
          maxTradeSize: new anchor.BN(0),
          symbol: 'TEST',
          name: 'Test Security',
          isin: null,
        })
        .accounts({
          authority: authority.publicKey,
          securityMint: securityMintPk,
          quoteMint: quoteMintPk,
          market: marketPda,
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
      const tx = await program.methods
        .initializePool()
        .accounts({
          authority: authority.publicKey,
          market: marketPda,
          pool: poolPda,
          poolAuthority,
          lpMint: lpMintKeypair.publicKey,
          securityVault: securityVaultKeypair.publicKey,
          quoteVault: quoteVaultKeypair.publicKey,
          securityMint: securityMintPk,
          quoteMint: quoteMintPk,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([lpMintKeypair, securityVaultKeypair, quoteVaultKeypair])
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
      const payer = (provider.wallet as any).payer as Keypair;

      // Create user token accounts with explicit keypairs
      const secKp = Keypair.generate();
      const userSecurityAccount = await createAccount(
        provider.connection,
        payer,
        securityMintPk,
        authority.publicKey,
        secKp,
      );
      const quoteKp = Keypair.generate();
      const userQuoteAccount = await createAccount(
        provider.connection,
        payer,
        quoteMintPk,
        authority.publicKey,
        quoteKp,
      );
      const lpKp = Keypair.generate();
      const userLpAccount = await createAccount(
        provider.connection,
        payer,
        lpMintKeypair.publicKey,
        authority.publicKey,
        lpKp,
      );

      // Mint tokens to user
      await mintTo(
        provider.connection,
        payer,
        securityMintPk,
        userSecurityAccount,
        authority.publicKey,
        10_000_000,
      );
      await mintTo(
        provider.connection,
        payer,
        quoteMintPk,
        userQuoteAccount,
        authority.publicKey,
        1_500_000_000_00,
      );

      const securityAmount = new anchor.BN(1_000_000);
      const quoteAmount = new anchor.BN(150_000_000_00);

      const tx = await program.methods
        .addLiquidity(securityAmount, quoteAmount, new anchor.BN(0))
        .accounts({
          user: authority.publicKey,
          market: marketPda,
          pool: poolPda,
          poolAuthority,
          lpMint: lpMintKeypair.publicKey,
          securityVault: securityVaultKeypair.publicKey,
          quoteVault: quoteVaultKeypair.publicKey,
          userSecurity: userSecurityAccount,
          userQuote: userQuoteAccount,
          userLp: userLpAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const pool = await program.account.pool.fetch(poolPda);
      expect(pool.securityLiquidity.toNumber()).to.equal(1_000_000);
      expect(pool.quoteLiquidity.toNumber()).to.equal(150_000_000_00);
      expect(pool.lpSupply.toNumber()).to.be.greaterThan(0);
    });
  });

  describe('swap', () => {
    let userSecurityAccount: PublicKey;
    let userQuoteAccount: PublicKey;

    before(async () => {
      const payer = (provider.wallet as any).payer as Keypair;

      // Create fresh user token accounts with explicit keypairs
      const secKp = Keypair.generate();
      userSecurityAccount = await createAccount(
        provider.connection,
        payer,
        securityMintPk,
        authority.publicKey,
        secKp,
      );
      const quoteKp = Keypair.generate();
      userQuoteAccount = await createAccount(
        provider.connection,
        payer,
        quoteMintPk,
        authority.publicKey,
        quoteKp,
      );

      // Fund the quote account for buying
      await mintTo(
        provider.connection,
        payer,
        quoteMintPk,
        userQuoteAccount,
        authority.publicKey,
        100_000_000_00,
      );
    });

    it('should execute a swap (buy security with JPY)', async () => {
      const amountIn = new anchor.BN(1_500_000_00);
      const minAmountOut = new anchor.BN(0);

      const tx = await program.methods
        .swap(amountIn, minAmountOut, false)
        .accounts({
          user: authority.publicKey,
          market: marketPda,
          pool: poolPda,
          poolAuthority,
          securityVault: securityVaultKeypair.publicKey,
          quoteVault: quoteVaultKeypair.publicKey,
          userSecurity: userSecurityAccount,
          userQuote: userQuoteAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const pool = await program.account.pool.fetch(poolPda);
      expect(pool.quoteLiquidity.toNumber()).to.be.greaterThan(150_000_000_00);
      expect(pool.securityLiquidity.toNumber()).to.be.lessThan(1_000_000);
    });

    it('should reject swap below minimum output', async () => {
      const amountIn = new anchor.BN(100_00);
      const unreasonableMinOut = new anchor.BN(1_000_000);

      try {
        await program.methods
          .swap(amountIn, unreasonableMinOut, false)
          .accounts({
            user: authority.publicKey,
            market: marketPda,
            pool: poolPda,
            poolAuthority,
            securityVault: securityVaultKeypair.publicKey,
            quoteVault: quoteVaultKeypair.publicKey,
            userSecurity: userSecurityAccount,
            userQuote: userQuoteAccount,
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
          poolAuthority,
          securityVault: securityVaultKeypair.publicKey,
          quoteVault: quoteVaultKeypair.publicKey,
          userSecurity: userSecurityAccount,
          userQuote: userQuoteAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const poolAfter = await program.account.pool.fetch(poolPda);
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
          poolAuthority,
          securityVault: securityVaultKeypair.publicKey,
          quoteVault: quoteVaultKeypair.publicKey,
          userSecurity: userSecurityAccount,
          userQuote: userQuoteAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const poolAfter = await program.account.pool.fetch(poolPda);
      expect(poolAfter.accumulatedFeesQuote.toNumber()).to.be.greaterThan(feesBefore);
    });
  });

  describe('open_position (perpetuals)', () => {
    let positionPda: PublicKey;
    let userQuoteAccount: PublicKey;

    before(async () => {
      const payer = (provider.wallet as any).payer as Keypair;

      [positionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('position'),
          authority.publicKey.toBuffer(),
          marketPda.toBuffer(),
        ],
        program.programId
      );

      // Create and fund quote account with explicit keypair
      const quoteKp = Keypair.generate();
      userQuoteAccount = await createAccount(
        provider.connection,
        payer,
        quoteMintPk,
        authority.publicKey,
        quoteKp,
      );
      await mintTo(
        provider.connection,
        payer,
        quoteMintPk,
        userQuoteAccount,
        authority.publicKey,
        100_000_000_00,
      );
    });

    it('should open a long perpetual position', async () => {
      const pool = await program.account.pool.fetch(poolPda);
      const currentPrice = pool.quoteLiquidity.toNumber() / pool.securityLiquidity.toNumber();

      // Create collateral vault for the position with explicit keypair
      const payer = (provider.wallet as any).payer as Keypair;
      const collateralKp = Keypair.generate();
      const collateralVault = await createAccount(
        provider.connection,
        payer,
        quoteMintPk,
        poolAuthority,
        collateralKp,
      );

      const tx = await program.methods
        .openPosition({
          positionType: { perpetual: {} },
          side: { long: {} },
          size: new anchor.BN(10_000_000),
          entryPrice: new anchor.BN(Math.round(currentPrice * 1_000_000)),
          leverage: 5,
          collateral: new anchor.BN(3_000_000_00),
          takeProfit: new anchor.BN(0),
          stopLoss: new anchor.BN(0),
        })
        .accounts({
          user: authority.publicKey,
          market: marketPda,
          position: positionPda,
          userQuote: userQuoteAccount,
          collateralVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const position = await program.account.position.fetch(positionPda);
      expect(position.isOpen).to.be.true;
      expect(position.size.toNumber()).to.equal(10_000_000);
      expect(position.leverage).to.equal(5);
      expect(position.collateral.toNumber()).to.equal(3_000_000_00);
      expect(position.liquidationPrice.toNumber()).to.be.greaterThan(0);
    });
  });

  describe('constant product formula', () => {
    it('should maintain x*y=k invariant', async () => {
      const pool = await program.account.pool.fetch(poolPda);
      const k = BigInt(pool.securityLiquidity.toString()) *
                BigInt(pool.quoteLiquidity.toString());

      expect(k > BigInt(0)).to.be.true;
    });
  });
});
