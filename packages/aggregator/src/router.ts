import { PublicKey } from '@solana/web3.js';
import { JupiterAggregator } from './jupiter';
import type { QuoteResponse, SwapRoute, AggregatorConfig } from './types';

/**
 * Route optimizer that finds the best swap path
 * for stablecoin pairs across multiple DEXes
 */
export class RouteOptimizer {
  private aggregator: JupiterAggregator;

  constructor(config?: AggregatorConfig) {
    this.aggregator = new JupiterAggregator(config);
  }

  /**
   * Find the optimal route for a swap, optionally splitting across paths
   */
  async findOptimalRoute(
    inputMint: PublicKey | string,
    outputMint: PublicKey | string,
    amount: string,
    options?: {
      slippageBps?: number;
      maxSplits?: number;
    }
  ): Promise<SwapRoute | null> {
    // Try direct route first
    const directRoute = await this.aggregator.getBestRoute({
      inputMint,
      outputMint,
      amount,
      slippageBps: options?.slippageBps,
      onlyDirectRoutes: true,
    });

    // Then try multi-hop
    const multiHopRoute = await this.aggregator.getBestRoute({
      inputMint,
      outputMint,
      amount,
      slippageBps: options?.slippageBps,
      onlyDirectRoutes: false,
    });

    // Return the route with better output
    if (!directRoute && !multiHopRoute) return null;
    if (!directRoute) return multiHopRoute;
    if (!multiHopRoute) return directRoute;

    const directOut = BigInt(directRoute.quote.outAmount);
    const multiOut = BigInt(multiHopRoute.quote.outAmount);

    return multiOut > directOut ? multiHopRoute : directRoute;
  }

  /**
   * Check price impact and warn if too high
   */
  async checkPriceImpact(
    inputMint: PublicKey | string,
    outputMint: PublicKey | string,
    amount: string,
    maxImpactPct: number = 1.0
  ): Promise<{
    acceptable: boolean;
    priceImpact: number;
    quote: QuoteResponse | null;
  }> {
    try {
      const quote = await this.aggregator.getQuote({
        inputMint,
        outputMint,
        amount,
      });

      const impact = parseFloat(quote.priceImpactPct);

      return {
        acceptable: impact <= maxImpactPct,
        priceImpact: impact,
        quote,
      };
    } catch {
      return {
        acceptable: false,
        priceImpact: Infinity,
        quote: null,
      };
    }
  }

  /**
   * Get the underlying aggregator instance
   */
  getAggregator(): JupiterAggregator {
    return this.aggregator;
  }
}
