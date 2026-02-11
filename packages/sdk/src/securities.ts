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

export enum MarketStatus {
  Active = 0,
  Paused = 1,
  Settling = 2,
  Closed = 3,
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
  status: MarketStatus;
  oracle: PublicKey;
  tradingFeeBps: number;
  protocolFeeBps: number;
  minTradeSize: BN;
  maxTradeSize: BN;
  totalVolume: BN;
  totalFees: BN;
  volume24h: BN;
  volume24hReset: BN;
  symbol: string;
  name: string;
  isin: Uint8Array | null;
  isActive: boolean;
  createdAt: BN;
  bump: number;
}

export interface Pool {
  market: PublicKey;
  securityLiquidity: BN;
  quoteLiquidity: BN;
  lpMint: PublicKey;
  lpSupply: BN;
  authority: PublicKey;
  securityVault: PublicKey;
  quoteVault: PublicKey;
  accumulatedFeesSecurity: BN;
  accumulatedFeesQuote: BN;
  twap: BN;
  twapLastUpdate: BN;
  cumulativePrice: BN;
  kLast: BN;
  isActive: boolean;
  createdAt: BN;
  bump: number;
  authorityBump: number;
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

      return this.deserializeMarket(accountInfo.data as Buffer);
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

      return this.deserializePool(accountInfo.data as Buffer);
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

  private deserializeMarket(data: Buffer): Market | null {
    try {
      let offset = 8; // skip discriminator

      const authority = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const securityMint = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const quoteMint = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const marketType = data[offset] as MarketType;
      offset += 1;

      const status = data[offset] as MarketStatus;
      offset += 1;

      const oracle = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const tradingFeeBps = data.readUInt16LE(offset);
      offset += 2;

      const protocolFeeBps = data.readUInt16LE(offset);
      offset += 2;

      const minTradeSize = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const maxTradeSize = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const totalVolume = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const totalFees = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const volume24h = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const volume24hReset = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      // String: 4-byte length prefix + UTF-8 data
      const symbolLen = data.readUInt32LE(offset);
      offset += 4;
      const symbol = data.subarray(offset, offset + symbolLen).toString('utf8');
      offset += symbolLen;

      const nameLen = data.readUInt32LE(offset);
      offset += 4;
      const name = data.subarray(offset, offset + nameLen).toString('utf8');
      offset += nameLen;

      // Option<[u8; 12]>
      const hasIsin = data[offset] === 1;
      offset += 1;
      const isin = hasIsin
        ? new Uint8Array(data.subarray(offset, offset + 12))
        : null;
      offset += 12;

      const isActive = data[offset] === 1;
      offset += 1;

      const createdAt = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const bump = data[offset];

      return {
        authority,
        securityMint,
        quoteMint,
        marketType,
        status,
        oracle,
        tradingFeeBps,
        protocolFeeBps,
        minTradeSize,
        maxTradeSize,
        totalVolume,
        totalFees,
        volume24h,
        volume24hReset,
        symbol,
        name,
        isin,
        isActive,
        createdAt,
        bump,
      };
    } catch {
      return null;
    }
  }

  private deserializePool(data: Buffer): Pool | null {
    try {
      let offset = 8; // skip discriminator

      const market = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const securityLiquidity = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const quoteLiquidity = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const lpMint = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const lpSupply = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const authority = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const securityVault = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const quoteVault = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const accumulatedFeesSecurity = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const accumulatedFeesQuote = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const twap = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const twapLastUpdate = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const cumulativePrice = new BN(data.subarray(offset, offset + 16), 'le');
      offset += 16;

      const kLast = new BN(data.subarray(offset, offset + 16), 'le');
      offset += 16;

      const isActive = data[offset] === 1;
      offset += 1;

      const createdAt = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const bump = data[offset];
      offset += 1;

      const authorityBump = data[offset];

      return {
        market,
        securityLiquidity,
        quoteLiquidity,
        lpMint,
        lpSupply,
        authority,
        securityVault,
        quoteVault,
        accumulatedFeesSecurity,
        accumulatedFeesQuote,
        twap,
        twapLastUpdate,
        cumulativePrice,
        kLast,
        isActive,
        createdAt,
        bump,
        authorityBump,
      };
    } catch {
      return null;
    }
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
