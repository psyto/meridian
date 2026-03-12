import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaceholderBackend, NoirBackend } from '../proof-backend';
import type { ProofBackend } from '../proof-backend';
import {
  ZkKycLevel,
  ZkJurisdiction,
  computeCommitment,
  createJurisdictionBitmask,
  ZkComplianceProver,
  createZkComplianceProver,
} from '../zk-prover';
import type { KycWitness, CompliancePublicInputs } from '../zk-prover';

const futureExpiry = Math.floor(Date.now() / 1000) + 365 * 86400;

function makeWitness(overrides?: Partial<KycWitness>): KycWitness {
  return {
    kycLevel: ZkKycLevel.Enhanced,
    jurisdiction: ZkJurisdiction.Japan,
    expiry: futureExpiry,
    salt: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    ...overrides,
  };
}

function makePublicInputs(witness: KycWitness, overrides?: Partial<CompliancePublicInputs>): CompliancePublicInputs {
  return {
    requiredKycLevel: ZkKycLevel.Basic,
    jurisdictionBitmask: createJurisdictionBitmask([ZkJurisdiction.Japan, ZkJurisdiction.Singapore]),
    currentTimestamp: Math.floor(Date.now() / 1000),
    commitment: computeCommitment(witness),
    ...overrides,
  };
}

describe('ProofBackend interface', () => {
  it('PlaceholderBackend implements ProofBackend', () => {
    const backend: ProofBackend = new PlaceholderBackend();
    expect(backend.prove).toBeDefined();
    expect(backend.verify).toBeDefined();
  });

  it('NoirBackend implements ProofBackend', () => {
    const backend: ProofBackend = new NoirBackend();
    expect(backend.prove).toBeDefined();
    expect(backend.verify).toBeDefined();
  });
});

describe('PlaceholderBackend', () => {
  let backend: PlaceholderBackend;

  beforeEach(() => {
    backend = new PlaceholderBackend();
  });

  describe('prove', () => {
    it('produces a deterministic hex proof', async () => {
      const witness = makeWitness();
      const publicInputs = makePublicInputs(witness);

      const proof1 = await backend.prove(witness, publicInputs);
      const proof2 = await backend.prove(witness, publicInputs);

      expect(proof1).toBe(proof2);
      expect(proof1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces different proofs for different witnesses', async () => {
      const w1 = makeWitness({ kycLevel: ZkKycLevel.Basic });
      const w2 = makeWitness({ kycLevel: ZkKycLevel.Institutional });
      const pi1 = makePublicInputs(w1);
      const pi2 = makePublicInputs(w2);

      const proof1 = await backend.prove(w1, pi1);
      const proof2 = await backend.prove(w2, pi2);

      expect(proof1).not.toBe(proof2);
    });

    it('produces different proofs for different public inputs', async () => {
      const witness = makeWitness();
      const pi1 = makePublicInputs(witness, { requiredKycLevel: ZkKycLevel.Basic });
      const pi2 = makePublicInputs(witness, { requiredKycLevel: ZkKycLevel.Enhanced });

      const proof1 = await backend.prove(witness, pi1);
      const proof2 = await backend.prove(witness, pi2);

      expect(proof1).not.toBe(proof2);
    });
  });

  describe('verify', () => {
    it('returns true for valid public inputs', async () => {
      const witness = makeWitness();
      const publicInputs = makePublicInputs(witness);
      const proof = await backend.prove(witness, publicInputs);

      const result = await backend.verify(proof, publicInputs);
      expect(result).toBe(true);
    });

    it('throws on empty jurisdiction bitmask', async () => {
      const witness = makeWitness();
      const publicInputs = makePublicInputs(witness, { jurisdictionBitmask: 0 });

      await expect(backend.verify('abcd', publicInputs)).rejects.toThrow('Empty jurisdiction bitmask');
    });

    it('throws on missing commitment', async () => {
      const witness = makeWitness();
      const publicInputs = makePublicInputs(witness, { commitment: '' });

      await expect(backend.verify('abcd', publicInputs)).rejects.toThrow('Missing commitment');
    });

    it('throws on invalid KYC level', async () => {
      const witness = makeWitness();
      const publicInputs = makePublicInputs(witness, { requiredKycLevel: 99 as ZkKycLevel });

      await expect(backend.verify('abcd', publicInputs)).rejects.toThrow('Invalid required KYC level');
    });
  });
});

describe('PlaceholderBackend matches original ZkComplianceProver behavior', () => {
  it('proof output matches when using PlaceholderBackend explicitly', async () => {
    const proverDefault = createZkComplianceProver();
    const proverExplicit = createZkComplianceProver(new PlaceholderBackend());

    const witness = makeWitness();
    const bitmask = createJurisdictionBitmask([ZkJurisdiction.Japan, ZkJurisdiction.Singapore]);

    const proof1 = await proverDefault.generateProof(witness, ZkKycLevel.Basic, bitmask);
    const proof2 = await proverExplicit.generateProof(witness, ZkKycLevel.Basic, bitmask);

    // Both should produce the same commitment
    expect(proof1.publicInputs.commitment).toBe(proof2.publicInputs.commitment);
    // Circuit name should match
    expect(proof1.circuit).toBe(proof2.circuit);
  });
});

describe('NoirBackend', () => {
  it('rejects with clear error when nargo is not installed', async () => {
    const backend = new NoirBackend({
      nargoBin: 'nargo-nonexistent-binary-12345',
    });
    const witness = makeWitness();
    const publicInputs = makePublicInputs(witness);

    await expect(backend.prove(witness, publicInputs)).rejects.toThrow(
      /nargo binary not found/
    );
  });

  it('rejects with clear error when bb is not installed', async () => {
    const backend = new NoirBackend({
      bbBin: 'bb-nonexistent-binary-12345',
    });
    const witness = makeWitness();
    const publicInputs = makePublicInputs(witness);

    await expect(backend.verify('deadbeef', publicInputs)).rejects.toThrow(
      /bb binary not found/
    );
  });

  it('error message includes installation URL', async () => {
    const backend = new NoirBackend({
      nargoBin: 'nargo-nonexistent-binary-12345',
    });
    const witness = makeWitness();
    const publicInputs = makePublicInputs(witness);

    try {
      await backend.prove(witness, publicInputs);
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('noir-lang.org');
    }
  });

  it('accepts custom circuit directory and binary paths', () => {
    const backend = new NoirBackend({
      circuitDir: '/custom/circuits',
      nargoBin: '/usr/local/bin/nargo',
      bbBin: '/usr/local/bin/bb',
    });
    // Just verify construction succeeds
    expect(backend).toBeInstanceOf(NoirBackend);
  });
});

describe('ZkComplianceProver with custom backend', () => {
  it('uses a custom backend for prove and verify', async () => {
    const mockBackend: ProofBackend = {
      prove: vi.fn().mockResolvedValue('cafebabe'.repeat(8)),
      verify: vi.fn().mockResolvedValue(true),
    };

    const prover = new ZkComplianceProver(mockBackend);
    const witness = makeWitness();
    const bitmask = createJurisdictionBitmask([ZkJurisdiction.Japan]);

    const proof = await prover.generateProof(witness, ZkKycLevel.Basic, bitmask);
    expect(proof.proof).toBe('cafebabe'.repeat(8));
    expect(mockBackend.prove).toHaveBeenCalledOnce();

    const result = await prover.verifyProof(proof);
    expect(result.valid).toBe(true);
    expect(mockBackend.verify).toHaveBeenCalledOnce();
  });

  it('propagates backend verification errors', async () => {
    const mockBackend: ProofBackend = {
      prove: vi.fn().mockResolvedValue('deadbeef'.repeat(8)),
      verify: vi.fn().mockRejectedValue(new Error('Backend verification failed')),
    };

    const prover = new ZkComplianceProver(mockBackend);
    const witness = makeWitness();
    const bitmask = createJurisdictionBitmask([ZkJurisdiction.Japan]);

    const proof = await prover.generateProof(witness, ZkKycLevel.Basic, bitmask);
    const result = await prover.verifyProof(proof);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Backend verification failed');
  });

  it('createZkComplianceProver accepts optional backend', () => {
    const backend = new PlaceholderBackend();
    const prover = createZkComplianceProver(backend);
    expect(prover).toBeInstanceOf(ZkComplianceProver);
  });
});
