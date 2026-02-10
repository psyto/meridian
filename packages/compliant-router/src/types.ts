import { PublicKey } from '@solana/web3.js';
import type { QuoteResponse, SwapRoute } from '@meridian/aggregator';

/** KYC verification levels (mirrors on-chain enum) */
export enum KycLevel {
  Basic = 0,
  Standard = 1,
  Enhanced = 2,
  Institutional = 3,
}

/** Jurisdiction identifiers (mirrors on-chain enum) */
export enum Jurisdiction {
  Japan = 0,
  Singapore = 1,
  HongKong = 2,
  Eu = 3,
  Usa = 4,
  Other = 5,
}

/** Pool compliance status */
export enum PoolStatus {
  Active = 0,
  Suspended = 1,
  Revoked = 2,
}

/** On-chain PoolComplianceEntry deserialized */
export interface PoolComplianceEntry {
  ammKey: PublicKey;
  registry: PublicKey;
  operator: PublicKey;
  dexLabel: string;
  status: PoolStatus;
  jurisdiction: Jurisdiction;
  kycLevel: KycLevel;
  auditHash: Uint8Array;
  auditExpiry: number;
  registeredAt: number;
  updatedAt: number;
}

/** On-chain WhitelistEntry from transfer-hook (read-only) */
export interface WhitelistEntry {
  wallet: PublicKey;
  registry: PublicKey;
  kycLevel: KycLevel;
  jurisdiction: Jurisdiction;
  kycHash: Uint8Array;
  isActive: boolean;
  dailyLimit: bigint;
  dailyVolume: bigint;
  volumeResetTime: bigint;
  verifiedAt: bigint;
  expiryTimestamp: bigint;
  lastActivity: bigint;
}

/** Compliant quote result wrapping Jupiter QuoteResponse */
export interface CompliantQuoteResult {
  /** Original Jupiter quote (filtered to compliant route) */
  quote: QuoteResponse;
  /** Whether the original route was fully compliant or was re-fetched */
  wasFiltered: boolean;
  /** Number of compliant hops in the route */
  compliantHopCount: number;
  /** Trader's KYC level */
  traderKycLevel: KycLevel;
  /** Trader's jurisdiction */
  traderJurisdiction: Jurisdiction;
}

/** Compliance check result for a single route */
export interface RouteComplianceResult {
  isCompliant: boolean;
  /** AMM keys that are NOT in the whitelist */
  nonCompliantPools: string[];
  /** AMM keys that passed compliance */
  compliantPools: string[];
}

/** Configuration for ComplianceAwareRouter */
export interface ComplianceRouterConfig {
  /** RPC connection URL */
  rpcUrl?: string;
  /** Compliant registry program ID */
  registryProgramId?: PublicKey;
  /** Transfer-hook program ID for KYC lookups */
  transferHookProgramId?: PublicKey;
  /** Jupiter API base URL */
  jupiterApiBaseUrl?: string;
  /** Default slippage in basis points */
  defaultSlippageBps?: number;
  /** Whether to fall back to direct routes when multi-hop fails compliance */
  fallbackToDirectRoutes?: boolean;
  /** Maximum route hops to consider */
  maxRouteHops?: number;
}

/** ZK compliance proof for privacy-preserving KYC verification */
export interface ZkComplianceProof {
  proof: Uint8Array;
  publicInputs: Uint8Array[];
  circuitId: string;
  kycLevelCommitment: Uint8Array;
  jurisdictionCommitment: Uint8Array;
}
