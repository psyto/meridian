import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { MeridianClient } from './client';
import { BN } from '@coral-xyz/anchor';

/**
 * Securities Trading SDK Module
 *
 * Handles spot trading, derivatives, and liquidity provision
 * for tokenized securities markets.
 */

export enum MarketType {
  Equity = 0,
  Rwa = 1,
  Perpetual = 2,
  FundingSwap = 3,
  VarianceSwap = 4,
}

export enum Side {
  Long = 0,
  Short = 1,
}

export interface Market {
  authority: PublicKey;
  securityMint: PublicKey;
  quoteMint: PublicKey;
  marketType: MarketType;
  tradingFeeBps: number;
  protocolFeeBps: number;
  minTradeSize: BN;
  maxTradeSize: BN;
  totalVolume: BN;
  volume24h: BN;
  symbol: string;
  name: string;
  isActive: boolean;
}

export interface Pool {
  market: PublicKey;
  securityLiquidity: BN;
  quoteLiquidity: BN;
  lpMint: PublicKey;
  lpSupply: BN;
  twap: BN;
  isActive: boolean;
}

export interface Position {
  owner: PublicKey;
  market: PublicKey;
  side: Side;
  size: BN;
  entryPrice: BN;
  leverage: number;
  collateral: BN;
  unrealizedPnl: BN;
  liquidationPrice: BN;
  isOpen: boolean;
}

export interface SwapQuote {
  inputAmount: BN;
  outputAmount: BN;
  fee: BN;
  priceImpact: number;
  price: BN;
}

/**
 * Securities Trading SDK
 */
export class SecuritiesSdk {
  private client: MeridianClient;

  constructor(client: MeridianClient) {
    this.client = client;
  }

  /**
   * Get market information
   */
  async getMarket(securityMint: PublicKey, quoteMint: PublicKey): Promise<Market | null> {
    const [marketPda] = this.client.deriveMarketPda(securityMint, quoteMint);

    try {
      const accountInfo = await this.client.connection.getAccountInfo(marketPda);
      if (!accountInfo) return null;

      // Deserialize account data
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get pool information
   */
  async getPool(market: PublicKey): Promise<Pool | null> {
    const [poolPda] = this.client.derivePoolPda(market);

    try {
      const accountInfo = await this.client.connection.getAccountInfo(poolPda);
      if (!accountInfo) return null;

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Calculate swap quote
   */
  async getSwapQuote(
    market: PublicKey,
    inputAmount: BN,
    isSecurityInput: boolean
  ): Promise<SwapQuote | null> {
    const pool = await this.getPool(market);
    if (!pool) return null;

    const marketData = await this.client.connection.getAccountInfo(market);
    if (!marketData) return null;

    // Calculate using constant product formula
    const inputReserve = isSecurityInput
      ? pool.securityLiquidity
      : pool.quoteLiquidity;
    const outputReserve = isSecurityInput
      ? pool.quoteLiquidity
      : pool.securityLiquidity;

    const feeBps = 30; // Default fee, should get from market
    const fee = inputAmount.muln(feeBps).divn(10000);
    const inputWithFee = inputAmount.sub(fee);

    const numerator = inputWithFee.mul(outputReserve);
    const denominator = inputReserve.add(inputWithFee);
    const outputAmount = numerator.div(denominator);

    // Calculate price impact
    const spotPrice = outputReserve.muln(1_000_000).div(inputReserve);
    const effectivePrice = outputAmount.muln(1_000_000).div(inputAmount);
    const priceImpact = spotPrice.sub(effectivePrice).abs().muln(10000).div(spotPrice).toNumber();

    return {
      inputAmount,
      outputAmount,
      fee,
      priceImpact: priceImpact / 100, // Convert to percentage
      price: effectivePrice,
    };
  }

  /**
   * Create swap instruction
   */
  createSwapInstruction(
    user: PublicKey,
    market: PublicKey,
    _amountIn: BN,
    _minAmountOut: BN,
    _isSecurityInput: boolean
  ): TransactionInstruction {
    const [poolPda] = this.client.derivePoolPda(market);

    const data = Buffer.alloc(8 + 8 + 8 + 1);
    // discriminator + amountIn + minAmountOut + isSecurityInput

    return new TransactionInstruction({
      keys: [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: market, isSigner: false, isWritable: true },
        { pubkey: poolPda, isSigner: false, isWritable: true },
        // Additional accounts...
      ],
      programId: this.client.programIds.securitiesEngine,
      data,
    });
  }

  /**
   * Create add liquidity instruction
   */
  createAddLiquidityInstruction(
    user: PublicKey,
    market: PublicKey,
    _securityAmount: BN,
    _quoteAmount: BN,
    _minLpTokens: BN
  ): TransactionInstruction {
    const [poolPda] = this.client.derivePoolPda(market);

    const data = Buffer.alloc(8 + 8 + 8 + 8);

    return new TransactionInstruction({
      keys: [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: market, isSigner: false, isWritable: false },
        { pubkey: poolPda, isSigner: false, isWritable: true },
        // Additional accounts...
      ],
      programId: this.client.programIds.securitiesEngine,
      data,
    });
  }

  /**
   * Create open position instruction (for perpetuals)
   */
  createOpenPositionInstruction(
    user: PublicKey,
    market: PublicKey,
    _side: Side,
    _size: BN,
    _leverage: number,
    _collateral: BN
  ): TransactionInstruction {
    const data = Buffer.alloc(8 + 1 + 8 + 1 + 8);

    return new TransactionInstruction({
      keys: [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: market, isSigner: false, isWritable: false },
        // Additional accounts...
      ],
      programId: this.client.programIds.securitiesEngine,
      data,
    });
  }

  /**
   * Calculate LP tokens for adding liquidity
   */
  calculateLpTokens(
    pool: Pool,
    securityAmount: BN,
    quoteAmount: BN
  ): BN {
    if (pool.lpSupply.isZero()) {
      // Initial liquidity: sqrt(security * quote)
      const product = securityAmount.mul(quoteAmount);
      return new BN(Math.floor(Math.sqrt(product.toNumber())));
    }

    const securityRatio = securityAmount.mul(pool.lpSupply).div(pool.securityLiquidity);
    const quoteRatio = quoteAmount.mul(pool.lpSupply).div(pool.quoteLiquidity);

    return BN.min(securityRatio, quoteRatio);
  }

  /**
   * Format price for display
   */
  formatPrice(price: BN, decimals: number = 6): string {
    const divisor = new BN(10).pow(new BN(decimals));
    const intPart = price.div(divisor);
    const decPart = price.mod(divisor).toString().padStart(decimals, '0');
    return `${intPart.toString()}.${decPart.slice(0, 4)}`;
  }
}

/**
 * Create Securities SDK instance
 */
export function createSecuritiesSdk(client: MeridianClient): SecuritiesSdk {
  return new SecuritiesSdk(client);
}
