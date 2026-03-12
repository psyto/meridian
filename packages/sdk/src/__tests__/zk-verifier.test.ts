import { describe, it, expect, vi } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { MeridianClient, DEFAULT_PROGRAM_IDS } from '../client';
import { ZkVerifierSdk } from '../zk-verifier';

function makeSdk(getAccountInfoMock?: ReturnType<typeof vi.fn>) {
  const connection = {
    commitment: 'confirmed',
    getAccountInfo: getAccountInfoMock ?? vi.fn().mockResolvedValue(null),
  } as unknown as Connection;
  const client = new MeridianClient({ connection });
  return new ZkVerifierSdk(client);
}

function serializeVerifierConfig(fields: {
  authority: PublicKey;
  circuitId: Uint8Array;
  verificationKey: Uint8Array;
  totalVerifications: BN;
  totalAttestations: BN;
  isActive: boolean;
  createdAt: BN;
  updatedAt: BN;
  bump: number;
}): Buffer {
  const size = 8 + 32 + 4 + fields.circuitId.length + 4 + fields.verificationKey.length + 8 + 8 + 1 + 8 + 8 + 1;
  const buf = Buffer.alloc(size);
  let offset = 8;

  fields.authority.toBuffer().copy(buf, offset); offset += 32;

  buf.writeUInt32LE(fields.circuitId.length, offset); offset += 4;
  buf.set(fields.circuitId, offset); offset += fields.circuitId.length;

  buf.writeUInt32LE(fields.verificationKey.length, offset); offset += 4;
  buf.set(fields.verificationKey, offset); offset += fields.verificationKey.length;

  buf.set(fields.totalVerifications.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.totalAttestations.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf[offset] = fields.isActive ? 1 : 0; offset += 1;
  buf.set(fields.createdAt.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.updatedAt.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf[offset] = fields.bump;

  return buf;
}

function serializeAttestation(fields: {
  wallet: PublicKey;
  kycLevel: number;
  jurisdictionBitmask: number;
  commitment: Uint8Array;
  expiryTimestamp: BN;
  isValid: boolean;
  attestedAt: BN;
  bump: number;
}): Buffer {
  // 8 disc + 32 wallet + 1 kycLevel + 4 jurisdictionBitmask + 32 commitment + 8 expiryTimestamp + 1 isValid + 8 attestedAt + 1 bump
  const buf = Buffer.alloc(8 + 32 + 1 + 4 + 32 + 8 + 1 + 8 + 1);
  let offset = 8;

  fields.wallet.toBuffer().copy(buf, offset); offset += 32;
  buf[offset] = fields.kycLevel; offset += 1;
  buf.writeUInt32LE(fields.jurisdictionBitmask, offset); offset += 4;
  buf.set(fields.commitment, offset); offset += 32;
  buf.set(fields.expiryTimestamp.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf[offset] = fields.isValid ? 1 : 0; offset += 1;
  buf.set(fields.attestedAt.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf[offset] = fields.bump;

  return buf;
}

describe('ZkVerifierSdk', () => {
  describe('PDA derivation', () => {
    it('derives verifier config PDA deterministically', () => {
      const sdk = makeSdk();
      const [pda1, bump1] = sdk.deriveVerifierConfigPda();
      const [pda2, bump2] = sdk.deriveVerifierConfigPda();

      expect(pda1.equals(pda2)).toBe(true);
      expect(bump1).toBe(bump2);
    });

    it('derives attestation PDA from wallet', () => {
      const sdk = makeSdk();
      const wallet = PublicKey.unique();

      const [pda1] = sdk.deriveAttestationPda(wallet);
      const [pda2] = sdk.deriveAttestationPda(wallet);

      expect(pda1.equals(pda2)).toBe(true);
    });

    it('derives different attestation PDAs for different wallets', () => {
      const sdk = makeSdk();
      const wallet1 = PublicKey.unique();
      const wallet2 = PublicKey.unique();

      const [pda1] = sdk.deriveAttestationPda(wallet1);
      const [pda2] = sdk.deriveAttestationPda(wallet2);

      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('getVerifierConfig', () => {
    it('deserializes a VerifierConfig buffer', async () => {
      const circuitId = new Uint8Array(32);
      circuitId.fill(0xaa);
      const verificationKey = new Uint8Array(64);
      verificationKey.fill(0xbb);

      const fields = {
        authority: PublicKey.unique(),
        circuitId,
        verificationKey,
        totalVerifications: new BN(500),
        totalAttestations: new BN(300),
        isActive: true,
        createdAt: new BN(1700000000),
        updatedAt: new BN(1700500000),
        bump: 254,
      };

      const data = serializeVerifierConfig(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.getVerifierConfig();

      expect(result).not.toBeNull();
      expect(result!.authority.equals(fields.authority)).toBe(true);
      expect(result!.circuitId).toEqual(circuitId);
      expect(result!.verificationKey).toEqual(verificationKey);
      expect(result!.totalVerifications.eq(fields.totalVerifications)).toBe(true);
      expect(result!.totalAttestations.eq(fields.totalAttestations)).toBe(true);
      expect(result!.isActive).toBe(true);
      expect(result!.createdAt.eq(fields.createdAt)).toBe(true);
      expect(result!.updatedAt.eq(fields.updatedAt)).toBe(true);
      expect(result!.bump).toBe(254);
    });

    it('returns null when account does not exist', async () => {
      const mock = vi.fn().mockResolvedValue(null);
      const sdk = makeSdk(mock);

      const result = await sdk.getVerifierConfig();
      expect(result).toBeNull();
    });
  });

  describe('getAttestation', () => {
    it('deserializes a ComplianceAttestation buffer', async () => {
      const commitment = new Uint8Array(32);
      commitment.fill(0xcc);

      const fields = {
        wallet: PublicKey.unique(),
        kycLevel: 2,
        jurisdictionBitmask: 0b00000111, // Japan, Singapore, HongKong
        commitment,
        expiryTimestamp: new BN(1800000000),
        isValid: true,
        attestedAt: new BN(1700000000),
        bump: 253,
      };

      const data = serializeAttestation(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.getAttestation(fields.wallet);

      expect(result).not.toBeNull();
      expect(result!.wallet.equals(fields.wallet)).toBe(true);
      expect(result!.kycLevel).toBe(2);
      expect(result!.jurisdictionBitmask).toBe(0b00000111);
      expect(result!.commitment).toEqual(commitment);
      expect(result!.expiryTimestamp.eq(fields.expiryTimestamp)).toBe(true);
      expect(result!.isValid).toBe(true);
      expect(result!.attestedAt.eq(fields.attestedAt)).toBe(true);
      expect(result!.bump).toBe(253);
    });

    it('returns null when account does not exist', async () => {
      const mock = vi.fn().mockResolvedValue(null);
      const sdk = makeSdk(mock);

      const result = await sdk.getAttestation(PublicKey.unique());
      expect(result).toBeNull();
    });
  });

  describe('isWalletAttested', () => {
    it('returns true for a valid non-expired attestation', async () => {
      const fields = {
        wallet: PublicKey.unique(),
        kycLevel: 2,
        jurisdictionBitmask: 1,
        commitment: new Uint8Array(32),
        expiryTimestamp: new BN(Math.floor(Date.now() / 1000) + 86400), // 1 day in the future
        isValid: true,
        attestedAt: new BN(1700000000),
        bump: 253,
      };

      const data = serializeAttestation(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.isWalletAttested(fields.wallet);
      expect(result).toBe(true);
    });

    it('returns false for an expired attestation', async () => {
      const fields = {
        wallet: PublicKey.unique(),
        kycLevel: 2,
        jurisdictionBitmask: 1,
        commitment: new Uint8Array(32),
        expiryTimestamp: new BN(1600000000), // far in the past
        isValid: true,
        attestedAt: new BN(1500000000),
        bump: 253,
      };

      const data = serializeAttestation(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.isWalletAttested(fields.wallet);
      expect(result).toBe(false);
    });

    it('returns false for an invalid attestation', async () => {
      const fields = {
        wallet: PublicKey.unique(),
        kycLevel: 2,
        jurisdictionBitmask: 1,
        commitment: new Uint8Array(32),
        expiryTimestamp: new BN(Math.floor(Date.now() / 1000) + 86400),
        isValid: false,
        attestedAt: new BN(1700000000),
        bump: 253,
      };

      const data = serializeAttestation(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.isWalletAttested(fields.wallet);
      expect(result).toBe(false);
    });

    it('returns false when no attestation exists', async () => {
      const mock = vi.fn().mockResolvedValue(null);
      const sdk = makeSdk(mock);

      const result = await sdk.isWalletAttested(PublicKey.unique());
      expect(result).toBe(false);
    });
  });

  describe('createInitializeInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createInitializeInstruction(authority, {
        circuitId: new Uint8Array(32),
        verificationKey: new Uint8Array(64),
      });

      expect(ix.programId.equals(DEFAULT_PROGRAM_IDS.zkVerifier)).toBe(true);
    });

    it('includes authority as a signer', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createInitializeInstruction(authority, {
        circuitId: new Uint8Array(32),
        verificationKey: new Uint8Array(64),
      });

      const authorityKey = ix.keys.find((k) => k.pubkey.equals(authority));
      expect(authorityKey).toBeDefined();
      expect(authorityKey!.isSigner).toBe(true);
    });

    it('includes verifier config PDA as writable', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createInitializeInstruction(authority, {
        circuitId: new Uint8Array(32),
        verificationKey: new Uint8Array(64),
      });

      const [expectedConfigPda] = sdk.deriveVerifierConfigPda();
      const configKey = ix.keys.find((k) => k.pubkey.equals(expectedConfigPda));
      expect(configKey).toBeDefined();
      expect(configKey!.isWritable).toBe(true);
    });
  });

  describe('createVerifyProofInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const wallet = PublicKey.unique();

      const ix = sdk.createVerifyProofInstruction(wallet, {
        proof: new Uint8Array(64),
        commitment: new Uint8Array(32),
        requiredKycLevel: 2,
        jurisdictionBitmask: 0b00000011,
        expiryTimestamp: 1800000000,
      });

      expect(ix.programId.equals(DEFAULT_PROGRAM_IDS.zkVerifier)).toBe(true);
    });

    it('includes wallet as a signer', () => {
      const sdk = makeSdk();
      const wallet = PublicKey.unique();

      const ix = sdk.createVerifyProofInstruction(wallet, {
        proof: new Uint8Array(64),
        commitment: new Uint8Array(32),
        requiredKycLevel: 2,
        jurisdictionBitmask: 0b00000011,
        expiryTimestamp: 1800000000,
      });

      const walletKey = ix.keys.find((k) => k.pubkey.equals(wallet));
      expect(walletKey).toBeDefined();
      expect(walletKey!.isSigner).toBe(true);
    });

    it('includes attestation PDA as writable', () => {
      const sdk = makeSdk();
      const wallet = PublicKey.unique();

      const ix = sdk.createVerifyProofInstruction(wallet, {
        proof: new Uint8Array(64),
        commitment: new Uint8Array(32),
        requiredKycLevel: 2,
        jurisdictionBitmask: 0b00000011,
        expiryTimestamp: 1800000000,
      });

      const [expectedAttestationPda] = sdk.deriveAttestationPda(wallet);
      const attestationKey = ix.keys.find((k) => k.pubkey.equals(expectedAttestationPda));
      expect(attestationKey).toBeDefined();
      expect(attestationKey!.isWritable).toBe(true);
    });
  });

  describe('createRevokeAttestationInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();
      const wallet = PublicKey.unique();

      const ix = sdk.createRevokeAttestationInstruction(authority, wallet);

      expect(ix.programId.equals(DEFAULT_PROGRAM_IDS.zkVerifier)).toBe(true);
    });

    it('includes authority as a signer', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();
      const wallet = PublicKey.unique();

      const ix = sdk.createRevokeAttestationInstruction(authority, wallet);

      const authorityKey = ix.keys.find((k) => k.pubkey.equals(authority));
      expect(authorityKey).toBeDefined();
      expect(authorityKey!.isSigner).toBe(true);
    });

    it('includes attestation PDA as writable', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();
      const wallet = PublicKey.unique();

      const ix = sdk.createRevokeAttestationInstruction(authority, wallet);

      const [expectedAttestationPda] = sdk.deriveAttestationPda(wallet);
      const attestationKey = ix.keys.find((k) => k.pubkey.equals(expectedAttestationPda));
      expect(attestationKey).toBeDefined();
      expect(attestationKey!.isWritable).toBe(true);
    });
  });

  describe('createToggleActiveInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createToggleActiveInstruction(authority, true);

      expect(ix.programId.equals(DEFAULT_PROGRAM_IDS.zkVerifier)).toBe(true);
    });

    it('includes authority as a signer', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createToggleActiveInstruction(authority, false);

      const authorityKey = ix.keys.find((k) => k.pubkey.equals(authority));
      expect(authorityKey).toBeDefined();
      expect(authorityKey!.isSigner).toBe(true);
    });

    it('includes config PDA as writable', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createToggleActiveInstruction(authority, true);

      const [expectedConfigPda] = sdk.deriveVerifierConfigPda();
      const configKey = ix.keys.find((k) => k.pubkey.equals(expectedConfigPda));
      expect(configKey).toBeDefined();
      expect(configKey!.isWritable).toBe(true);
    });
  });
});
