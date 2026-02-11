import { describe, it, expect } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { MeridianClient, DEFAULT_PROGRAM_IDS } from '../client';
import { SecuritiesSdk, Pool, Side } from '../securities';

function makeSdk() {
  const client = new MeridianClient({
    connection: { commitment: 'confirmed' } as unknown as Connection,
  });
  return new SecuritiesSdk(client);
}

function makePool(overrides?: Partial<Pool>): Pool {
  return {
    market: PublicKey.unique(),
    securityLiquidity: new BN(1_000_000),
    quoteLiquidity: new BN(1_000_000),
    lpMint: PublicKey.unique(),
    lpSupply: new BN(1_000_000),
    twap: new BN(1_000_000),
    isActive: true,
    ...overrides,
  };
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
});
