import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { RouteOptimizer } from '../router';
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

function makeSwapRoute(outAmount: string, priceImpact: string = '0.1'): SwapRoute {
  const quote = makeQuoteResponse({ outAmount, priceImpactPct: priceImpact });
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

describe('RouteOptimizer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('findOptimalRoute', () => {
    it('returns the multi-hop route when it has better output', async () => {
      const directRoute = makeSwapRoute('900000');
      const multiHopRoute = makeSwapRoute('950000');

      const optimizer = new RouteOptimizer();
      vi.spyOn(optimizer.getAggregator(), 'getBestRoute')
        .mockResolvedValueOnce(directRoute)   // direct
        .mockResolvedValueOnce(multiHopRoute); // multi-hop

      const result = await optimizer.findOptimalRoute('mintA', 'mintB', '1000000');

      expect(result).toBe(multiHopRoute);
    });

    it('returns the direct route when it has better output', async () => {
      const directRoute = makeSwapRoute('960000');
      const multiHopRoute = makeSwapRoute('950000');

      const optimizer = new RouteOptimizer();
      vi.spyOn(optimizer.getAggregator(), 'getBestRoute')
        .mockResolvedValueOnce(directRoute)
        .mockResolvedValueOnce(multiHopRoute);

      const result = await optimizer.findOptimalRoute('mintA', 'mintB', '1000000');

      expect(result).toBe(directRoute);
    });

    it('returns direct route when multi-hop returns null', async () => {
      const directRoute = makeSwapRoute('950000');

      const optimizer = new RouteOptimizer();
      vi.spyOn(optimizer.getAggregator(), 'getBestRoute')
        .mockResolvedValueOnce(directRoute)
        .mockResolvedValueOnce(null);

      const result = await optimizer.findOptimalRoute('mintA', 'mintB', '1000000');

      expect(result).toBe(directRoute);
    });

    it('returns multi-hop route when direct returns null', async () => {
      const multiHopRoute = makeSwapRoute('950000');

      const optimizer = new RouteOptimizer();
      vi.spyOn(optimizer.getAggregator(), 'getBestRoute')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(multiHopRoute);

      const result = await optimizer.findOptimalRoute('mintA', 'mintB', '1000000');

      expect(result).toBe(multiHopRoute);
    });

    it('returns null when both routes fail', async () => {
      const optimizer = new RouteOptimizer();
      vi.spyOn(optimizer.getAggregator(), 'getBestRoute')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await optimizer.findOptimalRoute('mintA', 'mintB', '1000000');

      expect(result).toBeNull();
    });

    it('passes slippageBps to both route requests', async () => {
      const optimizer = new RouteOptimizer();
      const spy = vi.spyOn(optimizer.getAggregator(), 'getBestRoute')
        .mockResolvedValue(null);

      await optimizer.findOptimalRoute('mintA', 'mintB', '1000', {
        slippageBps: 100,
      });

      // First call is direct route
      expect(spy.mock.calls[0][0]).toMatchObject({
        slippageBps: 100,
        onlyDirectRoutes: true,
      });
      // Second call is multi-hop
      expect(spy.mock.calls[1][0]).toMatchObject({
        slippageBps: 100,
        onlyDirectRoutes: false,
      });
    });

    it('accepts PublicKey objects', async () => {
      const optimizer = new RouteOptimizer();
      const spy = vi.spyOn(optimizer.getAggregator(), 'getBestRoute')
        .mockResolvedValue(null);

      const inputMint = PublicKey.unique();
      const outputMint = PublicKey.unique();

      await optimizer.findOptimalRoute(inputMint, outputMint, '1000');

      expect(spy.mock.calls[0][0].inputMint).toBe(inputMint);
      expect(spy.mock.calls[0][0].outputMint).toBe(outputMint);
    });
  });

  describe('checkPriceImpact', () => {
    it('returns acceptable when impact is below threshold', async () => {
      const quote = makeQuoteResponse({ priceImpactPct: '0.5' });
      const optimizer = new RouteOptimizer();
      vi.spyOn(optimizer.getAggregator(), 'getQuote').mockResolvedValue(quote);

      const result = await optimizer.checkPriceImpact('mintA', 'mintB', '1000', 1.0);

      expect(result.acceptable).toBe(true);
      expect(result.priceImpact).toBe(0.5);
      expect(result.quote).toBe(quote);
    });

    it('returns not acceptable when impact exceeds threshold', async () => {
      const quote = makeQuoteResponse({ priceImpactPct: '2.5' });
      const optimizer = new RouteOptimizer();
      vi.spyOn(optimizer.getAggregator(), 'getQuote').mockResolvedValue(quote);

      const result = await optimizer.checkPriceImpact('mintA', 'mintB', '1000', 1.0);

      expect(result.acceptable).toBe(false);
      expect(result.priceImpact).toBe(2.5);
      expect(result.quote).toBe(quote);
    });

    it('returns acceptable when impact exactly equals threshold', async () => {
      const quote = makeQuoteResponse({ priceImpactPct: '1.0' });
      const optimizer = new RouteOptimizer();
      vi.spyOn(optimizer.getAggregator(), 'getQuote').mockResolvedValue(quote);

      const result = await optimizer.checkPriceImpact('mintA', 'mintB', '1000', 1.0);

      expect(result.acceptable).toBe(true);
      expect(result.priceImpact).toBe(1.0);
    });

    it('uses default 1.0% threshold when not specified', async () => {
      const quote = makeQuoteResponse({ priceImpactPct: '0.8' });
      const optimizer = new RouteOptimizer();
      vi.spyOn(optimizer.getAggregator(), 'getQuote').mockResolvedValue(quote);

      const result = await optimizer.checkPriceImpact('mintA', 'mintB', '1000');

      expect(result.acceptable).toBe(true);
    });

    it('returns not acceptable with Infinity impact on error', async () => {
      const optimizer = new RouteOptimizer();
      vi.spyOn(optimizer.getAggregator(), 'getQuote')
        .mockRejectedValue(new Error('API error'));

      const result = await optimizer.checkPriceImpact('mintA', 'mintB', '1000');

      expect(result.acceptable).toBe(false);
      expect(result.priceImpact).toBe(Infinity);
      expect(result.quote).toBeNull();
    });
  });

  describe('getAggregator', () => {
    it('returns the underlying JupiterAggregator instance', () => {
      const optimizer = new RouteOptimizer();
      const agg = optimizer.getAggregator();
      expect(agg).toBeInstanceOf(JupiterAggregator);
    });

    it('returns the same instance on repeated calls', () => {
      const optimizer = new RouteOptimizer();
      expect(optimizer.getAggregator()).toBe(optimizer.getAggregator());
    });
  });
});
