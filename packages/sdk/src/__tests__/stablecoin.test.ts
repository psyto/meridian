import { describe, it, expect } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { MeridianClient, DEFAULT_PROGRAM_IDS } from '../client';
import { StablecoinSdk } from '../stablecoin';

function makeSdk() {
  const client = new MeridianClient({
    connection: { commitment: 'confirmed' } as unknown as Connection,
  });
  return new StablecoinSdk(client);
}

describe('StablecoinSdk', () => {
  describe('formatAmount', () => {
    it('formats BN with yen symbol and 2 decimals', () => {
      const sdk = makeSdk();
      // 123456 → ¥1,234.56
      expect(sdk.formatAmount(new BN(123456))).toBe('¥1,234.56');
    });

    it('formats small amounts correctly', () => {
      const sdk = makeSdk();
      // 5 → ¥0.05
      expect(sdk.formatAmount(new BN(5))).toBe('¥0.05');
    });

    it('formats zero', () => {
      const sdk = makeSdk();
      expect(sdk.formatAmount(new BN(0))).toBe('¥0.00');
    });

    it('formats single-digit decimal part', () => {
      const sdk = makeSdk();
      // 10 → ¥0.10
      expect(sdk.formatAmount(new BN(10))).toBe('¥0.10');
    });

    it('formats amounts with no fractional part', () => {
      const sdk = makeSdk();
      // 100 → ¥1.00
      expect(sdk.formatAmount(new BN(100))).toBe('¥1.00');
    });
  });

  describe('parseAmount', () => {
    it('parses a decimal string to BN', () => {
      const sdk = makeSdk();
      const result = sdk.parseAmount('1234.56');
      expect(result.eq(new BN(123456))).toBe(true);
    });

    it('handles string with no decimal part', () => {
      const sdk = makeSdk();
      const result = sdk.parseAmount('1234');
      expect(result.eq(new BN(123400))).toBe(true);
    });

    it('strips yen symbol and commas', () => {
      const sdk = makeSdk();
      const result = sdk.parseAmount('¥1,234.56');
      expect(result.eq(new BN(123456))).toBe(true);
    });

    it('handles single decimal digit', () => {
      const sdk = makeSdk();
      const result = sdk.parseAmount('1.5');
      expect(result.eq(new BN(150))).toBe(true);
    });
  });

  describe('formatAmount / parseAmount round-trip', () => {
    it('preserves value through format then parse', () => {
      const sdk = makeSdk();
      const original = new BN(123456);
      const formatted = sdk.formatAmount(original);
      const parsed = sdk.parseAmount(formatted);
      expect(parsed.eq(original)).toBe(true);
    });

    it('round-trips large values', () => {
      const sdk = makeSdk();
      const original = new BN(100000000); // ¥1,000,000.00
      const formatted = sdk.formatAmount(original);
      const parsed = sdk.parseAmount(formatted);
      expect(parsed.eq(original)).toBe(true);
    });
  });

  describe('createMintInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const issuer = PublicKey.unique();
      const recipient = PublicKey.unique();

      const ix = sdk.createMintInstruction(issuer, recipient, {
        amount: new BN(1000),
        reference: new Uint8Array(32),
      });

      expect(ix.programId.equals(DEFAULT_PROGRAM_IDS.stablecoinMint)).toBe(true);
    });

    it('includes issuerAuthority as a signer', () => {
      const sdk = makeSdk();
      const issuer = PublicKey.unique();
      const recipient = PublicKey.unique();

      const ix = sdk.createMintInstruction(issuer, recipient, {
        amount: new BN(1000),
        reference: new Uint8Array(32),
      });

      const issuerKey = ix.keys.find((k) => k.pubkey.equals(issuer));
      expect(issuerKey).toBeDefined();
      expect(issuerKey!.isSigner).toBe(true);
    });
  });

  describe('createBurnInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const holder = PublicKey.unique();

      const ix = sdk.createBurnInstruction(holder, {
        amount: new BN(500),
        redemptionInfo: new Uint8Array(64),
      });

      expect(ix.programId.equals(DEFAULT_PROGRAM_IDS.stablecoinMint)).toBe(true);
    });

    it('includes holder as a signer', () => {
      const sdk = makeSdk();
      const holder = PublicKey.unique();

      const ix = sdk.createBurnInstruction(holder, {
        amount: new BN(500),
        redemptionInfo: new Uint8Array(64),
      });

      const holderKey = ix.keys.find((k) => k.pubkey.equals(holder));
      expect(holderKey).toBeDefined();
      expect(holderKey!.isSigner).toBe(true);
    });
  });

  describe('createTransferInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const sender = PublicKey.unique();
      const recipient = PublicKey.unique();

      const ix = sdk.createTransferInstruction(sender, recipient, {
        amount: new BN(200),
      });

      expect(ix.programId.equals(DEFAULT_PROGRAM_IDS.stablecoinMint)).toBe(true);
    });

    it('includes sender as a signer', () => {
      const sdk = makeSdk();
      const sender = PublicKey.unique();
      const recipient = PublicKey.unique();

      const ix = sdk.createTransferInstruction(sender, recipient, {
        amount: new BN(200),
      });

      const senderKey = ix.keys.find((k) => k.pubkey.equals(sender));
      expect(senderKey).toBeDefined();
      expect(senderKey!.isSigner).toBe(true);
    });

    it('includes recipient as writable', () => {
      const sdk = makeSdk();
      const sender = PublicKey.unique();
      const recipient = PublicKey.unique();

      const ix = sdk.createTransferInstruction(sender, recipient, {
        amount: new BN(200),
      });

      const recipientKey = ix.keys.find((k) => k.pubkey.equals(recipient));
      expect(recipientKey).toBeDefined();
      expect(recipientKey!.isWritable).toBe(true);
    });
  });
});
