import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ZkKycLevel,
  ZkJurisdiction,
  computeCommitment,
  createJurisdictionBitmask,
  isJurisdictionAllowed,
  ZkComplianceProver,
  createZkComplianceProver,
} from '../zk-prover';
import type { KycWitness } from '../zk-prover';

const futureExpiry = Math.floor(Date.now() / 1000) + 365 * 86400; // 1 year from now

function makeWitness(overrides?: Partial<KycWitness>): KycWitness {
  return {
    kycLevel: ZkKycLevel.Enhanced,
    jurisdiction: ZkJurisdiction.Japan,
    expiry: futureExpiry,
    salt: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    ...overrides,
  };
}

describe('ZkKycLevel enum', () => {
  it('has correct values', () => {
    expect(ZkKycLevel.None).toBe(0);
    expect(ZkKycLevel.Basic).toBe(1);
    expect(ZkKycLevel.Standard).toBe(2);
    expect(ZkKycLevel.Enhanced).toBe(3);
    expect(ZkKycLevel.Institutional).toBe(4);
  });
});

describe('ZkJurisdiction enum', () => {
  it('has correct values', () => {
    expect(ZkJurisdiction.Japan).toBe(0);
    expect(ZkJurisdiction.Singapore).toBe(1);
    expect(ZkJurisdiction.HongKong).toBe(2);
    expect(ZkJurisdiction.EU).toBe(3);
    expect(ZkJurisdiction.USA).toBe(4);
    expect(ZkJurisdiction.Other).toBe(5);
  });
});

describe('computeCommitment', () => {
  it('produces deterministic output', () => {
    const witness = makeWitness();
    const c1 = computeCommitment(witness);
    const c2 = computeCommitment(witness);
    expect(c1).toBe(c2);
  });

  it('produces different output for different kyc levels', () => {
    const c1 = computeCommitment(makeWitness({ kycLevel: ZkKycLevel.Basic }));
    const c2 = computeCommitment(makeWitness({ kycLevel: ZkKycLevel.Enhanced }));
    expect(c1).not.toBe(c2);
  });

  it('produces different output for different jurisdictions', () => {
    const c1 = computeCommitment(makeWitness({ jurisdiction: ZkJurisdiction.Japan }));
    const c2 = computeCommitment(makeWitness({ jurisdiction: ZkJurisdiction.EU }));
    expect(c1).not.toBe(c2);
  });

  it('produces different output for different expiry', () => {
    const c1 = computeCommitment(makeWitness({ expiry: futureExpiry }));
    const c2 = computeCommitment(makeWitness({ expiry: futureExpiry + 1000 }));
    expect(c1).not.toBe(c2);
  });

  it('produces different output for different salt', () => {
    const c1 = computeCommitment(makeWitness({ salt: 'aaa' }));
    const c2 = computeCommitment(makeWitness({ salt: 'bbb' }));
    expect(c1).not.toBe(c2);
  });

  it('returns a hex string', () => {
    const commitment = computeCommitment(makeWitness());
    expect(commitment).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('createJurisdictionBitmask', () => {
  it('sets correct bits for single jurisdiction', () => {
    expect(createJurisdictionBitmask([ZkJurisdiction.Japan])).toBe(0b000001);
    expect(createJurisdictionBitmask([ZkJurisdiction.Singapore])).toBe(0b000010);
    expect(createJurisdictionBitmask([ZkJurisdiction.USA])).toBe(0b010000);
  });

  it('sets correct bits for multiple jurisdictions', () => {
    const bitmask = createJurisdictionBitmask([
      ZkJurisdiction.Japan,
      ZkJurisdiction.Singapore,
      ZkJurisdiction.EU,
    ]);
    expect(bitmask).toBe(0b001011);
  });

  it('returns 0 for empty list', () => {
    expect(createJurisdictionBitmask([])).toBe(0);
  });
});

describe('isJurisdictionAllowed', () => {
  const bitmask = createJurisdictionBitmask([
    ZkJurisdiction.Japan,
    ZkJurisdiction.Singapore,
    ZkJurisdiction.EU,
  ]);

  it('returns true for allowed jurisdictions', () => {
    expect(isJurisdictionAllowed(ZkJurisdiction.Japan, bitmask)).toBe(true);
    expect(isJurisdictionAllowed(ZkJurisdiction.Singapore, bitmask)).toBe(true);
    expect(isJurisdictionAllowed(ZkJurisdiction.EU, bitmask)).toBe(true);
  });

  it('returns false for disallowed jurisdictions', () => {
    expect(isJurisdictionAllowed(ZkJurisdiction.USA, bitmask)).toBe(false);
    expect(isJurisdictionAllowed(ZkJurisdiction.HongKong, bitmask)).toBe(false);
    expect(isJurisdictionAllowed(ZkJurisdiction.Other, bitmask)).toBe(false);
  });
});

describe('ZkComplianceProver', () => {
  let prover: ZkComplianceProver;
  const jurisdictionBitmask = createJurisdictionBitmask([
    ZkJurisdiction.Japan,
    ZkJurisdiction.Singapore,
    ZkJurisdiction.EU,
  ]);

  beforeEach(() => {
    prover = createZkComplianceProver();
  });

  describe('generateProof', () => {
    it('succeeds with valid witness', async () => {
      const witness = makeWitness();
      const proof = await prover.generateProof(
        witness,
        ZkKycLevel.Standard,
        jurisdictionBitmask,
      );

      expect(proof.proof).toBeTruthy();
      expect(proof.proof).toMatch(/^[0-9a-f]{64}$/);
      expect(proof.circuit).toBe('compliance_proof');
      expect(proof.publicInputs.requiredKycLevel).toBe(ZkKycLevel.Standard);
      expect(proof.publicInputs.jurisdictionBitmask).toBe(jurisdictionBitmask);
      expect(proof.publicInputs.commitment).toBeTruthy();
      expect(proof.generatedAt).toBeGreaterThan(0);
    });

    it('fails with insufficient KYC level', async () => {
      const witness = makeWitness({ kycLevel: ZkKycLevel.Basic });
      await expect(
        prover.generateProof(witness, ZkKycLevel.Enhanced, jurisdictionBitmask),
      ).rejects.toThrow('KYC level 1 is below required level 3');
    });

    it('fails with disallowed jurisdiction', async () => {
      const witness = makeWitness({ jurisdiction: ZkJurisdiction.USA });
      await expect(
        prover.generateProof(witness, ZkKycLevel.Basic, jurisdictionBitmask),
      ).rejects.toThrow('Jurisdiction USA is not in allowed bitmask');
    });

    it('fails with expired KYC', async () => {
      const pastExpiry = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const witness = makeWitness({ expiry: pastExpiry });
      await expect(
        prover.generateProof(witness, ZkKycLevel.Basic, jurisdictionBitmask),
      ).rejects.toThrow('KYC expired at');
    });

    it('succeeds when KYC level equals required level', async () => {
      const witness = makeWitness({ kycLevel: ZkKycLevel.Standard });
      const proof = await prover.generateProof(
        witness,
        ZkKycLevel.Standard,
        jurisdictionBitmask,
      );
      expect(proof.proof).toBeTruthy();
    });

    it('succeeds when KYC level exceeds required level', async () => {
      const witness = makeWitness({ kycLevel: ZkKycLevel.Institutional });
      const proof = await prover.generateProof(
        witness,
        ZkKycLevel.Basic,
        jurisdictionBitmask,
      );
      expect(proof.proof).toBeTruthy();
    });
  });

  describe('verifyProof', () => {
    it('returns valid for a valid proof', async () => {
      const witness = makeWitness();
      const proof = await prover.generateProof(
        witness,
        ZkKycLevel.Basic,
        jurisdictionBitmask,
      );

      const result = await prover.verifyProof(proof);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns invalid for empty jurisdiction bitmask', async () => {
      const witness = makeWitness();
      const proof = await prover.generateProof(
        witness,
        ZkKycLevel.Basic,
        jurisdictionBitmask,
      );

      // Tamper with public inputs
      proof.publicInputs.jurisdictionBitmask = 0;

      const result = await prover.verifyProof(proof);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Empty jurisdiction bitmask');
    });

    it('returns invalid for missing commitment', async () => {
      const witness = makeWitness();
      const proof = await prover.generateProof(
        witness,
        ZkKycLevel.Basic,
        jurisdictionBitmask,
      );

      // Tamper with public inputs
      proof.publicInputs.commitment = '';

      const result = await prover.verifyProof(proof);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing commitment');
    });
  });

  describe('generateSalt', () => {
    it('produces 64-char hex strings', () => {
      const salt = prover.generateSalt();
      expect(salt).toMatch(/^[0-9a-f]{64}$/);
      expect(salt.length).toBe(64);
    });

    it('produces unique values', () => {
      const salt1 = prover.generateSalt();
      const salt2 = prover.generateSalt();
      expect(salt1).not.toBe(salt2);
    });
  });
});

describe('createZkComplianceProver', () => {
  it('returns a ZkComplianceProver instance', () => {
    const prover = createZkComplianceProver();
    expect(prover).toBeInstanceOf(ZkComplianceProver);
  });
});
