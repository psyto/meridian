export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface EncryptedData {
  /** The encrypted ciphertext */
  ciphertext: Uint8Array;
  /** The nonce used for encryption */
  nonce: Uint8Array;
  /** The sender's public key (for box encryption) */
  senderPublicKey: Uint8Array;
}

export interface DecryptedData {
  /** The decrypted plaintext */
  plaintext: Uint8Array;
}

export interface ShamirShare {
  /** Share index (1-indexed) */
  index: number;
  /** The share data */
  data: Uint8Array;
}

export interface ShamirConfig {
  /** Total number of shares to generate */
  totalShares: number;
  /** Minimum shares needed to reconstruct */
  threshold: number;
}
