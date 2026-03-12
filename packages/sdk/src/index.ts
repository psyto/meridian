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
export * from './shield-escrow';
export * from './zk-verifier';
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
  ZK_VERIFIER_PROGRAM_ID,
  deriveVerifierConfigPda,
  deriveAttestationPda,
  buildVerifyProofInstruction,
} from './zk-prover';
export type {
  KycWitness,
  CompliancePublicInputs,
  ComplianceProof,
  VerificationResult,
} from './zk-prover';
export { PlaceholderBackend, NoirBackend } from './proof-backend';
export type { ProofBackend } from './proof-backend';
