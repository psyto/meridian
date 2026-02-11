import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { JupiterAggregator, createJupiterAggregator } from '../jupiter';
import type { QuoteResponse, SwapResponse } from '../types';

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

function mockFetchOk(data: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response);
}

function mockFetchError(status: number, body: string) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  } as Response);
}

describe('JupiterAggregator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('uses default config values', () => {
      const agg = new JupiterAggregator();
      // Verify defaults are applied by making a request and checking the URL
      const fetchSpy = mockFetchOk(makeQuoteResponse());

      agg.getQuote({
        inputMint: 'mint1',
        outputMint: 'mint2',
        amount: '1000',
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('https://quote-api.jup.ag/v6/quote');
      expect(url).toContain('slippageBps=50');
    });

    it('accepts custom config', () => {
      const agg = new JupiterAggregator({
        apiBaseUrl: 'https://custom.api',
        defaultSlippageBps: 100,
      });

      const fetchSpy = mockFetchOk(makeQuoteResponse());

      agg.getQuote({
        inputMint: 'mint1',
        outputMint: 'mint2',
        amount: '1000',
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('https://custom.api/quote');
      expect(url).toContain('slippageBps=100');
    });
  });

  describe('getQuote', () => {
    it('builds correct URL params from request', async () => {
      const fetchSpy = mockFetchOk(makeQuoteResponse());
      const agg = new JupiterAggregator();

      await agg.getQuote({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '5000',
        slippageBps: 75,
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('inputMint=mintA');
      expect(url).toContain('outputMint=mintB');
      expect(url).toContain('amount=5000');
      expect(url).toContain('slippageBps=75');
    });

    it('uses default slippage when not specified in request', async () => {
      const fetchSpy = mockFetchOk(makeQuoteResponse());
      const agg = new JupiterAggregator({ defaultSlippageBps: 25 });

      await agg.getQuote({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '5000',
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('slippageBps=25');
    });

    it('includes onlyDirectRoutes when set', async () => {
      const fetchSpy = mockFetchOk(makeQuoteResponse());
      const agg = new JupiterAggregator();

      await agg.getQuote({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000',
        onlyDirectRoutes: true,
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('onlyDirectRoutes=true');
    });

    it('includes maxAccounts when set', async () => {
      const fetchSpy = mockFetchOk(makeQuoteResponse());
      const agg = new JupiterAggregator();

      await agg.getQuote({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000',
        maxAccounts: 20,
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('maxAccounts=20');
    });

    it('accepts PublicKey objects as mints', async () => {
      const fetchSpy = mockFetchOk(makeQuoteResponse());
      const agg = new JupiterAggregator();
      const inputMint = PublicKey.unique();
      const outputMint = PublicKey.unique();

      await agg.getQuote({
        inputMint,
        outputMint,
        amount: '1000',
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain(`inputMint=${inputMint.toString()}`);
      expect(url).toContain(`outputMint=${outputMint.toString()}`);
    });

    it('returns parsed QuoteResponse', async () => {
      const expected = makeQuoteResponse();
      mockFetchOk(expected);
      const agg = new JupiterAggregator();

      const result = await agg.getQuote({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000',
      });

      expect(result.inAmount).toBe('1000000');
      expect(result.outAmount).toBe('950000');
      expect(result.routePlan).toHaveLength(1);
    });

    it('throws on API error', async () => {
      mockFetchError(500, 'Internal server error');
      const agg = new JupiterAggregator();

      await expect(
        agg.getQuote({ inputMint: 'a', outputMint: 'b', amount: '1' })
      ).rejects.toThrow('Jupiter API error (500): Internal server error');
    });

    it('throws on 429 rate limit', async () => {
      mockFetchError(429, 'Rate limited');
      const agg = new JupiterAggregator();

      await expect(
        agg.getQuote({ inputMint: 'a', outputMint: 'b', amount: '1' })
      ).rejects.toThrow('Jupiter API error (429)');
    });
  });

  describe('getSwapTransaction', () => {
    it('sends POST with correct body', async () => {
      const swapResponse: SwapResponse = {
        swapTransaction: 'base64tx==',
        lastValidBlockHeight: 99999,
        prioritizationFeeLamports: 5000,
      };
      const fetchSpy = mockFetchOk(swapResponse);
      const agg = new JupiterAggregator();
      const quote = makeQuoteResponse();

      await agg.getSwapTransaction({
        quoteResponse: quote,
        userPublicKey: 'userPubkey123',
      });

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toContain('/swap');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });

      const body = JSON.parse(init?.body as string);
      expect(body.userPublicKey).toBe('userPubkey123');
      expect(body.wrapAndUnwrapSol).toBe(true);
      expect(body.dynamicComputeUnitLimit).toBe(true);
      expect(body.prioritizationFeeLamports).toBe('auto');
    });

    it('respects custom swap params', async () => {
      const swapResponse: SwapResponse = {
        swapTransaction: 'base64tx==',
        lastValidBlockHeight: 99999,
        prioritizationFeeLamports: 1000,
      };
      const fetchSpy = mockFetchOk(swapResponse);
      const agg = new JupiterAggregator();

      await agg.getSwapTransaction({
        quoteResponse: makeQuoteResponse(),
        userPublicKey: 'user1',
        wrapAndUnwrapSol: false,
        dynamicComputeUnitLimit: false,
        prioritizationFeeLamports: 1000,
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(body.wrapAndUnwrapSol).toBe(false);
      expect(body.dynamicComputeUnitLimit).toBe(false);
      expect(body.prioritizationFeeLamports).toBe(1000);
    });

    it('returns SwapResponse', async () => {
      const expected: SwapResponse = {
        swapTransaction: 'base64tx==',
        lastValidBlockHeight: 99999,
        prioritizationFeeLamports: 5000,
      };
      mockFetchOk(expected);
      const agg = new JupiterAggregator();

      const result = await agg.getSwapTransaction({
        quoteResponse: makeQuoteResponse(),
        userPublicKey: 'user1',
      });

      expect(result.swapTransaction).toBe('base64tx==');
      expect(result.lastValidBlockHeight).toBe(99999);
      expect(result.prioritizationFeeLamports).toBe(5000);
    });
  });

  describe('getBestRoute', () => {
    it('returns a SwapRoute with analyzed steps', async () => {
      mockFetchOk(makeQuoteResponse());
      const agg = new JupiterAggregator();

      const route = await agg.getBestRoute({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000000',
      });

      expect(route).not.toBeNull();
      expect(route!.steps).toHaveLength(1);
      expect(route!.steps[0].dex).toBe('Raydium');
      expect(route!.steps[0].inputAmount).toBe('1000000');
      expect(route!.steps[0].outputAmount).toBe('950000');
      expect(route!.steps[0].fee).toBe('3000');
      expect(route!.totalFee).toBe('3000');
      expect(route!.priceImpact).toBe(0.12);
    });

    it('calculates effective price correctly', async () => {
      mockFetchOk(makeQuoteResponse({
        inAmount: '2000000',
        outAmount: '1000000',
      }));
      const agg = new JupiterAggregator();

      const route = await agg.getBestRoute({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '2000000',
      });

      // effectivePrice = 1000000 * 1_000_000 / 2000000 / 1_000_000 = 0.5
      expect(route!.effectivePrice).toBe(0.5);
    });

    it('handles zero inAmount gracefully', async () => {
      mockFetchOk(makeQuoteResponse({ inAmount: '0', outAmount: '0' }));
      const agg = new JupiterAggregator();

      const route = await agg.getBestRoute({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '0',
      });

      expect(route!.effectivePrice).toBe(0);
    });

    it('sums fees across multiple route steps', async () => {
      mockFetchOk(makeQuoteResponse({
        routePlan: [
          {
            swapInfo: {
              ammKey: 'amm1',
              label: 'Raydium',
              inputMint: 'mintA',
              outputMint: 'mintB',
              inAmount: '500000',
              outAmount: '480000',
              feeAmount: '1500',
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
              feeAmount: '2000',
              feeMint: 'mintA',
            },
            percent: 50,
          },
        ],
      }));
      const agg = new JupiterAggregator();

      const route = await agg.getBestRoute({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000000',
      });

      expect(route!.steps).toHaveLength(2);
      expect(route!.totalFee).toBe('3500');
    });

    it('returns null on API error', async () => {
      mockFetchError(500, 'error');
      const agg = new JupiterAggregator();

      const route = await agg.getBestRoute({
        inputMint: 'mintA',
        outputMint: 'mintB',
        amount: '1000',
      });

      expect(route).toBeNull();
    });
  });

  describe('getQuotes', () => {
    it('fetches quotes for multiple amounts', async () => {
      const fetchSpy = mockFetchOk(makeQuoteResponse());
      const agg = new JupiterAggregator();

      const quotes = await agg.getQuotes('mintA', 'mintB', ['100', '200', '300']);

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(quotes).toHaveLength(3);
    });

    it('filters out failed quotes', async () => {
      let callCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          return { ok: false, status: 500, text: () => Promise.resolve('error') } as Response;
        }
        return {
          ok: true,
          json: () => Promise.resolve(makeQuoteResponse()),
        } as Response;
      });

      const agg = new JupiterAggregator();
      const quotes = await agg.getQuotes('mintA', 'mintB', ['100', '200', '300']);

      expect(quotes).toHaveLength(2);
    });

    it('returns empty array when all fail', async () => {
      mockFetchError(500, 'error');
      const agg = new JupiterAggregator();

      const quotes = await agg.getQuotes('mintA', 'mintB', ['100', '200']);

      expect(quotes).toHaveLength(0);
    });
  });

  describe('fetch timeout', () => {
    it('aborts request after timeout', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
        // Check that an AbortSignal is passed
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return {
          ok: true,
          json: () => Promise.resolve(makeQuoteResponse()),
        } as Response;
      });

      const agg = new JupiterAggregator({ timeoutMs: 5000 });
      await agg.getQuote({ inputMint: 'a', outputMint: 'b', amount: '1' });
    });
  });

  describe('createJupiterAggregator', () => {
    it('returns a JupiterAggregator instance', () => {
      const agg = createJupiterAggregator();
      expect(agg).toBeInstanceOf(JupiterAggregator);
    });

    it('passes config through', () => {
      const fetchSpy = mockFetchOk(makeQuoteResponse());
      const agg = createJupiterAggregator({ apiBaseUrl: 'https://my-api.com' });

      agg.getQuote({ inputMint: 'a', outputMint: 'b', amount: '1' });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('https://my-api.com/quote');
    });
  });
});
