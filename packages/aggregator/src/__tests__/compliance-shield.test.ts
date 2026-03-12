import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { ComplianceShieldRouter, createComplianceShieldRouter } from '../compliance-shield';
import { JupiterAggregator } from '../jupiter';
import type { QuoteResponse, SwapRoute, RouteStep } from '../types';

function makeQuoteResponse(overrides?: Partial<QuoteResponse>): QuoteResponse {
  return {
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    inAmount: '1000000',
    outAmount: '950000',
    otherAmountThreshold: '945000',
    swapMode: 'ExactIn',
    slippageBps: 50,
    priceImpactPct: '0.12',
    routePlan: [
      {
        swapInfo: {
          ammKey: 'amm123',
          label: 'Raydium',
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          inAmount: '1000000',
          outAmount: '950000',
          feeAmount: '3000',
          feeMint: 'So11111111111111111111111111111111111111112',
        },
        percent: 100,
      },
    ],
    contextSlot: 12345,
    timeTaken: 0.5,
    ...overrides,
  };
}

function makeSwapRoute(outAmount: string, opts?: { priceImpact?: string; ammKey?: string }): SwapRoute {
  const priceImpact = opts?.priceImpact ?? '0.1';
  const ammKey = opts?.ammKey ?? 'amm123';
  const quote = makeQuoteResponse({
    outAmount,
    priceImpactPct: priceImpact,
    routePlan: [
      {
        swapInfo: {
          ammKey,
          label: 'Raydium',
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          inAmount: '1000000',
          outAmount,
          feeAmount: '3000',
          feeMint: 'So11111111111111111111111111111111111111112',
        },
        percent: 100,
      },
    ],
  });
  return {
    quote,
    steps: [
      {
        dex: 'Raydium',
        inputMint: quote.inputMint,
        outputMint: quote.outputMint,
        inputAmount: quote.inAmount,
        outputAmount: outAmount,
        fee: '3000',
      },
    ],
    totalFee: '3000',
    priceImpact: parseFloat(priceImpact),
    effectivePrice: Number(BigInt(outAmount) * BigInt(1_000_000) / BigInt(quote.inAmount)) / 1_000_000,
  };
}

function makeMultiHopSwapRoute(
  outAmount: string,
  ammKeys: string[],
  priceImpact: string = '0.1'
): SwapRoute {
  const routePlan = ammKeys.map((ammKey, i) => ({
    swapInfo: {
      ammKey,
      label: `DEX${i}`,
      inputMint: 'mintA',
      outputMint: 'mintB',
      inAmount: '1000000',
      outAmount,
      feeAmount: '1000',
      feeMint: 'mintA',
    },
    percent: Math.floor(100 / ammKeys.length),
  }));

  const quote = makeQuoteResponse({
    outAmount,
    priceImpactPct: priceImpact,
    routePlan,
  });

  return {
    quote,
    steps: routePlan.map((step) => ({
      dex: step.swapInfo.label,
      inputMint: step.swapInfo.inputMint,
      outputMint: step.swapInfo.outputMint,
      inputAmount: step.swapInfo.inAmount,
      outputAmount: step.swapInfo.outAmount,
      fee: step.swapInfo.feeAmount,
    })),
    totalFee: (1000 * ammKeys.length).toString(),
    priceImpact: parseFloat(priceImpact),
    effectivePrice: Number(BigInt(outAmount) * BigInt(1_000_000) / BigInt('1000000')) / 1_000_000,
  };
}

describe('ComplianceShieldRouter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getBestQuote', () => {
    it('returns compliant-only when compliant route is better', async () => {
      const compliantRoute = makeSwapRoute('960000', { ammKey: 'compliant-amm' });
      const unrestrictedRoute = makeSwapRoute('950000', { ammKey: 'any-amm' });

      const router = new ComplianceShieldRouter({
        compliantPoolKeys: new Set(['compliant-amm']),
      });

      const agg = router.getAggregator();
      // getBestRoute is called twice in parallel: once for compliant (multi-hop),
      // and once for unrestricted. The compliant path also tries direct if multi-hop fails.
      vi.spyOn(agg, 'getBestRoute')
        .mockResolvedValueOnce(compliantRoute)   // compliant multi-hop
        .mockResolvedValueOnce(unrestrictedRoute); // unrestricted

      const result = await router.getBestQuote({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000000',
      });

      expect(result.isShielded).toBe(false);
      expect(result.strategy).toBe('compliant-only');
      expect(result.quote.outAmount).toBe('960000');
      expect(result.improvementBps).toBe(0);
    });

    it('returns shielded when unrestricted is significantly better (exceeds slippage threshold)', async () => {
      // Compliant gives 900000, unrestricted gives 1000000 => ~11% improvement => 1111 bps
      const compliantRoute = makeSwapRoute('900000', { ammKey: 'compliant-amm' });
      const unrestrictedRoute = makeSwapRoute('1000000', { ammKey: 'any-amm' });

      const router = new ComplianceShieldRouter({
        compliantPoolKeys: new Set(['compliant-amm']),
        policy: { slippageThresholdBps: 100 }, // 1% threshold
      });

      const agg = router.getAggregator();
      vi.spyOn(agg, 'getBestRoute')
        .mockResolvedValueOnce(compliantRoute)
        .mockResolvedValueOnce(unrestrictedRoute);

      const result = await router.getBestQuote({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000000',
      });

      expect(result.isShielded).toBe(true);
      expect(result.strategy).toBe('shielded');
      expect(result.quote.outAmount).toBe('1000000');
      expect(result.compliantQuote).not.toBeNull();
      expect(result.compliantQuote!.outAmount).toBe('900000');
      expect(result.improvementBps).toBeGreaterThan(100);
    });

    it('returns shielded when compliant impact exceeds threshold', async () => {
      // Compliant route has 3% price impact (exceeds 2% default threshold)
      const compliantRoute = makeSwapRoute('950000', { ammKey: 'compliant-amm', priceImpact: '3.0' });
      const unrestrictedRoute = makeSwapRoute('955000', { ammKey: 'any-amm', priceImpact: '0.1' });

      const router = new ComplianceShieldRouter({
        compliantPoolKeys: new Set(['compliant-amm']),
      });

      const agg = router.getAggregator();
      vi.spyOn(agg, 'getBestRoute')
        .mockResolvedValueOnce(compliantRoute)
        .mockResolvedValueOnce(unrestrictedRoute);

      const result = await router.getBestQuote({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000000',
      });

      expect(result.isShielded).toBe(true);
      expect(result.strategy).toBe('shielded');
    });

    it('uses compliant when improvement below minimum', async () => {
      // Unrestricted is barely better (< 0.1% improvement)
      const compliantRoute = makeSwapRoute('1000000', { ammKey: 'compliant-amm' });
      const unrestrictedRoute = makeSwapRoute('1000005', { ammKey: 'any-amm' }); // 0.0005% improvement

      const router = new ComplianceShieldRouter({
        compliantPoolKeys: new Set(['compliant-amm']),
        policy: { minImprovementPct: 0.1 },
      });

      const agg = router.getAggregator();
      vi.spyOn(agg, 'getBestRoute')
        .mockResolvedValueOnce(compliantRoute)
        .mockResolvedValueOnce(unrestrictedRoute);

      const result = await router.getBestQuote({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000000',
      });

      expect(result.isShielded).toBe(false);
      expect(result.strategy).toBe('compliant-only');
    });

    it('throws when no route available', async () => {
      const router = new ComplianceShieldRouter();
      const agg = router.getAggregator();
      vi.spyOn(agg, 'getBestRoute').mockResolvedValue(null);

      await expect(
        router.getBestQuote({
          inputMint: 'mintA',
          outputMint: 'mintB',
          amount: '1000000',
        })
      ).rejects.toThrow('No route available for this swap');
    });

    it('handles only compliant route available (no unrestricted)', async () => {
      const compliantRoute = makeSwapRoute('950000', { ammKey: 'compliant-amm' });

      const router = new ComplianceShieldRouter({
        compliantPoolKeys: new Set(['compliant-amm']),
      });

      const agg = router.getAggregator();
      vi.spyOn(agg, 'getBestRoute')
        .mockResolvedValueOnce(compliantRoute)  // compliant multi-hop
        .mockResolvedValueOnce(null);            // unrestricted fails

      const result = await router.getBestQuote({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000000',
      });

      expect(result.isShielded).toBe(false);
      expect(result.strategy).toBe('direct-compliant');
      expect(result.compliantQuote).toBeNull();
      expect(result.quote.outAmount).toBe('950000');
    });

    it('handles only unrestricted route available (no compliant)', async () => {
      const unrestrictedRoute = makeSwapRoute('950000', { ammKey: 'non-compliant-amm' });

      const router = new ComplianceShieldRouter({
        compliantPoolKeys: new Set(['compliant-amm']),
      });

      const agg = router.getAggregator();
      // compliant multi-hop returns non-compliant pool
      vi.spyOn(agg, 'getBestRoute')
        .mockResolvedValueOnce(unrestrictedRoute)  // compliant multi-hop (not compliant)
        .mockResolvedValueOnce(unrestrictedRoute)  // unrestricted
        .mockResolvedValueOnce(unrestrictedRoute); // compliant direct fallback (also not compliant)

      const result = await router.getBestQuote({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000000',
      });

      expect(result.isShielded).toBe(true);
      expect(result.strategy).toBe('shielded');
      expect(result.compliantQuote).toBeNull();
    });
  });

  describe('getCompliantQuote', () => {
    it('filters by compliant pool keys', async () => {
      const compliantRoute = makeSwapRoute('950000', { ammKey: 'compliant-amm' });

      const router = new ComplianceShieldRouter({
        compliantPoolKeys: new Set(['compliant-amm']),
      });

      const agg = router.getAggregator();
      vi.spyOn(agg, 'getBestRoute').mockResolvedValueOnce(compliantRoute);

      const result = await router.getCompliantQuote({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000000',
      });

      expect(result).not.toBeNull();
      expect(result!.quote.outAmount).toBe('950000');
    });

    it('falls back to direct routes when multi-hop is non-compliant', async () => {
      const nonCompliantRoute = makeSwapRoute('960000', { ammKey: 'bad-amm' });
      const compliantDirectRoute = makeSwapRoute('940000', { ammKey: 'compliant-amm' });

      const router = new ComplianceShieldRouter({
        compliantPoolKeys: new Set(['compliant-amm']),
      });

      const agg = router.getAggregator();
      vi.spyOn(agg, 'getBestRoute')
        .mockResolvedValueOnce(nonCompliantRoute)     // multi-hop (non-compliant)
        .mockResolvedValueOnce(compliantDirectRoute);  // direct fallback (compliant)

      const result = await router.getCompliantQuote({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000000',
      });

      expect(result).not.toBeNull();
      expect(result!.quote.outAmount).toBe('940000');
    });

    it('returns null when no compliant pools match', async () => {
      const nonCompliantRoute = makeSwapRoute('950000', { ammKey: 'bad-amm' });

      const router = new ComplianceShieldRouter({
        compliantPoolKeys: new Set(['compliant-amm']),
      });

      const agg = router.getAggregator();
      vi.spyOn(agg, 'getBestRoute')
        .mockResolvedValueOnce(nonCompliantRoute)   // multi-hop
        .mockResolvedValueOnce(nonCompliantRoute);  // direct

      const result = await router.getCompliantQuote({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000000',
      });

      expect(result).toBeNull();
    });
  });

  describe('getShieldedQuote', () => {
    it('always returns shielded result', async () => {
      const route = makeSwapRoute('950000', { ammKey: 'any-amm' });

      const router = new ComplianceShieldRouter();
      const agg = router.getAggregator();
      vi.spyOn(agg, 'getBestRoute').mockResolvedValueOnce(route);

      const result = await router.getShieldedQuote({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000000',
      });

      expect(result.isShielded).toBe(true);
      expect(result.strategy).toBe('shielded');
      expect(result.quote.outAmount).toBe('950000');
      expect(result.compliantQuote).toBeNull();
      expect(result.improvementBps).toBe(0);
    });

    it('throws when no route available', async () => {
      const router = new ComplianceShieldRouter();
      const agg = router.getAggregator();
      vi.spyOn(agg, 'getBestRoute').mockResolvedValueOnce(null);

      await expect(
        router.getShieldedQuote({
          inputMint: 'mintA',
          outputMint: 'mintB',
          amount: '1000000',
        })
      ).rejects.toThrow('No route available for this swap');
    });
  });

  describe('isRouteCompliant', () => {
    it('returns true when all hops use compliant pools', () => {
      const router = new ComplianceShieldRouter({
        compliantPoolKeys: new Set(['amm1', 'amm2']),
      });

      const quote = makeQuoteResponse({
        routePlan: [
          {
            swapInfo: {
              ammKey: 'amm1',
              label: 'Raydium',
              inputMint: 'mintA',
              outputMint: 'mintB',
              inAmount: '500000',
              outAmount: '480000',
              feeAmount: '1000',
              feeMint: 'mintA',
            },
            percent: 50,
          },
          {
            swapInfo: {
              ammKey: 'amm2',
              label: 'Orca',
              inputMint: 'mintA',
              outputMint: 'mintB',
              inAmount: '500000',
              outAmount: '475000',
              feeAmount: '1000',
              feeMint: 'mintA',
            },
            percent: 50,
          },
        ],
      });

      expect(router.isRouteCompliant(quote)).toBe(true);
    });

    it('returns false when any hop uses a non-compliant pool', () => {
      const router = new ComplianceShieldRouter({
        compliantPoolKeys: new Set(['amm1']),
      });

      const quote = makeQuoteResponse({
        routePlan: [
          {
            swapInfo: {
              ammKey: 'amm1',
              label: 'Raydium',
              inputMint: 'mintA',
              outputMint: 'mintB',
              inAmount: '500000',
              outAmount: '480000',
              feeAmount: '1000',
              feeMint: 'mintA',
            },
            percent: 50,
          },
          {
            swapInfo: {
              ammKey: 'amm-bad',
              label: 'Unknown',
              inputMint: 'mintA',
              outputMint: 'mintB',
              inAmount: '500000',
              outAmount: '475000',
              feeAmount: '1000',
              feeMint: 'mintA',
            },
            percent: 50,
          },
        ],
      });

      expect(router.isRouteCompliant(quote)).toBe(false);
    });

    it('returns true for empty route plan', () => {
      const router = new ComplianceShieldRouter({
        compliantPoolKeys: new Set(['amm1']),
      });

      const quote = makeQuoteResponse({ routePlan: [] });

      expect(router.isRouteCompliant(quote)).toBe(true);
    });
  });

  describe('updateCompliantPools', () => {
    it('replaces the pool set', () => {
      const router = new ComplianceShieldRouter({
        compliantPoolKeys: new Set(['old-amm']),
      });

      const quoteOld = makeQuoteResponse({
        routePlan: [{
          swapInfo: {
            ammKey: 'old-amm',
            label: 'Raydium',
            inputMint: 'a',
            outputMint: 'b',
            inAmount: '1000',
            outAmount: '900',
            feeAmount: '10',
            feeMint: 'a',
          },
          percent: 100,
        }],
      });

      const quoteNew = makeQuoteResponse({
        routePlan: [{
          swapInfo: {
            ammKey: 'new-amm',
            label: 'Orca',
            inputMint: 'a',
            outputMint: 'b',
            inAmount: '1000',
            outAmount: '900',
            feeAmount: '10',
            feeMint: 'a',
          },
          percent: 100,
        }],
      });

      // Before update: old-amm is compliant, new-amm is not
      expect(router.isRouteCompliant(quoteOld)).toBe(true);
      expect(router.isRouteCompliant(quoteNew)).toBe(false);

      // Update pools
      router.updateCompliantPools(new Set(['new-amm']));

      // After update: old-amm is no longer compliant, new-amm is
      expect(router.isRouteCompliant(quoteOld)).toBe(false);
      expect(router.isRouteCompliant(quoteNew)).toBe(true);
    });
  });

  describe('getPolicy', () => {
    it('returns default policy when none specified', () => {
      const router = new ComplianceShieldRouter();
      const policy = router.getPolicy();

      expect(policy.slippageThresholdBps).toBe(100);
      expect(policy.maxCompliantImpactPct).toBe(2.0);
      expect(policy.minImprovementPct).toBe(0.1);
    });

    it('returns custom policy values', () => {
      const router = new ComplianceShieldRouter({
        policy: {
          slippageThresholdBps: 200,
          maxCompliantImpactPct: 5.0,
        },
      });

      const policy = router.getPolicy();

      expect(policy.slippageThresholdBps).toBe(200);
      expect(policy.maxCompliantImpactPct).toBe(5.0);
      expect(policy.minImprovementPct).toBe(0.1); // default for unspecified
    });

    it('returns a copy that cannot modify internal state', () => {
      const router = new ComplianceShieldRouter();
      const policy1 = router.getPolicy();
      (policy1 as any).slippageThresholdBps = 9999;

      const policy2 = router.getPolicy();
      expect(policy2.slippageThresholdBps).toBe(100);
    });
  });

  describe('getAggregator', () => {
    it('returns the underlying JupiterAggregator instance', () => {
      const router = new ComplianceShieldRouter();
      const agg = router.getAggregator();
      expect(agg).toBeInstanceOf(JupiterAggregator);
    });

    it('returns the same instance on repeated calls', () => {
      const router = new ComplianceShieldRouter();
      expect(router.getAggregator()).toBe(router.getAggregator());
    });
  });

  describe('createComplianceShieldRouter', () => {
    it('returns a ComplianceShieldRouter instance', () => {
      const router = createComplianceShieldRouter();
      expect(router).toBeInstanceOf(ComplianceShieldRouter);
    });

    it('passes config through', () => {
      const router = createComplianceShieldRouter({
        compliantPoolKeys: new Set(['amm1']),
        policy: { slippageThresholdBps: 200 },
      });

      expect(router.getPolicy().slippageThresholdBps).toBe(200);

      const quote = makeQuoteResponse({
        routePlan: [{
          swapInfo: {
            ammKey: 'amm1',
            label: 'Raydium',
            inputMint: 'a',
            outputMint: 'b',
            inAmount: '1000',
            outAmount: '900',
            feeAmount: '10',
            feeMint: 'a',
          },
          percent: 100,
        }],
      });

      expect(router.isRouteCompliant(quote)).toBe(true);
    });
  });
});
