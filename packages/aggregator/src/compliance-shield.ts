import { PublicKey, Connection } from '@solana/web3.js';
import { JupiterAggregator } from './jupiter';
import type { QuoteRequest, QuoteResponse, SwapRoute, AggregatorConfig } from './types';

/**
 * Policy that determines when to use shielded (hybrid) routing
 * vs compliant-only routing.
 */
export interface ShieldPolicy {
  /** Max acceptable slippage difference (bps) before engaging shield */
  slippageThresholdBps: number;
  /** Max price impact (%) on compliant-only route before engaging shield */
  maxCompliantImpactPct: number;
  /** Minimum output improvement (%) required to justify shielded routing */
  minImprovementPct: number;
}

export interface ShieldEscrowConfig {
  /** PDA of the shield escrow account (must be KYC-whitelisted) */
  escrowPda: PublicKey;
  /** Program ID of the shield escrow program */
  escrowProgramId: PublicKey;
  /** Authority that controls the escrow */
  escrowAuthority: PublicKey;
}

export interface ShieldedQuoteResult {
  /** The best available quote */
  quote: QuoteResponse;
  /** The analyzed route */
  route: SwapRoute;
  /** Whether the route uses the compliance shield (hybrid path) */
  isShielded: boolean;
  /** The compliant-only quote for comparison (null if shield wasn't needed) */
  compliantQuote: QuoteResponse | null;
  /** Execution improvement vs compliant-only route (basis points) */
  improvementBps: number;
  /** Routing strategy used */
  strategy: 'compliant-only' | 'shielded' | 'direct-compliant';
}

export interface ComplianceShieldConfig extends AggregatorConfig {
  /** Pool AMM keys that are in the compliant whitelist */
  compliantPoolKeys?: Set<string>;
  /** Shield escrow configuration */
  escrow?: ShieldEscrowConfig;
  /** Policy for when to engage shielded routing */
  policy?: Partial<ShieldPolicy>;
}

const DEFAULT_POLICY: ShieldPolicy = {
  slippageThresholdBps: 100, // 1% slippage difference triggers shield
  maxCompliantImpactPct: 2.0, // 2% price impact on compliant route triggers shield
  minImprovementPct: 0.1, // 0.1% minimum improvement to justify shield overhead
};

/**
 * ComplianceShieldRouter solves the liquidity fragmentation problem
 * by providing a hybrid routing mechanism.
 *
 * Instead of binary exclude/include of non-compliant pools, it uses a
 * KYC-whitelisted escrow PDA as an intermediary. The escrow can access
 * ANY Jupiter liquidity pool while maintaining end-to-end compliance
 * for the trader.
 *
 * Flow:
 *   Trader → (compliant transfer) → Shield Escrow
 *   Shield Escrow → (unrestricted swap via Jupiter) → Shield Escrow
 *   Shield Escrow → (compliant transfer) → Trader
 *
 * This preserves:
 * - Transfer hook enforcement on trader's tokens
 * - KYC validation on both legs of the transfer
 * - Access to full Jupiter liquidity (Raydium, Orca, etc.)
 * - Best execution for institutional traders
 */
export class ComplianceShieldRouter {
  private readonly aggregator: JupiterAggregator;
  private readonly compliantPoolKeys: Set<string>;
  private readonly escrow: ShieldEscrowConfig | null;
  private readonly policy: ShieldPolicy;

  constructor(config: ComplianceShieldConfig = {}) {
    this.aggregator = new JupiterAggregator(config);
    this.compliantPoolKeys = config.compliantPoolKeys ?? new Set();
    this.escrow = config.escrow ?? null;
    this.policy = { ...DEFAULT_POLICY, ...config.policy };
  }

  /**
   * Get the best quote, automatically choosing between compliant-only
   * and shielded routing based on execution quality.
   */
  async getBestQuote(request: QuoteRequest): Promise<ShieldedQuoteResult> {
    // Fetch both compliant-only and unrestricted quotes in parallel
    const [compliantRoute, unrestrictedRoute] = await Promise.all([
      this.getCompliantRoute(request),
      this.aggregator.getBestRoute(request),
    ]);

    // If no unrestricted route, use compliant-only
    if (!unrestrictedRoute) {
      if (!compliantRoute) {
        throw new Error('No route available for this swap');
      }
      return {
        quote: compliantRoute.quote,
        route: compliantRoute,
        isShielded: false,
        compliantQuote: null,
        improvementBps: 0,
        strategy: 'direct-compliant',
      };
    }

    // If no compliant route exists, must use shield
    if (!compliantRoute) {
      return this.createShieldedResult(unrestrictedRoute, null);
    }

    // Both routes available — compare execution quality
    const compliantOut = BigInt(compliantRoute.quote.outAmount);
    const unrestrictedOut = BigInt(unrestrictedRoute.quote.outAmount);

    // If compliant route is good enough, use it directly
    if (compliantOut >= unrestrictedOut) {
      return {
        quote: compliantRoute.quote,
        route: compliantRoute,
        isShielded: false,
        compliantQuote: compliantRoute.quote,
        improvementBps: 0,
        strategy: 'compliant-only',
      };
    }

    // Calculate improvement
    const improvementBps = Number(
      ((unrestrictedOut - compliantOut) * BigInt(10_000)) / compliantOut
    );

    // Check if compliant route exceeds impact threshold
    const compliantImpact = parseFloat(compliantRoute.quote.priceImpactPct);
    const exceedsImpact = compliantImpact > this.policy.maxCompliantImpactPct;

    // Check if improvement exceeds minimum threshold
    const improvementPct = improvementBps / 100;
    const exceedsMinImprovement = improvementPct >= this.policy.minImprovementPct;

    // Check if slippage difference exceeds threshold
    const exceedsSlippage = improvementBps >= this.policy.slippageThresholdBps;

    // Engage shield if execution quality warrants it
    if ((exceedsImpact || exceedsSlippage) && exceedsMinImprovement) {
      return this.createShieldedResult(unrestrictedRoute, compliantRoute.quote);
    }

    // Otherwise use compliant-only route
    return {
      quote: compliantRoute.quote,
      route: compliantRoute,
      isShielded: false,
      compliantQuote: compliantRoute.quote,
      improvementBps: 0,
      strategy: 'compliant-only',
    };
  }

  /**
   * Force a compliant-only quote (no shielded routing).
   * Falls back to direct routes if multi-hop fails compliance.
   */
  async getCompliantQuote(request: QuoteRequest): Promise<SwapRoute | null> {
    return this.getCompliantRoute(request);
  }

  /**
   * Force an unrestricted quote through the shield escrow.
   * Uses full Jupiter liquidity regardless of pool compliance status.
   */
  async getShieldedQuote(request: QuoteRequest): Promise<ShieldedQuoteResult> {
    const route = await this.aggregator.getBestRoute(request);
    if (!route) {
      throw new Error('No route available for this swap');
    }
    return this.createShieldedResult(route, null);
  }

  /**
   * Update the set of compliant pool keys (e.g., after syncing from on-chain registry).
   */
  updateCompliantPools(poolKeys: Set<string>): void {
    this.compliantPoolKeys.clear();
    for (const key of poolKeys) {
      this.compliantPoolKeys.add(key);
    }
  }

  /**
   * Check if a specific route passes through only compliant pools.
   */
  isRouteCompliant(quote: QuoteResponse): boolean {
    return quote.routePlan.every((step) =>
      this.compliantPoolKeys.has(step.swapInfo.ammKey)
    );
  }

  /**
   * Get the underlying aggregator instance.
   */
  getAggregator(): JupiterAggregator {
    return this.aggregator;
  }

  /**
   * Get the current shield policy.
   */
  getPolicy(): Readonly<ShieldPolicy> {
    return { ...this.policy };
  }

  private async getCompliantRoute(request: QuoteRequest): Promise<SwapRoute | null> {
    // Try multi-hop first
    const multiHopRoute = await this.aggregator.getBestRoute(request);

    if (multiHopRoute && this.isRouteCompliant(multiHopRoute.quote)) {
      return multiHopRoute;
    }

    // Fall back to direct routes
    const directRoute = await this.aggregator.getBestRoute({
      ...request,
      onlyDirectRoutes: true,
    });

    if (directRoute && this.isRouteCompliant(directRoute.quote)) {
      return directRoute;
    }

    return null;
  }

  private createShieldedResult(
    route: SwapRoute,
    compliantQuote: QuoteResponse | null
  ): ShieldedQuoteResult {
    let improvementBps = 0;
    if (compliantQuote) {
      const compliantOut = BigInt(compliantQuote.outAmount);
      const shieldedOut = BigInt(route.quote.outAmount);
      if (compliantOut > BigInt(0)) {
        improvementBps = Number(
          ((shieldedOut - compliantOut) * BigInt(10_000)) / compliantOut
        );
      }
    }

    return {
      quote: route.quote,
      route,
      isShielded: true,
      compliantQuote,
      improvementBps,
      strategy: 'shielded',
    };
  }
}

/**
 * Create a ComplianceShieldRouter instance.
 */
export function createComplianceShieldRouter(
  config?: ComplianceShieldConfig
): ComplianceShieldRouter {
  return new ComplianceShieldRouter(config);
}
