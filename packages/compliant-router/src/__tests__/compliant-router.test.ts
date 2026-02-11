import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey, Connection } from '@solana/web3.js';
import { ComplianceAwareRouter } from '../compliant-router';
import { JupiterAggregator, RouteOptimizer } from '../aggregator';
import { PoolWhitelistManager } from '../pool-whitelist';
import { KycComplianceChecker } from '../kyc-checker';
import { ZkComplianceProver } from '../zk-compliance';
import { KycLevel, Jurisdiction, PoolStatus } from '../types';
import {
  mockConnection,
  mockQuoteResponse,
  mockWhitelistEntry,
  serializeWhitelistEntry,
  AMM_KEY_1,
  AMM_KEY_2,
} from './helpers';

describe('ComplianceAwareRouter', () => {
  let conn: ReturnType<typeof mockConnection>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const registryAuthority = PublicKey.unique();

  beforeEach(() => {
    conn = mockConnection();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function createRouter(configOverrides = {}) {
    return new ComplianceAwareRouter(
      conn as unknown as Connection,
      registryAuthority,
      configOverrides
    );
  }

  function addPoolToRouter(router: ComplianceAwareRouter, ammKey: string) {
    const wm = router.getWhitelistManager();
    wm.addPool({
      ammKey: new PublicKey(ammKey),
      registry: PublicKey.unique(),
      operator: PublicKey.unique(),
      dexLabel: 'TestDEX',
      status: PoolStatus.Active,
      jurisdiction: Jurisdiction.Japan,
      kycLevel: KycLevel.Basic,
      auditHash: new Uint8Array(32),
      auditExpiry: Math.floor(Date.now() / 1000) + 86400,
      registeredAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    });
  }

  function setupKycPass(wallet: PublicKey) {
    const entry = mockWhitelistEntry({
      wallet,
      kycLevel: KycLevel.Standard,
      jurisdiction: Jurisdiction.Japan,
      isActive: true,
    });
    const buf = serializeWhitelistEntry(entry);
    (conn.getAccountInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: buf,
      executable: false,
      lamports: 0,
      owner: PublicKey.unique(),
    });
  }

  describe('constructor', () => {
    it('uses default program IDs and config', () => {
      const router = createRouter();
      expect(router.getAggregator()).toBeInstanceOf(JupiterAggregator);
      expect(router.getOptimizer()).toBeInstanceOf(RouteOptimizer);
      expect(router.getWhitelistManager()).toBeInstanceOf(PoolWhitelistManager);
      expect(router.getKycChecker()).toBeInstanceOf(KycComplianceChecker);
      expect(router.getZkProver()).toBeInstanceOf(ZkComplianceProver);
    });

    it('respects config overrides', () => {
      const customProgramId = PublicKey.unique();
      const router = createRouter({
        registryProgramId: customProgramId,
        defaultSlippageBps: 100,
        fallbackToDirectRoutes: false,
      });
      expect(router.getWhitelistManager()).toBeInstanceOf(PoolWhitelistManager);
    });
  });

  describe('getCompliantQuote', () => {
    const trader = PublicKey.unique();
    const request = {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      amount: '1000000',
    };

    it('happy path: KYC ok, route compliant → wasFiltered: false', async () => {
      const router = createRouter();
      setupKycPass(trader);
      addPoolToRouter(router, AMM_KEY_1);
      addPoolToRouter(router, AMM_KEY_2);

      const quote = mockQuoteResponse();
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(quote),
      } as Response);

      const result = await router.getCompliantQuote(trader, request);

      expect(result.wasFiltered).toBe(false);
      expect(result.quote).toEqual(quote);
      expect(result.compliantHopCount).toBe(2);
      expect(result.traderKycLevel).toBe(KycLevel.Standard);
      expect(result.traderJurisdiction).toBe(Jurisdiction.Japan);
    });

    it('throws when KYC fails', async () => {
      const router = createRouter();
      (conn.getAccountInfo as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQuoteResponse()),
      } as Response);

      await expect(router.getCompliantQuote(trader, request)).rejects.toThrow(
        'KYC check failed'
      );
    });

    it('fallback succeeds: non-compliant multi-hop → direct route → wasFiltered: true', async () => {
      const router = createRouter({ fallbackToDirectRoutes: true });
      setupKycPass(trader);
      addPoolToRouter(router, AMM_KEY_1);

      const multiHopQuote = mockQuoteResponse();

      const directQuote = mockQuoteResponse({
        routePlan: [
          {
            swapInfo: {
              ammKey: AMM_KEY_1,
              label: 'Orca',
              inputMint: 'So11111111111111111111111111111111111111112',
              outputMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
              inAmount: '1000000',
              outAmount: '980000',
              feeAmount: '3000',
              feeMint: 'So11111111111111111111111111111111111111112',
            },
            percent: 100,
          },
        ],
      });

      let fetchCallCount = 0;
      fetchSpy.mockImplementation(async () => {
        fetchCallCount++;
        const data = fetchCallCount === 1 ? multiHopQuote : directQuote;
        return {
          ok: true,
          json: () => Promise.resolve(data),
        } as Response;
      });

      const result = await router.getCompliantQuote(trader, request);

      expect(result.wasFiltered).toBe(true);
      expect(result.compliantHopCount).toBe(1);
      expect(result.quote.routePlan).toHaveLength(1);
    });

    it('fallback also fails → throws', async () => {
      const router = createRouter({ fallbackToDirectRoutes: true });
      setupKycPass(trader);

      const quote = mockQuoteResponse();
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(quote),
      } as Response);

      await expect(router.getCompliantQuote(trader, request)).rejects.toThrow(
        'No compliant route found'
      );
    });

    it('fallbackToDirectRoutes: false → throws immediately on non-compliant', async () => {
      const router = createRouter({ fallbackToDirectRoutes: false });
      setupKycPass(trader);

      const quote = mockQuoteResponse();
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(quote),
      } as Response);

      await expect(router.getCompliantQuote(trader, request)).rejects.toThrow(
        'No compliant route found'
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('isRouteCompliant', () => {
    it('delegates to the filter', () => {
      const router = createRouter();
      addPoolToRouter(router, AMM_KEY_1);
      addPoolToRouter(router, AMM_KEY_2);

      const quote = mockQuoteResponse();
      const result = router.isRouteCompliant(quote);

      expect(result.isCompliant).toBe(true);
      expect(result.compliantPools).toEqual([AMM_KEY_1, AMM_KEY_2]);
    });
  });

  describe('getters', () => {
    it('getAggregator returns JupiterAggregator', () => {
      expect(createRouter().getAggregator()).toBeInstanceOf(JupiterAggregator);
    });

    it('getOptimizer returns RouteOptimizer', () => {
      expect(createRouter().getOptimizer()).toBeInstanceOf(RouteOptimizer);
    });

    it('getWhitelistManager returns PoolWhitelistManager', () => {
      expect(createRouter().getWhitelistManager()).toBeInstanceOf(PoolWhitelistManager);
    });

    it('getKycChecker returns KycComplianceChecker', () => {
      expect(createRouter().getKycChecker()).toBeInstanceOf(KycComplianceChecker);
    });

    it('getZkProver returns ZkComplianceProver', () => {
      expect(createRouter().getZkProver()).toBeInstanceOf(ZkComplianceProver);
    });
  });
});
