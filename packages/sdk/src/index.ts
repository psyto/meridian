/**
 * Meridian SDK
 *
 * TypeScript SDK for interacting with the Meridian Stablecoin
 * and Securities Platform on Solana.
 *
 * Built for the Meridian platform
 */

export * from './client';
export * from './stablecoin';
export * from './securities';
export * from './rwa';
export * from './types';
export * from './utils';
export { screenWallet, checkTransferCompliance } from './compliance';
export {
  matchSecuritiesOrders,
  getMarketMetrics,
  getDepthAtPrice,
  buildOwnershipTree,
  getOwnershipProof,
  createSettlementTracker,
} from './order-matcher';
export type { SecuritiesOrder, MatchedTrade } from './order-matcher';
export {
  ZkComplianceProver,
  createZkComplianceProver,
  computeCommitment,
  createJurisdictionBitmask,
  isJurisdictionAllowed,
  ZkKycLevel,
  ZkJurisdiction,
} from './zk-prover';
export type {
  KycWitness,
  CompliancePublicInputs,
  ComplianceProof,
  VerificationResult,
} from './zk-prover';
