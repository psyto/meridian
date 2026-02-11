import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  JupiterAggregator,
  RouteOptimizer,
  createJupiterAggregator,
} from '../aggregator';
import { mockQuoteResponse } from './helpers';
import type { SwapResponse } from '../types';

describe('JupiterAggregator', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function mockFetchOk(data: unknown) {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    } as Response);
  }

  function mockFetchError(status: number, body: string) {
    fetchSpy.mockResolvedValue({
      ok: false,
      status,
      text: () => Promise.resolve(body),
    } as Response);
  }

  describe('constructor', () => {
    it('uses default config values', () => {
      const agg = new JupiterAggregator();
      // Verify defaults by testing that a getQuote call uses the default base URL
      const quote = mockQuoteResponse();
      mockFetchOk(quote);

      agg.getQuote({
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('https://quote-api.jup.ag/v6/quote');
      expect(url).toContain('slippageBps=50');
    });

    it('respects config overrides', () => {
      const agg = new JupiterAggregator({
        apiBaseUrl: 'https://custom-api.example.com',
        defaultSlippageBps: 100,
      });

      const quote = mockQuoteResponse();
      mockFetchOk(quote);

      agg.getQuote({
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000',
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('https://custom-api.example.com/quote');
      expect(url).toContain('slippageBps=100');
    });
  });

  describe('getQuote', () => {
    it('builds correct URLSearchParams', async () => {
      const quoteData = mockQuoteResponse();
      mockFetchOk(quoteData);

      const agg = new JupiterAggregator();
      await agg.getQuote({
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000',
      });

      const url = new URL(fetchSpy.mock.calls[0][0] as string);
      expect(url.searchParams.get('inputMint')).toBe('So11111111111111111111111111111111111111112');
      expect(url.searchParams.get('outputMint')).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(url.searchParams.get('amount')).toBe('1000000');
      expect(url.searchParams.get('slippageBps')).toBe('50');
    });

    it('sets optional params when provided', async () => {
      const quoteData = mockQuoteResponse();
      mockFetchOk(quoteData);

      const agg = new JupiterAggregator();
      await agg.getQuote({
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000',
        slippageBps: 25,
        onlyDirectRoutes: true,
        maxAccounts: 10,
      });

      const url = new URL(fetchSpy.mock.calls[0][0] as string);
      expect(url.searchParams.get('slippageBps')).toBe('25');
      expect(url.searchParams.get('onlyDirectRoutes')).toBe('true');
      expect(url.searchParams.get('maxAccounts')).toBe('10');
    });

    it('returns parsed JSON response', async () => {
      const quoteData = mockQuoteResponse();
      mockFetchOk(quoteData);

      const agg = new JupiterAggregator();
      const result = await agg.getQuote({
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000',
      });

      expect(result.inAmount).toBe('1000000');
      expect(result.outAmount).toBe('985000');
      expect(result.routePlan).toHaveLength(2);
    });

    it('throws on non-ok response', async () => {
      mockFetchError(500, 'Internal Server Error');

      const agg = new JupiterAggregator();
      await expect(
        agg.getQuote({
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: '1000000',
        })
      ).rejects.toThrow('Jupiter API error (500)');
    });
  });

  describe('getSwapTransaction', () => {
    it('POSTs correct body and returns SwapResponse', async () => {
      const swapResponse: SwapResponse = {
        swapTransaction: 'base64encodedtx==',
        lastValidBlockHeight: 123456,
        prioritizationFeeLamports: 5000,
      };
      mockFetchOk(swapResponse);

      const agg = new JupiterAggregator();
      const quote = mockQuoteResponse();
      const result = await agg.getSwapTransaction({
        quoteResponse: quote,
        userPublicKey: 'So11111111111111111111111111111111111111112',
      });

      expect(result.swapTransaction).toBe('base64encodedtx==');
      expect(result.lastValidBlockHeight).toBe(123456);

      // Verify POST body
      const [url, init] = fetchSpy.mock.calls[0];
      expect((url as string)).toContain('/swap');
      expect(init!.method).toBe('POST');
      const body = JSON.parse(init!.body as string);
      expect(body.userPublicKey).toBe('So11111111111111111111111111111111111111112');
      expect(body.wrapAndUnwrapSol).toBe(true);
      expect(body.dynamicComputeUnitLimit).toBe(true);
      expect(body.prioritizationFeeLamports).toBe('auto');
    });
  });

  describe('getBestRoute', () => {
    it('returns analyzed SwapRoute with correct fields', async () => {
      const quote = mockQuoteResponse();
      mockFetchOk(quote);

      const agg = new JupiterAggregator();
      const route = await agg.getBestRoute({
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        amount: '1000000',
      });

      expect(route).not.toBeNull();
      expect(route!.quote).toEqual(quote);
      expect(route!.steps).toHaveLength(2);
      expect(route!.steps[0].dex).toBe('Orca');
      expect(route!.steps[0].fee).toBe('3000');
      expect(route!.steps[1].dex).toBe('Raydium');
      // totalFee = 3000 + 2500 = 5500
      expect(route!.totalFee).toBe('5500');
      expect(route!.priceImpact).toBe(0.15);
      // effectivePrice = 985000 * 1000000 / 1000000 / 1000000 = 0.985
      expect(route!.effectivePrice).toBe(0.985);
    });

    it('returns null on fetch error', async () => {
      mockFetchError(500, 'error');

      const agg = new JupiterAggregator();
      const route = await agg.getBestRoute({
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        amount: '1000000',
      });

      expect(route).toBeNull();
    });
  });

  describe('getQuotes', () => {
    it('fetches multiple amounts and filters out failures', async () => {
      const quote1 = mockQuoteResponse({ inAmount: '1000000' });
      const quote2 = mockQuoteResponse({ inAmount: '2000000' });

      let callCount = 0;
      fetchSpy.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          // second call fails
          return { ok: false, status: 500, text: () => Promise.resolve('err') } as Response;
        }
        const data = callCount === 1 ? quote1 : quote2;
        return {
          ok: true,
          json: () => Promise.resolve(data),
        } as Response;
      });

      const agg = new JupiterAggregator();
      const results = await agg.getQuotes(
        'So11111111111111111111111111111111111111112',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        ['1000000', '2000000', '3000000']
      );

      // 1 fails, 2 succeed
      expect(results).toHaveLength(2);
    });
  });
});

describe('RouteOptimizer', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('findOptimalRoute', () => {
    it('returns multi-hop when it has better output', async () => {
      const directQuote = mockQuoteResponse({ outAmount: '980000' });
      const multiHopQuote = mockQuoteResponse({ outAmount: '990000' });

      let callIdx = 0;
      fetchSpy.mockImplementation(async (url) => {
        callIdx++;
        const urlStr = url instanceof Request ? url.url : url.toString();
        const data = urlStr.includes('onlyDirectRoutes=true') ? directQuote : multiHopQuote;
        return {
          ok: true,
          json: () => Promise.resolve(data),
        } as Response;
      });

      const optimizer = new RouteOptimizer();
      const result = await optimizer.findOptimalRoute(
        'So11111111111111111111111111111111111111112',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        '1000000'
      );

      expect(result).not.toBeNull();
      expect(result!.quote.outAmount).toBe('990000');
    });

    it('returns direct route when it has better output', async () => {
      const directQuote = mockQuoteResponse({ outAmount: '995000' });
      const multiHopQuote = mockQuoteResponse({ outAmount: '990000' });

      fetchSpy.mockImplementation(async (url) => {
        const urlStr = url instanceof Request ? url.url : url.toString();
        const data = urlStr.includes('onlyDirectRoutes=true') ? directQuote : multiHopQuote;
        return {
          ok: true,
          json: () => Promise.resolve(data),
        } as Response;
      });

      const optimizer = new RouteOptimizer();
      const result = await optimizer.findOptimalRoute(
        'So11111111111111111111111111111111111111112',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        '1000000'
      );

      expect(result).not.toBeNull();
      expect(result!.quote.outAmount).toBe('995000');
    });

    it('returns null when both routes fail', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      } as Response);

      const optimizer = new RouteOptimizer();
      const result = await optimizer.findOptimalRoute(
        'So11111111111111111111111111111111111111112',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        '1000000'
      );

      expect(result).toBeNull();
    });
  });

  describe('checkPriceImpact', () => {
    it('returns acceptable when impact <= threshold', async () => {
      const quote = mockQuoteResponse({ priceImpactPct: '0.5' });
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(quote),
      } as Response);

      const optimizer = new RouteOptimizer();
      const result = await optimizer.checkPriceImpact(
        'So11111111111111111111111111111111111111112',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        '1000000',
        1.0
      );

      expect(result.acceptable).toBe(true);
      expect(result.priceImpact).toBe(0.5);
      expect(result.quote).not.toBeNull();
    });

    it('returns not acceptable when impact > threshold', async () => {
      const quote = mockQuoteResponse({ priceImpactPct: '2.5' });
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(quote),
      } as Response);

      const optimizer = new RouteOptimizer();
      const result = await optimizer.checkPriceImpact(
        'So11111111111111111111111111111111111111112',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        '1000000',
        1.0
      );

      expect(result.acceptable).toBe(false);
      expect(result.priceImpact).toBe(2.5);
    });

    it('returns not acceptable with Infinity on fetch error', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      } as Response);

      const optimizer = new RouteOptimizer();
      const result = await optimizer.checkPriceImpact(
        'So11111111111111111111111111111111111111112',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        '1000000'
      );

      expect(result.acceptable).toBe(false);
      expect(result.priceImpact).toBe(Infinity);
      expect(result.quote).toBeNull();
    });
  });

  describe('getAggregator', () => {
    it('returns the underlying JupiterAggregator instance', () => {
      const optimizer = new RouteOptimizer();
      expect(optimizer.getAggregator()).toBeInstanceOf(JupiterAggregator);
    });
  });
});

describe('createJupiterAggregator', () => {
  it('returns a JupiterAggregator instance', () => {
    const agg = createJupiterAggregator();
    expect(agg).toBeInstanceOf(JupiterAggregator);
  });

  it('passes config through', () => {
    const agg = createJupiterAggregator({ apiBaseUrl: 'https://custom.example.com' });
    expect(agg).toBeInstanceOf(JupiterAggregator);
  });
});
