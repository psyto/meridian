import {
  EncryptionKeypair,
  EncryptedData as VeilEncryptedData,
  generateEncryptionKeypair,
  deriveEncryptionKeypair,
  encrypt as veilEncrypt,
  decrypt as veilDecrypt,
} from '@veil/crypto';
import type { KeyPair, EncryptedData, DecryptedData } from './types';

/**
 * NaCl Box encryption for KYC data and confidential metadata.
 *
 * Uses Curve25519-XSalsa20-Poly1305 for authenticated public-key encryption.
 * Powered by @veil/crypto.
 */
export class NaclBox {
  private keypair: EncryptionKeypair;

  constructor(secretKey?: Uint8Array) {
    if (secretKey) {
      this.keypair = deriveEncryptionKeypair(secretKey);
    } else {
      this.keypair = generateEncryptionKeypair();
    }
  }

  /**
   * Get the public key for sharing with counterparties
   */
  getPublicKey(): Uint8Array {
    return this.keypair.publicKey;
  }

  /**
   * Get the key pair
   */
  getKeyPair(): KeyPair {
    return {
      publicKey: this.keypair.publicKey,
      secretKey: this.keypair.secretKey,
    };
  }

  /**
   * Encrypt data for a specific recipient using their public key
   */
  encrypt(plaintext: Uint8Array, recipientPublicKey: Uint8Array): EncryptedData {
    const result = veilEncrypt(plaintext, recipientPublicKey, this.keypair);
    return {
      ciphertext: result.ciphertext,
      nonce: result.nonce,
      senderPublicKey: this.keypair.publicKey,
    };
  }

  /**
   * Encrypt a string message
   */
  encryptString(message: string, recipientPublicKey: Uint8Array): EncryptedData {
    return this.encrypt(new TextEncoder().encode(message), recipientPublicKey);
  }

  /**
   * Decrypt data from a specific sender
   */
  decrypt(encrypted: EncryptedData): DecryptedData {
    const combined = new Uint8Array(encrypted.nonce.length + encrypted.ciphertext.length);
    combined.set(encrypted.nonce, 0);
    combined.set(encrypted.ciphertext, encrypted.nonce.length);

    const plaintext = veilDecrypt(combined, encrypted.senderPublicKey, this.keypair);
    return { plaintext };
  }

  /**
   * Decrypt and return as string
   */
  decryptString(encrypted: EncryptedData): string {
    const { plaintext } = this.decrypt(encrypted);
    return new TextDecoder().decode(plaintext);
  }

  /**
   * Generate a hash of the encrypted data for on-chain storage
   * Uses SHA-256 to create a 32-byte hash suitable for Solana accounts
   */
  static async hash(data: Uint8Array): Promise<Uint8Array> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hashBuffer);
  }

  /**
   * Generate a hash from a string
   */
  static async hashString(data: string): Promise<Uint8Array> {
    return NaclBox.hash(new TextEncoder().encode(data));
  }

  /**
   * Generate a new random key pair
   */
  static generateKeyPair(): KeyPair {
    const kp = generateEncryptionKeypair();
    return {
      publicKey: kp.publicKey,
      secretKey: kp.secretKey,
    };
  }
}

/**
 * Create a NaCl Box instance
 */
export function createNaclBox(secretKey?: Uint8Array): NaclBox {
  return new NaclBox(secretKey);
}
