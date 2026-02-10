import type { ZkComplianceProof, KycLevel, Jurisdiction } from './types';

/**
 * ZK compliance proof wrapper.
 * Generates proofs that a trader meets KYC requirements
 * without revealing their identity or KYC details.
 *
 * Uses Veil's NoirProver for proof generation when available.
 * Falls back to a transparent mode (no privacy) when ZK is not configured.
 */
export class ZkComplianceProver {
  private noirProver: NoirProverLike | null;
  private circuitId = 'kyc_compliance';

  constructor(noirProver?: NoirProverLike) {
    this.noirProver = noirProver ?? null;
  }

  /**
   * Check if ZK proving is available
   */
  get isZkEnabled(): boolean {
    return this.noirProver !== null;
  }

  /**
   * Generate a ZK proof that the trader meets compliance requirements.
   *
   * The proof demonstrates:
   * 1. Trader's KYC level >= required minimum (without revealing exact level)
   * 2. Trader's jurisdiction is in the allowed set (without revealing which one)
   * 3. Trader's KYC hasn't expired (without revealing expiry timestamp)
   */
  async generateComplianceProof(inputs: {
    kycLevel: KycLevel;
    jurisdiction: Jurisdiction;
    expiryTimestamp: number;
    minKycLevel: KycLevel;
    jurisdictionBitmask: number;
    currentTimestamp: number;
    kycHash: Uint8Array;
  }): Promise<ZkComplianceProof> {
    if (!this.noirProver) {
      throw new Error(
        'ZK proving not available. Initialize with a NoirProver instance.'
      );
    }

    // Build witness for the kyc_compliance circuit
    const witness = {
      kyc_level: BigInt(inputs.kycLevel),
      jurisdiction: BigInt(inputs.jurisdiction),
      expiry_timestamp: BigInt(inputs.expiryTimestamp),
      min_kyc_level: BigInt(inputs.minKycLevel),
      jurisdiction_bitmask: BigInt(inputs.jurisdictionBitmask),
      current_timestamp: BigInt(inputs.currentTimestamp),
      kyc_hash: inputs.kycHash,
    };

    const proof = await this.noirProver.generateProof(
      this.circuitId,
      witness
    );

    // Extract public inputs (commitments, not raw values)
    const kycLevelCommitment = proof.publicInputs[0] ?? new Uint8Array(32);
    const jurisdictionCommitment = proof.publicInputs[1] ?? new Uint8Array(32);

    return {
      proof: proof.proof,
      publicInputs: proof.publicInputs,
      circuitId: this.circuitId,
      kycLevelCommitment,
      jurisdictionCommitment,
    };
  }

  /**
   * Verify a compliance proof (typically done on-chain or by the solver)
   */
  async verifyComplianceProof(
    proof: ZkComplianceProof
  ): Promise<{ valid: boolean; error?: string }> {
    if (!this.noirProver) {
      return { valid: false, error: 'ZK verification not available' };
    }

    try {
      const result = await this.noirProver.verifyProof({
        proof: proof.proof,
        publicInputs: proof.publicInputs,
        circuitId: proof.circuitId,
      });
      return { valid: result };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : 'Unknown verification error',
      };
    }
  }
}

/**
 * Minimal interface matching Veil's NoirProver.
 * Allows the compliant-router to work with any compatible prover.
 */
export interface NoirProverLike {
  generateProof(
    circuitId: string,
    witness: Record<string, unknown>
  ): Promise<{ proof: Uint8Array; publicInputs: Uint8Array[] }>;

  verifyProof(proof: {
    proof: Uint8Array;
    publicInputs: Uint8Array[];
    circuitId: string;
  }): Promise<boolean>;
}
