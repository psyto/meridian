import { Connection, PublicKey } from '@solana/web3.js';
import { JupiterAggregator, RouteOptimizer } from './aggregator';
import type { QuoteResponse, QuoteRequest } from './types';
import { PoolWhitelistManager } from './pool-whitelist';
import { RouteComplianceFilter } from './route-filter';
import { KycComplianceChecker } from './kyc-checker';
import { ZkComplianceProver, type NoirProverLike } from './zk-compliance';
import {
  KycLevel,
  type ComplianceRouterConfig,
  type CompliantQuoteResult,
  type RouteComplianceResult,
} from './types';

const DEFAULT_REGISTRY_PROGRAM_ID = new PublicKey(
  'CRGm1111111111111111111111111111111111111111'
);
const DEFAULT_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  'THKm1111111111111111111111111111111111111111'
);

/**
 * Compliance-aware router that wraps Jupiter DEX aggregation.
 *
 * Flow:
 * 1. Check trader KYC status via transfer-hook WhitelistEntry
 * 2. Get Jupiter quote via existing JupiterAggregator
 * 3. Filter route hops — only whitelisted pools pass
 * 4. If multi-hop fails compliance, retry with onlyDirectRoutes
 * 5. Return compliant quote or throw
 */
export class ComplianceAwareRouter {
  private aggregator: JupiterAggregator;
  private optimizer: RouteOptimizer;
  private whitelist: PoolWhitelistManager;
  private filter: RouteComplianceFilter;
  private kycChecker: KycComplianceChecker;
  private zkProver: ZkComplianceProver;
  private config: Required<ComplianceRouterConfig>;

  constructor(
    connection: Connection,
    registryAuthority: PublicKey,
    config: ComplianceRouterConfig = {},
    noirProver?: NoirProverLike
  ) {
    const registryProgramId =
      config.registryProgramId ?? DEFAULT_REGISTRY_PROGRAM_ID;
    const transferHookProgramId =
      config.transferHookProgramId ?? DEFAULT_TRANSFER_HOOK_PROGRAM_ID;

    this.config = {
      rpcUrl: config.rpcUrl ?? '',
      registryProgramId,
      transferHookProgramId,
      jupiterApiBaseUrl: config.jupiterApiBaseUrl ?? 'https://quote-api.jup.ag/v6',
      defaultSlippageBps: config.defaultSlippageBps ?? 50,
      fallbackToDirectRoutes: config.fallbackToDirectRoutes ?? true,
      maxRouteHops: config.maxRouteHops ?? 4,
    };

    this.aggregator = new JupiterAggregator({
      apiBaseUrl: this.config.jupiterApiBaseUrl,
      defaultSlippageBps: this.config.defaultSlippageBps,
    });

    this.optimizer = new RouteOptimizer({
      apiBaseUrl: this.config.jupiterApiBaseUrl,
      defaultSlippageBps: this.config.defaultSlippageBps,
    });

    this.whitelist = new PoolWhitelistManager(
      connection,
      registryProgramId,
      registryAuthority
    );

    this.filter = new RouteComplianceFilter(this.whitelist);
    this.kycChecker = new KycComplianceChecker(connection, transferHookProgramId);
    this.zkProver = new ZkComplianceProver(noirProver);
  }

  /**
   * Get a compliant quote for a trade.
   *
   * Steps:
   * 1. Verify trader KYC
   * 2. Get Jupiter quote
   * 3. Validate all route hops are whitelisted
   * 4. Retry with direct-only if needed
   */
  async getCompliantQuote(
    trader: PublicKey,
    request: QuoteRequest,
    jurisdictionBitmask: number = 0b00111111 // all jurisdictions
  ): Promise<CompliantQuoteResult> {
    // Step 1: Check trader KYC
    const kycResult = await this.kycChecker.checkTraderCompliance(
      trader,
      KycLevel.Basic, // minimum
      jurisdictionBitmask
    );

    if (!kycResult.isCompliant) {
      throw new Error(`KYC check failed: ${kycResult.reason}`);
    }

    const entry = kycResult.entry!;

    // Step 2: Get Jupiter quote
    const quote = await this.aggregator.getQuote(request);

    // Step 3: Check route compliance
    const compliance = this.filter.checkRouteCompliance(quote);

    if (compliance.isCompliant) {
      return {
        quote,
        wasFiltered: false,
        compliantHopCount: quote.routePlan.length,
        traderKycLevel: entry.kycLevel,
        traderJurisdiction: entry.jurisdiction,
      };
    }

    // Step 4: Route has non-compliant hops. Try direct route if enabled.
    if (this.config.fallbackToDirectRoutes) {
      const directRequest: QuoteRequest = {
        ...request,
        onlyDirectRoutes: true,
      };

      const directQuote = await this.aggregator.getQuote(directRequest);
      const directCompliance =
        this.filter.checkRouteCompliance(directQuote);

      if (directCompliance.isCompliant) {
        return {
          quote: directQuote,
          wasFiltered: true,
          compliantHopCount: directQuote.routePlan.length,
          traderKycLevel: entry.kycLevel,
          traderJurisdiction: entry.jurisdiction,
        };
      }
    }

    throw new Error(
      `No compliant route found. Non-compliant pools: ${compliance.nonCompliantPools.join(', ')}`
    );
  }

  /**
   * Check if a quote's route is fully compliant without fetching a new one
   */
  isRouteCompliant(quote: QuoteResponse): RouteComplianceResult {
    return this.filter.checkRouteCompliance(quote);
  }

  /**
   * Sync the pool whitelist from on-chain state
   */
  async syncWhitelist(): Promise<number> {
    return this.whitelist.syncFromChain();
  }

  /**
   * Get the underlying components for advanced usage
   */
  getAggregator(): JupiterAggregator {
    return this.aggregator;
  }

  getOptimizer(): RouteOptimizer {
    return this.optimizer;
  }

  getWhitelistManager(): PoolWhitelistManager {
    return this.whitelist;
  }

  getKycChecker(): KycComplianceChecker {
    return this.kycChecker;
  }

  getZkProver(): ZkComplianceProver {
    return this.zkProver;
  }
}
