import { describe, it, expect, beforeEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { RouteComplianceFilter } from '../route-filter';
import { PoolWhitelistManager } from '../pool-whitelist';
import { PoolStatus, Jurisdiction, KycLevel } from '../types';
import { mockQuoteResponse, mockConnection, AMM_KEY_1, AMM_KEY_2 } from './helpers';

describe('RouteComplianceFilter', () => {
  let whitelist: PoolWhitelistManager;
  let filter: RouteComplianceFilter;

  const AMM_KEY_3 = PublicKey.unique().toBase58();

  beforeEach(() => {
    const conn = mockConnection();
    whitelist = new PoolWhitelistManager(conn, PublicKey.unique(), PublicKey.unique());
    filter = new RouteComplianceFilter(whitelist);
  });

  function addPool(ammKey: string) {
    whitelist.addPool({
      ammKey: new PublicKey(ammKey),
      registry: PublicKey.unique(),
      operator: PublicKey.unique(),
      dexLabel: 'Test',
      status: PoolStatus.Active,
      jurisdiction: Jurisdiction.Japan,
      kycLevel: KycLevel.Basic,
      auditHash: new Uint8Array(32),
      auditExpiry: Math.floor(Date.now() / 1000) + 86400,
      registeredAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    });
  }

  describe('checkRouteCompliance', () => {
    it('returns isCompliant: true when all hops are whitelisted', () => {
      addPool(AMM_KEY_1);
      addPool(AMM_KEY_2);

      const quote = mockQuoteResponse();
      const result = filter.checkRouteCompliance(quote);

      expect(result.isCompliant).toBe(true);
      expect(result.nonCompliantPools).toHaveLength(0);
      expect(result.compliantPools).toEqual([AMM_KEY_1, AMM_KEY_2]);
    });

    it('lists non-compliant pools when some are not whitelisted', () => {
      addPool(AMM_KEY_1);
      // AMM_KEY_2 is not whitelisted

      const quote = mockQuoteResponse();
      const result = filter.checkRouteCompliance(quote);

      expect(result.isCompliant).toBe(false);
      expect(result.nonCompliantPools).toEqual([AMM_KEY_2]);
      expect(result.compliantPools).toEqual([AMM_KEY_1]);
    });

    it('returns isCompliant: true for empty routePlan', () => {
      const quote = mockQuoteResponse({ routePlan: [] });
      const result = filter.checkRouteCompliance(quote);

      expect(result.isCompliant).toBe(true);
      expect(result.nonCompliantPools).toHaveLength(0);
      expect(result.compliantPools).toHaveLength(0);
    });

    it('returns all pools as non-compliant when none are whitelisted', () => {
      const quote = mockQuoteResponse();
      const result = filter.checkRouteCompliance(quote);

      expect(result.isCompliant).toBe(false);
      expect(result.nonCompliantPools).toEqual([AMM_KEY_1, AMM_KEY_2]);
    });
  });

  describe('filterCompliantSteps', () => {
    it('returns original quote when all steps are compliant', () => {
      addPool(AMM_KEY_1);
      addPool(AMM_KEY_2);

      const quote = mockQuoteResponse();
      const result = filter.filterCompliantSteps(quote);

      expect(result).toBe(quote); // same reference
    });

    it('returns null when no steps are compliant', () => {
      const quote = mockQuoteResponse();
      const result = filter.filterCompliantSteps(quote);

      expect(result).toBeNull();
    });

    it('returns null for partial multi-hop compliance (cannot use partial route)', () => {
      addPool(AMM_KEY_1);
      // AMM_KEY_2 not whitelisted → partial compliance

      const quote = mockQuoteResponse();
      const result = filter.filterCompliantSteps(quote);

      expect(result).toBeNull();
    });
  });

  describe('batchCheck', () => {
    it('returns correct Map<string, boolean>', () => {
      addPool(AMM_KEY_1);

      const results = filter.batchCheck([AMM_KEY_1, AMM_KEY_2, AMM_KEY_3]);

      expect(results.get(AMM_KEY_1)).toBe(true);
      expect(results.get(AMM_KEY_2)).toBe(false);
      expect(results.get(AMM_KEY_3)).toBe(false);
      expect(results.size).toBe(3);
    });

    it('returns empty map for empty input', () => {
      const results = filter.batchCheck([]);
      expect(results.size).toBe(0);
    });
  });

  describe('getWhitelist', () => {
    it('returns the injected whitelist manager', () => {
      expect(filter.getWhitelist()).toBe(whitelist);
    });
  });
});
