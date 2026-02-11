import type { QuoteResponse } from './types';
import type { PoolWhitelistManager } from './pool-whitelist';
import type { RouteComplianceResult } from './types';

/**
 * Filters Jupiter routes to only include compliant pool hops.
 * Post-fetch filtering strategy: get Jupiter quote first, then validate.
 */
export class RouteComplianceFilter {
  private whitelist: PoolWhitelistManager;

  constructor(whitelist: PoolWhitelistManager) {
    this.whitelist = whitelist;
  }

  /**
   * Check if all hops in a route use whitelisted AMM pools
   */
  checkRouteCompliance(quote: QuoteResponse): RouteComplianceResult {
    const compliantPools: string[] = [];
    const nonCompliantPools: string[] = [];

    for (const step of quote.routePlan) {
      const ammKey = step.swapInfo.ammKey;
      if (this.whitelist.isWhitelisted(ammKey)) {
        compliantPools.push(ammKey);
      } else {
        nonCompliantPools.push(ammKey);
      }
    }

    return {
      isCompliant: nonCompliantPools.length === 0,
      nonCompliantPools,
      compliantPools,
    };
  }

  /**
   * Filter a quote's route plan to only include compliant steps.
   * Returns null if no compliant steps remain.
   */
  filterCompliantSteps(
    quote: QuoteResponse
  ): QuoteResponse | null {
    const compliantSteps = quote.routePlan.filter((step) =>
      this.whitelist.isWhitelisted(step.swapInfo.ammKey)
    );

    if (compliantSteps.length === 0) {
      return null;
    }

    // If all steps are compliant, return original
    if (compliantSteps.length === quote.routePlan.length) {
      return quote;
    }

    // Cannot safely use a partial multi-hop route — return null to trigger retry
    return null;
  }

  /**
   * Batch check multiple AMM keys against the whitelist
   */
  batchCheck(ammKeys: string[]): Map<string, boolean> {
    const results = new Map<string, boolean>();
    for (const key of ammKeys) {
      results.set(key, this.whitelist.isWhitelisted(key));
    }
    return results;
  }

  /**
   * Get the underlying whitelist manager
   */
  getWhitelist(): PoolWhitelistManager {
    return this.whitelist;
  }
}
