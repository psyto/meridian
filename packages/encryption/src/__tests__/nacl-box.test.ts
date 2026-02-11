import { describe, it, expect } from 'vitest';
import { NaclBox, createNaclBox } from '../nacl-box';

describe('NaclBox', () => {
  describe('constructor', () => {
    it('generates a random keypair when no secret key provided', () => {
      const box1 = new NaclBox();
      const box2 = new NaclBox();
      expect(box1.getPublicKey()).not.toEqual(box2.getPublicKey());
    });

    it('reconstructs keypair from existing secret key', () => {
      const original = new NaclBox();
      const { secretKey, publicKey } = original.getKeyPair();
      const restored = new NaclBox(secretKey);
      expect(restored.getPublicKey()).toEqual(publicKey);
    });
  });

  describe('getPublicKey / getKeyPair', () => {
    it('returns a 32-byte public key', () => {
      const box = new NaclBox();
      expect(box.getPublicKey()).toBeInstanceOf(Uint8Array);
      expect(box.getPublicKey().length).toBe(32);
    });

    it('returns a KeyPair with 32-byte keys', () => {
      const box = new NaclBox();
      const kp = box.getKeyPair();
      expect(kp.publicKey).toBeInstanceOf(Uint8Array);
      expect(kp.secretKey).toBeInstanceOf(Uint8Array);
      expect(kp.publicKey.length).toBe(32);
      expect(kp.secretKey.length).toBe(32);
    });
  });

  describe('encrypt / decrypt round-trip', () => {
    it('encrypts and decrypts Uint8Array data', () => {
      const sender = new NaclBox();
      const recipient = new NaclBox();

      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
      const encrypted = sender.encrypt(plaintext, recipient.getPublicKey());
      const decrypted = recipient.decrypt(encrypted);

      expect(decrypted.plaintext).toEqual(plaintext);
    });
  });

  describe('encryptString / decryptString round-trip', () => {
    it('encrypts and decrypts string messages', () => {
      const sender = new NaclBox();
      const recipient = new NaclBox();

      const message = 'Hello, confidential world!';
      const encrypted = sender.encryptString(message, recipient.getPublicKey());
      const decrypted = recipient.decryptString(encrypted);

      expect(decrypted).toBe(message);
    });
  });

  describe('decrypt with wrong key', () => {
    it('throws when a different recipient tries to decrypt', () => {
      const sender = new NaclBox();
      const recipient = new NaclBox();
      const wrongRecipient = new NaclBox();

      const encrypted = sender.encryptString('secret', recipient.getPublicKey());

      expect(() => wrongRecipient.decrypt(encrypted)).toThrow(
        'Decryption failed'
      );
    });
  });

  describe('decrypt with tampered ciphertext', () => {
    it('throws when ciphertext is corrupted', () => {
      const sender = new NaclBox();
      const recipient = new NaclBox();

      const encrypted = sender.encryptString('secret', recipient.getPublicKey());
      encrypted.ciphertext[0] ^= 0xff;

      expect(() => recipient.decrypt(encrypted)).toThrow('Decryption failed');
    });
  });

  describe('EncryptedData shape', () => {
    it('contains ciphertext, 24-byte nonce, and 32-byte senderPublicKey', () => {
      const sender = new NaclBox();
      const recipient = new NaclBox();

      const encrypted = sender.encryptString('data', recipient.getPublicKey());

      expect(encrypted.ciphertext).toBeInstanceOf(Uint8Array);
      expect(encrypted.nonce).toBeInstanceOf(Uint8Array);
      expect(encrypted.nonce.length).toBe(24);
      expect(encrypted.senderPublicKey).toBeInstanceOf(Uint8Array);
      expect(encrypted.senderPublicKey.length).toBe(32);
      expect(encrypted.senderPublicKey).toEqual(sender.getPublicKey());
    });
  });

  describe('hash / hashString (static)', () => {
    it('produces a 32-byte SHA-256 hash', async () => {
      const data = new Uint8Array([1, 2, 3]);
      const h = await NaclBox.hash(data);
      expect(h).toBeInstanceOf(Uint8Array);
      expect(h.length).toBe(32);
    });

    it('is deterministic for the same input', async () => {
      const data = new Uint8Array([10, 20, 30]);
      const h1 = await NaclBox.hash(data);
      const h2 = await NaclBox.hash(data);
      expect(h1).toEqual(h2);
    });

    it('produces different hashes for different inputs', async () => {
      const h1 = await NaclBox.hash(new Uint8Array([1]));
      const h2 = await NaclBox.hash(new Uint8Array([2]));
      expect(h1).not.toEqual(h2);
    });

    it('hashes a string via hashString', async () => {
      const h = await NaclBox.hashString('hello');
      expect(h).toBeInstanceOf(Uint8Array);
      expect(h.length).toBe(32);
    });

    it('hashString is deterministic', async () => {
      const h1 = await NaclBox.hashString('test');
      const h2 = await NaclBox.hashString('test');
      expect(h1).toEqual(h2);
    });
  });

  describe('generateKeyPair (static)', () => {
    it('returns a KeyPair with 32-byte publicKey and secretKey', () => {
      const kp = NaclBox.generateKeyPair();
      expect(kp.publicKey).toBeInstanceOf(Uint8Array);
      expect(kp.secretKey).toBeInstanceOf(Uint8Array);
      expect(kp.publicKey.length).toBe(32);
      expect(kp.secretKey.length).toBe(32);
    });
  });

  describe('createNaclBox', () => {
    it('returns a NaclBox instance without args', () => {
      const box = createNaclBox();
      expect(box).toBeInstanceOf(NaclBox);
      expect(box.getPublicKey().length).toBe(32);
    });

    it('returns a NaclBox instance with a secret key', () => {
      const kp = NaclBox.generateKeyPair();
      const box = createNaclBox(kp.secretKey);
      expect(box).toBeInstanceOf(NaclBox);
      expect(box.getPublicKey()).toEqual(kp.publicKey);
    });
  });
});
