import { describe, it, expect, vi } from 'vitest';
import { ZkComplianceProver, type NoirProverLike } from '../zk-compliance';
import { KycLevel, Jurisdiction } from '../types';
import type { ZkComplianceProof } from '../types';

function mockNoirProver(): NoirProverLike {
  return {
    generateProof: vi.fn().mockResolvedValue({
      proof: new Uint8Array([1, 2, 3]),
      publicInputs: [new Uint8Array(32), new Uint8Array(32)],
    }),
    verifyProof: vi.fn().mockResolvedValue(true),
  };
}

describe('ZkComplianceProver', () => {
  describe('isZkEnabled', () => {
    it('returns false when no prover is provided', () => {
      const prover = new ZkComplianceProver();
      expect(prover.isZkEnabled).toBe(false);
    });

    it('returns true when a prover is provided', () => {
      const prover = new ZkComplianceProver(mockNoirProver());
      expect(prover.isZkEnabled).toBe(true);
    });
  });

  describe('generateComplianceProof', () => {
    const defaultInputs = {
      kycLevel: KycLevel.Standard,
      jurisdiction: Jurisdiction.Japan,
      expiryTimestamp: Math.floor(Date.now() / 1000) + 86400,
      minKycLevel: KycLevel.Basic,
      jurisdictionBitmask: 0b00111111,
      currentTimestamp: Math.floor(Date.now() / 1000),
      kycHash: new Uint8Array(32),
    };

    it('throws when no prover is configured', async () => {
      const prover = new ZkComplianceProver();

      await expect(prover.generateComplianceProof(defaultInputs)).rejects.toThrow(
        'ZK proving not available'
      );
    });

    it('calls prover.generateProof with witness containing BigInt fields', async () => {
      const noirProver = mockNoirProver();
      const prover = new ZkComplianceProver(noirProver);

      await prover.generateComplianceProof(defaultInputs);

      expect(noirProver.generateProof).toHaveBeenCalledTimes(1);
      const [circuitId, witness] = (noirProver.generateProof as ReturnType<typeof vi.fn>).mock.calls[0];

      expect(circuitId).toBe('kyc_compliance');
      expect(witness.kyc_level).toBe(BigInt(defaultInputs.kycLevel));
      expect(witness.jurisdiction).toBe(BigInt(defaultInputs.jurisdiction));
      expect(witness.expiry_timestamp).toBe(BigInt(defaultInputs.expiryTimestamp));
      expect(witness.min_kyc_level).toBe(BigInt(defaultInputs.minKycLevel));
      expect(witness.jurisdiction_bitmask).toBe(BigInt(defaultInputs.jurisdictionBitmask));
      expect(witness.current_timestamp).toBe(BigInt(defaultInputs.currentTimestamp));
      expect(witness.kyc_hash).toBe(defaultInputs.kycHash);
    });

    it('returns a ZkComplianceProof with correct shape', async () => {
      const noirProver = mockNoirProver();
      const prover = new ZkComplianceProver(noirProver);

      const result = await prover.generateComplianceProof(defaultInputs);

      expect(result.proof).toBeInstanceOf(Uint8Array);
      expect(result.publicInputs).toBeInstanceOf(Array);
      expect(result.circuitId).toBe('kyc_compliance');
      expect(result.kycLevelCommitment).toBeInstanceOf(Uint8Array);
      expect(result.jurisdictionCommitment).toBeInstanceOf(Uint8Array);
    });
  });

  describe('verifyComplianceProof', () => {
    const mockProof: ZkComplianceProof = {
      proof: new Uint8Array([1, 2, 3]),
      publicInputs: [new Uint8Array(32), new Uint8Array(32)],
      circuitId: 'kyc_compliance',
      kycLevelCommitment: new Uint8Array(32),
      jurisdictionCommitment: new Uint8Array(32),
    };

    it('returns { valid: false, error } when no prover is configured', async () => {
      const prover = new ZkComplianceProver();

      const result = await prover.verifyComplianceProof(mockProof);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('ZK verification not available');
    });

    it('delegates to prover and returns { valid: true }', async () => {
      const noirProver = mockNoirProver();
      const prover = new ZkComplianceProver(noirProver);

      const result = await prover.verifyComplianceProof(mockProof);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(noirProver.verifyProof).toHaveBeenCalledWith({
        proof: mockProof.proof,
        publicInputs: mockProof.publicInputs,
        circuitId: mockProof.circuitId,
      });
    });

    it('handles thrown errors from verifyProof', async () => {
      const noirProver = mockNoirProver();
      (noirProver.verifyProof as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Proof invalid')
      );
      const prover = new ZkComplianceProver(noirProver);

      const result = await prover.verifyComplianceProof(mockProof);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Proof invalid');
    });

    it('handles non-Error thrown values', async () => {
      const noirProver = mockNoirProver();
      (noirProver.verifyProof as ReturnType<typeof vi.fn>).mockRejectedValue('string error');
      const prover = new ZkComplianceProver(noirProver);

      const result = await prover.verifyComplianceProof(mockProof);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unknown verification error');
    });
  });
});
