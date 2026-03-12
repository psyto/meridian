import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import { MeridianClient } from './client';
import { BN } from '@coral-xyz/anchor';

/**
 * ZK Verifier SDK Module
 *
 * Handles on-chain zero-knowledge proof verification and compliance
 * attestation management for the Meridian platform.
 */

export interface VerifierConfig {
  authority: PublicKey;
  circuitId: Uint8Array;
  verificationKey: Uint8Array;
  totalVerifications: BN;
  totalAttestations: BN;
  isActive: boolean;
  createdAt: BN;
  updatedAt: BN;
  bump: number;
}

export interface ComplianceAttestation {
  wallet: PublicKey;
  kycLevel: number;
  jurisdictionBitmask: number;
  commitment: Uint8Array;
  expiryTimestamp: BN;
  isValid: boolean;
  attestedAt: BN;
  bump: number;
}

/**
 * ZK Verifier SDK
 */
export class ZkVerifierSdk {
  private client: MeridianClient;

  constructor(client: MeridianClient) {
    this.client = client;
  }

  // ---------------------------------------------------------------------------
  // PDA helpers
  // ---------------------------------------------------------------------------

  deriveVerifierConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('verifier_config')],
      this.client.programIds.zkVerifier
    );
  }

  deriveAttestationPda(wallet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('attestation'), wallet.toBuffer()],
      this.client.programIds.zkVerifier
    );
  }

  // ---------------------------------------------------------------------------
  // Query methods
  // ---------------------------------------------------------------------------

  /**
   * Get verifier configuration
   */
  async getVerifierConfig(): Promise<VerifierConfig | null> {
    const [configPda] = this.deriveVerifierConfigPda();

    try {
      const accountInfo = await this.client.connection.getAccountInfo(configPda);
      if (!accountInfo) return null;

      return this.deserializeVerifierConfig(accountInfo.data as Buffer);
    } catch {
      return null;
    }
  }

  /**
   * Get compliance attestation for a wallet
   */
  async getAttestation(wallet: PublicKey): Promise<ComplianceAttestation | null> {
    const [attestationPda] = this.deriveAttestationPda(wallet);

    try {
      const accountInfo = await this.client.connection.getAccountInfo(attestationPda);
      if (!accountInfo) return null;

      return this.deserializeAttestation(accountInfo.data as Buffer);
    } catch {
      return null;
    }
  }

  /**
   * Check whether a wallet has a valid, non-expired attestation
   */
  async isWalletAttested(wallet: PublicKey): Promise<boolean> {
    const attestation = await this.getAttestation(wallet);
    if (!attestation) return false;
    if (!attestation.isValid) return false;

    const now = new BN(Math.floor(Date.now() / 1000));
    return attestation.expiryTimestamp.gt(now);
  }

  // ---------------------------------------------------------------------------
  // Instruction builders
  // ---------------------------------------------------------------------------

  /**
   * Create initialize instruction
   */
  createInitializeInstruction(
    authority: PublicKey,
    params: {
      circuitId: Uint8Array;
      verificationKey: Uint8Array;
    }
  ): TransactionInstruction {
    const [configPda] = this.deriveVerifierConfigPda();

    // 8 disc + 4 circuitId length + circuitId + 4 verificationKey length + verificationKey
    const data = Buffer.alloc(8 + 4 + params.circuitId.length + 4 + params.verificationKey.length);
    let offset = 8;
    data.writeUInt32LE(params.circuitId.length, offset); offset += 4;
    data.set(params.circuitId, offset); offset += params.circuitId.length;
    data.writeUInt32LE(params.verificationKey.length, offset); offset += 4;
    data.set(params.verificationKey, offset);

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.client.programIds.zkVerifier,
      data,
    });
  }

  /**
   * Create verify proof instruction
   */
  createVerifyProofInstruction(
    wallet: PublicKey,
    params: {
      proof: Uint8Array;
      commitment: Uint8Array;
      requiredKycLevel: number;
      jurisdictionBitmask: number;
      expiryTimestamp: number;
    }
  ): TransactionInstruction {
    const [configPda] = this.deriveVerifierConfigPda();
    const [attestationPda] = this.deriveAttestationPda(wallet);

    // 8 disc + 64 proof + 32 commitment + 1 requiredKycLevel + 4 jurisdictionBitmask + 8 expiryTimestamp
    const data = Buffer.alloc(8 + 64 + 32 + 1 + 4 + 8);
    let offset = 8;
    data.set(params.proof.subarray(0, 64), offset); offset += 64;
    data.set(params.commitment.subarray(0, 32), offset); offset += 32;
    data.writeUInt8(params.requiredKycLevel, offset); offset += 1;
    data.writeUInt32LE(params.jurisdictionBitmask, offset); offset += 4;
    const expiryBn = new BN(params.expiryTimestamp);
    expiryBn.toArrayLike(Buffer, 'le', 8).copy(data, offset);

    return new TransactionInstruction({
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: attestationPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.client.programIds.zkVerifier,
      data,
    });
  }

  /**
   * Create revoke attestation instruction
   */
  createRevokeAttestationInstruction(
    authority: PublicKey,
    wallet: PublicKey
  ): TransactionInstruction {
    const [configPda] = this.deriveVerifierConfigPda();
    const [attestationPda] = this.deriveAttestationPda(wallet);

    const data = Buffer.alloc(8);

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: attestationPda, isSigner: false, isWritable: true },
      ],
      programId: this.client.programIds.zkVerifier,
      data,
    });
  }

  /**
   * Create toggle active instruction
   */
  createToggleActiveInstruction(
    authority: PublicKey,
    activate: boolean
  ): TransactionInstruction {
    const [configPda] = this.deriveVerifierConfigPda();

    // 8 disc + 1 activate
    const data = Buffer.alloc(8 + 1);
    data[8] = activate ? 1 : 0;

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: true },
      ],
      programId: this.client.programIds.zkVerifier,
      data,
    });
  }

  // ---------------------------------------------------------------------------
  // Deserialization
  // ---------------------------------------------------------------------------

  private deserializeVerifierConfig(data: Buffer): VerifierConfig | null {
    try {
      let offset = 8; // skip discriminator

      const authority = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      // circuitId: length-prefixed bytes
      const circuitIdLen = data.readUInt32LE(offset);
      offset += 4;
      const circuitId = new Uint8Array(data.subarray(offset, offset + circuitIdLen));
      offset += circuitIdLen;

      // verificationKey: length-prefixed bytes
      const vkLen = data.readUInt32LE(offset);
      offset += 4;
      const verificationKey = new Uint8Array(data.subarray(offset, offset + vkLen));
      offset += vkLen;

      const totalVerifications = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const totalAttestations = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const isActive = data[offset] === 1;
      offset += 1;

      const createdAt = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const updatedAt = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const bump = data[offset];

      return {
        authority,
        circuitId,
        verificationKey,
        totalVerifications,
        totalAttestations,
        isActive,
        createdAt,
        updatedAt,
        bump,
      };
    } catch {
      return null;
    }
  }

  private deserializeAttestation(data: Buffer): ComplianceAttestation | null {
    try {
      let offset = 8; // skip discriminator

      const wallet = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const kycLevel = data[offset];
      offset += 1;

      const jurisdictionBitmask = data.readUInt32LE(offset);
      offset += 4;

      const commitment = new Uint8Array(data.subarray(offset, offset + 32));
      offset += 32;

      const expiryTimestamp = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const isValid = data[offset] === 1;
      offset += 1;

      const attestedAt = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const bump = data[offset];

      return {
        wallet,
        kycLevel,
        jurisdictionBitmask,
        commitment,
        expiryTimestamp,
        isValid,
        attestedAt,
        bump,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Create ZK Verifier SDK instance
 */
export function createZkVerifierSdk(client: MeridianClient): ZkVerifierSdk {
  return new ZkVerifierSdk(client);
}
