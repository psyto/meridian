import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import type {
  AggregatorConfig,
  QuoteRequest,
  QuoteResponse,
  SwapParams,
  SwapResponse,
  SwapRoute,
  RouteStep,
} from './types';

const DEFAULT_API_URL = 'https://quote-api.jup.ag/v6';
const DEFAULT_SLIPPAGE_BPS = 50;
const DEFAULT_MAX_ROUTES = 3;
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Jupiter DEX Aggregator client for Meridian stablecoin pairs
 */
export class JupiterAggregator {
  private readonly apiBaseUrl: string;
  private readonly defaultSlippageBps: number;
  private readonly maxRoutes: number;
  private readonly timeoutMs: number;

  constructor(config: AggregatorConfig = {}) {
    this.apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_URL;
    this.defaultSlippageBps = config.defaultSlippageBps ?? DEFAULT_SLIPPAGE_BPS;
    this.maxRoutes = config.maxRoutes ?? DEFAULT_MAX_ROUTES;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Get a swap quote from Jupiter
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    const params = new URLSearchParams({
      inputMint: request.inputMint.toString(),
      outputMint: request.outputMint.toString(),
      amount: request.amount,
      slippageBps: (request.slippageBps ?? this.defaultSlippageBps).toString(),
    });

    if (request.onlyDirectRoutes) {
      params.set('onlyDirectRoutes', 'true');
    }
    if (request.maxAccounts) {
      params.set('maxAccounts', request.maxAccounts.toString());
    }

    const response = await this.fetch(`${this.apiBaseUrl}/quote?${params}`);
    return response as QuoteResponse;
  }

  /**
   * Get a swap transaction from Jupiter
   */
  async getSwapTransaction(params: SwapParams): Promise<SwapResponse> {
    const body = {
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey.toString(),
      wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
      dynamicComputeUnitLimit: params.dynamicComputeUnitLimit ?? true,
      prioritizationFeeLamports: params.prioritizationFeeLamports ?? 'auto',
    };

    const response = await this.fetch(`${this.apiBaseUrl}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return response as SwapResponse;
  }

  /**
   * Deserialize a swap transaction from base64
   */
  deserializeTransaction(swapTransaction: string): VersionedTransaction {
    const buffer = Buffer.from(swapTransaction, 'base64');
    return VersionedTransaction.deserialize(buffer);
  }

  /**
   * Get best route with analysis
   */
  async getBestRoute(request: QuoteRequest): Promise<SwapRoute | null> {
    try {
      const quote = await this.getQuote(request);
      return this.analyzeRoute(quote);
    } catch {
      return null;
    }
  }

  /**
   * Compare quotes across multiple amounts
   */
  async getQuotes(
    inputMint: PublicKey | string,
    outputMint: PublicKey | string,
    amounts: string[]
  ): Promise<QuoteResponse[]> {
    const quotes = await Promise.all(
      amounts.map((amount) =>
        this.getQuote({ inputMint, outputMint, amount }).catch(() => null)
      )
    );
    return quotes.filter((q): q is QuoteResponse => q !== null);
  }

  /**
   * Analyze a quote response into a structured route
   */
  private analyzeRoute(quote: QuoteResponse): SwapRoute {
    const steps: RouteStep[] = quote.routePlan.map((step) => ({
      dex: step.swapInfo.label,
      inputMint: step.swapInfo.inputMint,
      outputMint: step.swapInfo.outputMint,
      inputAmount: step.swapInfo.inAmount,
      outputAmount: step.swapInfo.outAmount,
      fee: step.swapInfo.feeAmount,
    }));

    const totalFee = steps
      .reduce((sum, step) => sum + BigInt(step.fee), BigInt(0))
      .toString();

    const inAmount = BigInt(quote.inAmount);
    const outAmount = BigInt(quote.outAmount);
    const effectivePrice =
      inAmount > BigInt(0)
        ? Number(outAmount * BigInt(1_000_000) / inAmount) / 1_000_000
        : 0;

    return {
      quote,
      steps,
      totalFee,
      priceImpact: parseFloat(quote.priceImpactPct),
      effectivePrice,
    };
  }

  /**
   * Internal fetch with timeout
   */
  private async fetch(url: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await globalThis.fetch(url, {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Jupiter API error (${response.status}): ${text}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Create a Jupiter Aggregator instance
 */
export function createJupiterAggregator(
  config?: AggregatorConfig
): JupiterAggregator {
  return new JupiterAggregator(config);
}
