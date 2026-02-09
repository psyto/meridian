import nacl from 'tweetnacl';
import { encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import type { KeyPair, EncryptedData, DecryptedData } from './types';

/**
 * NaCl Box encryption for KYC data and confidential metadata.
 *
 * Uses Curve25519-XSalsa20-Poly1305 for authenticated public-key encryption.
 * This is the standard for encrypting KYC/AML data that needs to be shared
 * between specific parties (e.g., compliance officer and trust bank).
 */
export class NaclBox {
  private keyPair: nacl.BoxKeyPair;

  constructor(secretKey?: Uint8Array) {
    if (secretKey) {
      this.keyPair = nacl.box.keyPair.fromSecretKey(secretKey);
    } else {
      this.keyPair = nacl.box.keyPair();
    }
  }

  /**
   * Get the public key for sharing with counterparties
   */
  getPublicKey(): Uint8Array {
    return this.keyPair.publicKey;
  }

  /**
   * Get the key pair
   */
  getKeyPair(): KeyPair {
    return {
      publicKey: this.keyPair.publicKey,
      secretKey: this.keyPair.secretKey,
    };
  }

  /**
   * Encrypt data for a specific recipient using their public key
   */
  encrypt(plaintext: Uint8Array, recipientPublicKey: Uint8Array): EncryptedData {
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const ciphertext = nacl.box(
      plaintext,
      nonce,
      recipientPublicKey,
      this.keyPair.secretKey
    );

    if (!ciphertext) {
      throw new Error('Encryption failed');
    }

    return {
      ciphertext,
      nonce,
      senderPublicKey: this.keyPair.publicKey,
    };
  }

  /**
   * Encrypt a string message
   */
  encryptString(message: string, recipientPublicKey: Uint8Array): EncryptedData {
    return this.encrypt(decodeUTF8(message), recipientPublicKey);
  }

  /**
   * Decrypt data from a specific sender
   */
  decrypt(encrypted: EncryptedData): DecryptedData {
    const plaintext = nacl.box.open(
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.senderPublicKey,
      this.keyPair.secretKey
    );

    if (!plaintext) {
      throw new Error('Decryption failed - invalid ciphertext or wrong key');
    }

    return { plaintext };
  }

  /**
   * Decrypt and return as string
   */
  decryptString(encrypted: EncryptedData): string {
    const { plaintext } = this.decrypt(encrypted);
    return encodeUTF8(plaintext);
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
    return NaclBox.hash(decodeUTF8(data));
  }

  /**
   * Generate a new random key pair
   */
  static generateKeyPair(): KeyPair {
    const kp = nacl.box.keyPair();
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
