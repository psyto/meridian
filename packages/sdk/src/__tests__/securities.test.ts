import { describe, it, expect, vi } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { MeridianClient, DEFAULT_PROGRAM_IDS } from '../client';
import { SecuritiesSdk, Pool, Side, MarketType, MarketStatus } from '../securities';

function makeSdk(getAccountInfoMock?: ReturnType<typeof vi.fn>) {
  const connection = {
    commitment: 'confirmed',
    getAccountInfo: getAccountInfoMock ?? vi.fn().mockResolvedValue(null),
  } as unknown as Connection;
  const client = new MeridianClient({ connection });
  return new SecuritiesSdk(client);
}

function makePool(overrides?: Partial<Pool>): Pool {
  return {
    market: PublicKey.unique(),
    securityLiquidity: new BN(1_000_000),
    quoteLiquidity: new BN(1_000_000),
    lpMint: PublicKey.unique(),
    lpSupply: new BN(1_000_000),
    authority: PublicKey.unique(),
    securityVault: PublicKey.unique(),
    quoteVault: PublicKey.unique(),
    accumulatedFeesSecurity: new BN(0),
    accumulatedFeesQuote: new BN(0),
    twap: new BN(1_000_000),
    twapLastUpdate: new BN(0),
    cumulativePrice: new BN(0),
    kLast: new BN(0),
    isActive: true,
    createdAt: new BN(0),
    bump: 255,
    authorityBump: 254,
    ...overrides,
  };
}

function serializeMarket(fields: {
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
}): Buffer {
  const symbolBytes = Buffer.from(fields.symbol, 'utf8');
  const nameBytes = Buffer.from(fields.name, 'utf8');
  const size = 8 + 32 * 4 + 1 + 1 + 2 + 2 + 8 * 6 + 4 + symbolBytes.length + 4 + nameBytes.length + 1 + 12 + 1 + 8 + 1;
  const buf = Buffer.alloc(size);
  let offset = 8;

  fields.authority.toBuffer().copy(buf, offset); offset += 32;
  fields.securityMint.toBuffer().copy(buf, offset); offset += 32;
  fields.quoteMint.toBuffer().copy(buf, offset); offset += 32;
  buf[offset] = fields.marketType; offset += 1;
  buf[offset] = fields.status; offset += 1;
  fields.oracle.toBuffer().copy(buf, offset); offset += 32;
  buf.writeUInt16LE(fields.tradingFeeBps, offset); offset += 2;
  buf.writeUInt16LE(fields.protocolFeeBps, offset); offset += 2;
  buf.set(fields.minTradeSize.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.maxTradeSize.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.totalVolume.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.totalFees.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.volume24h.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.volume24hReset.toArrayLike(Buffer, 'le', 8), offset); offset += 8;

  buf.writeUInt32LE(symbolBytes.length, offset); offset += 4;
  symbolBytes.copy(buf, offset); offset += symbolBytes.length;

  buf.writeUInt32LE(nameBytes.length, offset); offset += 4;
  nameBytes.copy(buf, offset); offset += nameBytes.length;

  if (fields.isin) {
    buf[offset] = 1; offset += 1;
    buf.set(fields.isin, offset); offset += 12;
  } else {
    buf[offset] = 0; offset += 1;
    offset += 12;
  }

  buf[offset] = fields.isActive ? 1 : 0; offset += 1;
  buf.set(fields.createdAt.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf[offset] = fields.bump;

  return buf;
}

function serializePool(fields: {
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
}): Buffer {
  // 8 disc + 32 + 8+8 + 32 + 8 + 32*3 + 8*4 + 16*2 + 1 + 8 + 1 + 1
  const size = 8 + 32 + 8 + 8 + 32 + 8 + 32 * 3 + 8 * 4 + 16 * 2 + 1 + 8 + 1 + 1;
  const buf = Buffer.alloc(size);
  let offset = 8;

  fields.market.toBuffer().copy(buf, offset); offset += 32;
  buf.set(fields.securityLiquidity.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.quoteLiquidity.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  fields.lpMint.toBuffer().copy(buf, offset); offset += 32;
  buf.set(fields.lpSupply.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  fields.authority.toBuffer().copy(buf, offset); offset += 32;
  fields.securityVault.toBuffer().copy(buf, offset); offset += 32;
  fields.quoteVault.toBuffer().copy(buf, offset); offset += 32;
  buf.set(fields.accumulatedFeesSecurity.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.accumulatedFeesQuote.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.twap.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.twapLastUpdate.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.cumulativePrice.toArrayLike(Buffer, 'le', 16), offset); offset += 16;
  buf.set(fields.kLast.toArrayLike(Buffer, 'le', 16), offset); offset += 16;
  buf[offset] = fields.isActive ? 1 : 0; offset += 1;
  buf.set(fields.createdAt.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf[offset] = fields.bump; offset += 1;
  buf[offset] = fields.authorityBump;

  return buf;
}

describe('SecuritiesSdk', () => {
  describe('calculateLpTokens', () => {
    it('returns sqrt(security * quote) for initial liquidity (zero lpSupply)', () => {
      const sdk = makeSdk();
      const pool = makePool({ lpSupply: new BN(0) });

      const result = sdk.calculateLpTokens(pool, new BN(10000), new BN(40000));
      // sqrt(10000 * 40000) = sqrt(400_000_000) = 20000
      expect(result.eq(new BN(20000))).toBe(true);
    });

    it('returns min of ratios for existing pool', () => {
      const sdk = makeSdk();
      const pool = makePool({
        securityLiquidity: new BN(1000),
        quoteLiquidity: new BN(2000),
        lpSupply: new BN(500),
      });

      // securityRatio = 100 * 500 / 1000 = 50
      // quoteRatio = 200 * 500 / 2000 = 50
      const result = sdk.calculateLpTokens(pool, new BN(100), new BN(200));
      expect(result.eq(new BN(50))).toBe(true);
    });

    it('returns the smaller ratio when amounts are imbalanced', () => {
      const sdk = makeSdk();
      const pool = makePool({
        securityLiquidity: new BN(1000),
        quoteLiquidity: new BN(2000),
        lpSupply: new BN(500),
      });

      // securityRatio = 100 * 500 / 1000 = 50
      // quoteRatio = 100 * 500 / 2000 = 25
      const result = sdk.calculateLpTokens(pool, new BN(100), new BN(100));
      expect(result.eq(new BN(25))).toBe(true);
    });

    it('handles zero security amount', () => {
      const sdk = makeSdk();
      const pool = makePool();

      const result = sdk.calculateLpTokens(pool, new BN(0), new BN(1000));
      expect(result.eq(new BN(0))).toBe(true);
    });
  });

  describe('formatPrice', () => {
    it('formats with default 6 decimals showing 4', () => {
      const sdk = makeSdk();
      // 1_500_000 with 6 decimals = 1.500000 → "1.5000"
      expect(sdk.formatPrice(new BN(1_500_000))).toBe('1.5000');
    });

    it('formats zero price', () => {
      const sdk = makeSdk();
      expect(sdk.formatPrice(new BN(0))).toBe('0.0000');
    });

    it('formats with custom decimals', () => {
      const sdk = makeSdk();
      // 150 with 2 decimals = 1.50 → "1.50" (shows first 4 chars of decimal, but only 2 available)
      expect(sdk.formatPrice(new BN(150), 2)).toBe('1.50');
    });

    it('formats large prices', () => {
      const sdk = makeSdk();
      // 123_456_789 with 6 decimals = 123.456789 → "123.4567"
      expect(sdk.formatPrice(new BN(123_456_789))).toBe('123.4567');
    });
  });

  describe('createSwapInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const user = PublicKey.unique();
      const market = PublicKey.unique();

      const ix = sdk.createSwapInstruction(user, market, new BN(1000), new BN(900), true);

      expect(ix.programId.equals(
        DEFAULT_PROGRAM_IDS.securitiesEngine
      )).toBe(true);
    });

    it('includes user as signer and market/pool as writable', () => {
      const sdk = makeSdk();
      const user = PublicKey.unique();
      const market = PublicKey.unique();

      const ix = sdk.createSwapInstruction(user, market, new BN(1000), new BN(900), true);

      const userKey = ix.keys.find((k) => k.pubkey.equals(user));
      expect(userKey).toBeDefined();
      expect(userKey!.isSigner).toBe(true);

      const marketKey = ix.keys.find((k) => k.pubkey.equals(market));
      expect(marketKey).toBeDefined();
      expect(marketKey!.isWritable).toBe(true);
    });

    it('includes pool PDA in keys', () => {
      const sdk = makeSdk();
      const user = PublicKey.unique();
      const market = PublicKey.unique();

      const ix = sdk.createSwapInstruction(user, market, new BN(1000), new BN(900), true);

      // Should have at least 3 keys: user, market, pool
      expect(ix.keys.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('createAddLiquidityInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const user = PublicKey.unique();
      const market = PublicKey.unique();

      const ix = sdk.createAddLiquidityInstruction(
        user, market, new BN(1000), new BN(1000), new BN(900)
      );

      expect(ix.programId.equals(
        DEFAULT_PROGRAM_IDS.securitiesEngine
      )).toBe(true);
    });

    it('includes user as signer and pool as writable', () => {
      const sdk = makeSdk();
      const user = PublicKey.unique();
      const market = PublicKey.unique();

      const ix = sdk.createAddLiquidityInstruction(
        user, market, new BN(1000), new BN(1000), new BN(900)
      );

      const userKey = ix.keys.find((k) => k.pubkey.equals(user));
      expect(userKey).toBeDefined();
      expect(userKey!.isSigner).toBe(true);

      // Pool PDA should be writable
      const poolKey = ix.keys[2]; // 3rd key is pool
      expect(poolKey.isWritable).toBe(true);
    });
  });

  describe('createOpenPositionInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const user = PublicKey.unique();
      const market = PublicKey.unique();

      const ix = sdk.createOpenPositionInstruction(
        user, market, Side.Long, new BN(1000), 5, new BN(200)
      );

      expect(ix.programId.equals(
        DEFAULT_PROGRAM_IDS.securitiesEngine
      )).toBe(true);
    });

    it('includes user as signer', () => {
      const sdk = makeSdk();
      const user = PublicKey.unique();
      const market = PublicKey.unique();

      const ix = sdk.createOpenPositionInstruction(
        user, market, Side.Short, new BN(500), 3, new BN(100)
      );

      const userKey = ix.keys.find((k) => k.pubkey.equals(user));
      expect(userKey).toBeDefined();
      expect(userKey!.isSigner).toBe(true);
    });

    it('includes market in accounts', () => {
      const sdk = makeSdk();
      const user = PublicKey.unique();
      const market = PublicKey.unique();

      const ix = sdk.createOpenPositionInstruction(
        user, market, Side.Long, new BN(1000), 5, new BN(200)
      );

      const marketKey = ix.keys.find((k) => k.pubkey.equals(market));
      expect(marketKey).toBeDefined();
    });
  });

  describe('getMarket', () => {
    it('deserializes a Market buffer', async () => {
      const fields = {
        authority: PublicKey.unique(),
        securityMint: PublicKey.unique(),
        quoteMint: PublicKey.unique(),
        marketType: MarketType.Equity,
        status: MarketStatus.Active,
        oracle: PublicKey.unique(),
        tradingFeeBps: 30,
        protocolFeeBps: 10,
        minTradeSize: new BN(1000),
        maxTradeSize: new BN(1_000_000_000),
        totalVolume: new BN(500_000_000),
        totalFees: new BN(150_000),
        volume24h: new BN(10_000_000),
        volume24hReset: new BN(1700000000),
        symbol: 'TSLA',
        name: 'Tesla Inc',
        isin: new Uint8Array([85, 83, 56, 56, 49, 54, 48, 82, 49, 48, 49, 52]),
        isActive: true,
        createdAt: new BN(1699000000),
        bump: 252,
      };

      const data = serializeMarket(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.getMarket(fields.securityMint, fields.quoteMint);

      expect(result).not.toBeNull();
      expect(result!.authority.equals(fields.authority)).toBe(true);
      expect(result!.securityMint.equals(fields.securityMint)).toBe(true);
      expect(result!.quoteMint.equals(fields.quoteMint)).toBe(true);
      expect(result!.marketType).toBe(MarketType.Equity);
      expect(result!.status).toBe(MarketStatus.Active);
      expect(result!.oracle.equals(fields.oracle)).toBe(true);
      expect(result!.tradingFeeBps).toBe(30);
      expect(result!.protocolFeeBps).toBe(10);
      expect(result!.minTradeSize.eq(fields.minTradeSize)).toBe(true);
      expect(result!.maxTradeSize.eq(fields.maxTradeSize)).toBe(true);
      expect(result!.totalVolume.eq(fields.totalVolume)).toBe(true);
      expect(result!.totalFees.eq(fields.totalFees)).toBe(true);
      expect(result!.volume24h.eq(fields.volume24h)).toBe(true);
      expect(result!.volume24hReset.eq(fields.volume24hReset)).toBe(true);
      expect(result!.symbol).toBe('TSLA');
      expect(result!.name).toBe('Tesla Inc');
      expect(result!.isin).not.toBeNull();
      expect(Buffer.from(result!.isin!).toString()).toBe('US88160R1014');
      expect(result!.isActive).toBe(true);
      expect(result!.createdAt.eq(fields.createdAt)).toBe(true);
      expect(result!.bump).toBe(252);
    });

    it('deserializes a Market with no ISIN', async () => {
      const fields = {
        authority: PublicKey.unique(),
        securityMint: PublicKey.unique(),
        quoteMint: PublicKey.unique(),
        marketType: MarketType.Perpetual,
        status: MarketStatus.Paused,
        oracle: PublicKey.unique(),
        tradingFeeBps: 50,
        protocolFeeBps: 20,
        minTradeSize: new BN(100),
        maxTradeSize: new BN(100_000),
        totalVolume: new BN(0),
        totalFees: new BN(0),
        volume24h: new BN(0),
        volume24hReset: new BN(0),
        symbol: 'BTC-PERP',
        name: 'Bitcoin Perp',
        isin: null,
        isActive: false,
        createdAt: new BN(1699000000),
        bump: 251,
      };

      const data = serializeMarket(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.getMarket(fields.securityMint, fields.quoteMint);

      expect(result).not.toBeNull();
      expect(result!.isin).toBeNull();
      expect(result!.status).toBe(MarketStatus.Paused);
      expect(result!.isActive).toBe(false);
    });

    it('returns null when account does not exist', async () => {
      const mock = vi.fn().mockResolvedValue(null);
      const sdk = makeSdk(mock);

      const result = await sdk.getMarket(PublicKey.unique(), PublicKey.unique());
      expect(result).toBeNull();
    });
  });

  describe('getPool', () => {
    it('deserializes a Pool buffer', async () => {
      const fields = {
        market: PublicKey.unique(),
        securityLiquidity: new BN(2_000_000),
        quoteLiquidity: new BN(3_000_000),
        lpMint: PublicKey.unique(),
        lpSupply: new BN(2_449_489),
        authority: PublicKey.unique(),
        securityVault: PublicKey.unique(),
        quoteVault: PublicKey.unique(),
        accumulatedFeesSecurity: new BN(5000),
        accumulatedFeesQuote: new BN(7500),
        twap: new BN(1_500_000),
        twapLastUpdate: new BN(1700000000),
        cumulativePrice: new BN('100000000000000000000'),
        kLast: new BN('6000000000000'),
        isActive: true,
        createdAt: new BN(1699000000),
        bump: 250,
        authorityBump: 249,
      };

      const data = serializePool(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.getPool(fields.market);

      expect(result).not.toBeNull();
      expect(result!.market.equals(fields.market)).toBe(true);
      expect(result!.securityLiquidity.eq(fields.securityLiquidity)).toBe(true);
      expect(result!.quoteLiquidity.eq(fields.quoteLiquidity)).toBe(true);
      expect(result!.lpMint.equals(fields.lpMint)).toBe(true);
      expect(result!.lpSupply.eq(fields.lpSupply)).toBe(true);
      expect(result!.authority.equals(fields.authority)).toBe(true);
      expect(result!.securityVault.equals(fields.securityVault)).toBe(true);
      expect(result!.quoteVault.equals(fields.quoteVault)).toBe(true);
      expect(result!.accumulatedFeesSecurity.eq(fields.accumulatedFeesSecurity)).toBe(true);
      expect(result!.accumulatedFeesQuote.eq(fields.accumulatedFeesQuote)).toBe(true);
      expect(result!.twap.eq(fields.twap)).toBe(true);
      expect(result!.twapLastUpdate.eq(fields.twapLastUpdate)).toBe(true);
      expect(result!.cumulativePrice.eq(fields.cumulativePrice)).toBe(true);
      expect(result!.kLast.eq(fields.kLast)).toBe(true);
      expect(result!.isActive).toBe(true);
      expect(result!.createdAt.eq(fields.createdAt)).toBe(true);
      expect(result!.bump).toBe(250);
      expect(result!.authorityBump).toBe(249);
    });

    it('returns null when account does not exist', async () => {
      const mock = vi.fn().mockResolvedValue(null);
      const sdk = makeSdk(mock);

      const result = await sdk.getPool(PublicKey.unique());
      expect(result).toBeNull();
    });
  });
});
