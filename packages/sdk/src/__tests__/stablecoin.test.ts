import { describe, it, expect, vi } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { MeridianClient, DEFAULT_PROGRAM_IDS } from '../client';
import { StablecoinSdk, IssuerType } from '../stablecoin';

function makeSdk(getAccountInfoMock?: ReturnType<typeof vi.fn>) {
  const connection = {
    commitment: 'confirmed',
    getAccountInfo: getAccountInfoMock ?? vi.fn().mockResolvedValue(null),
  } as unknown as Connection;
  const client = new MeridianClient({ connection });
  return new StablecoinSdk(client);
}

function serializeMintConfig(fields: {
  authority: PublicKey;
  mint: PublicKey;
  transferHookProgram: PublicKey;
  totalSupply: BN;
  totalCollateral: BN;
  collateralRatioBps: BN;
  isPaused: boolean;
  freezeAuthority: PublicKey | null;
  priceOracle: PublicKey | null;
  lastAudit: BN;
  createdAt: BN;
  updatedAt: BN;
  bump: number;
}): Buffer {
  // 8 disc + 3*32 pubkeys + 3*8 u64 + 1 bool + 2*(1+32) options + 3*8 i64 + 1 u8
  const buf = Buffer.alloc(8 + 32 * 3 + 8 * 3 + 1 + 33 + 33 + 8 * 3 + 1);
  let offset = 8; // skip discriminator

  fields.authority.toBuffer().copy(buf, offset); offset += 32;
  fields.mint.toBuffer().copy(buf, offset); offset += 32;
  fields.transferHookProgram.toBuffer().copy(buf, offset); offset += 32;

  buf.set(fields.totalSupply.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.totalCollateral.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.collateralRatioBps.toArrayLike(Buffer, 'le', 8), offset); offset += 8;

  buf[offset] = fields.isPaused ? 1 : 0; offset += 1;

  if (fields.freezeAuthority) {
    buf[offset] = 1; offset += 1;
    fields.freezeAuthority.toBuffer().copy(buf, offset); offset += 32;
  } else {
    buf[offset] = 0; offset += 1;
    offset += 32;
  }

  if (fields.priceOracle) {
    buf[offset] = 1; offset += 1;
    fields.priceOracle.toBuffer().copy(buf, offset); offset += 32;
  } else {
    buf[offset] = 0; offset += 1;
    offset += 32;
  }

  buf.set(fields.lastAudit.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.createdAt.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.updatedAt.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf[offset] = fields.bump;

  return buf;
}

function serializeIssuer(fields: {
  authority: PublicKey;
  mintConfig: PublicKey;
  issuerType: IssuerType;
  dailyMintLimit: BN;
  dailyBurnLimit: BN;
  dailyMinted: BN;
  dailyBurned: BN;
  lastDailyReset: BN;
  totalMinted: BN;
  totalBurned: BN;
  isActive: boolean;
  registeredAt: BN;
  bump: number;
}): Buffer {
  // 8 disc + 2*32 pubkeys + 1 enum + 6*8 u64 + 1*8 i64 + 1 bool + 1*8 i64 + 1 u8 = 8+64+1+56+1+8+1 = 139
  const buf = Buffer.alloc(8 + 32 * 2 + 1 + 8 * 8 + 1 + 1);
  let offset = 8;

  fields.authority.toBuffer().copy(buf, offset); offset += 32;
  fields.mintConfig.toBuffer().copy(buf, offset); offset += 32;

  buf[offset] = fields.issuerType; offset += 1;

  buf.set(fields.dailyMintLimit.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.dailyBurnLimit.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.dailyMinted.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.dailyBurned.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.lastDailyReset.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.totalMinted.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.totalBurned.toArrayLike(Buffer, 'le', 8), offset); offset += 8;

  buf[offset] = fields.isActive ? 1 : 0; offset += 1;

  buf.set(fields.registeredAt.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf[offset] = fields.bump;

  return buf;
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

  describe('getMintConfig', () => {
    it('deserializes a MintConfig buffer with optional fields present', async () => {
      const fields = {
        authority: PublicKey.unique(),
        mint: PublicKey.unique(),
        transferHookProgram: PublicKey.unique(),
        totalSupply: new BN(5_000_000),
        totalCollateral: new BN(5_200_000),
        collateralRatioBps: new BN(10400),
        isPaused: false,
        freezeAuthority: PublicKey.unique(),
        priceOracle: PublicKey.unique(),
        lastAudit: new BN(1700000000),
        createdAt: new BN(1699000000),
        updatedAt: new BN(1700500000),
        bump: 254,
      };

      const data = serializeMintConfig(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.getMintConfig();

      expect(result).not.toBeNull();
      expect(result!.authority.equals(fields.authority)).toBe(true);
      expect(result!.mint.equals(fields.mint)).toBe(true);
      expect(result!.transferHookProgram.equals(fields.transferHookProgram)).toBe(true);
      expect(result!.totalSupply.eq(fields.totalSupply)).toBe(true);
      expect(result!.totalCollateral.eq(fields.totalCollateral)).toBe(true);
      expect(result!.collateralRatioBps.eq(fields.collateralRatioBps)).toBe(true);
      expect(result!.isPaused).toBe(false);
      expect(result!.freezeAuthority!.equals(fields.freezeAuthority!)).toBe(true);
      expect(result!.priceOracle!.equals(fields.priceOracle!)).toBe(true);
      expect(result!.lastAudit.eq(fields.lastAudit)).toBe(true);
      expect(result!.createdAt.eq(fields.createdAt)).toBe(true);
      expect(result!.updatedAt.eq(fields.updatedAt)).toBe(true);
      expect(result!.bump).toBe(254);
    });

    it('deserializes with optional fields absent', async () => {
      const fields = {
        authority: PublicKey.unique(),
        mint: PublicKey.unique(),
        transferHookProgram: PublicKey.unique(),
        totalSupply: new BN(1000),
        totalCollateral: new BN(1000),
        collateralRatioBps: new BN(10000),
        isPaused: true,
        freezeAuthority: null,
        priceOracle: null,
        lastAudit: new BN(0),
        createdAt: new BN(1699000000),
        updatedAt: new BN(1699000000),
        bump: 255,
      };

      const data = serializeMintConfig(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.getMintConfig();

      expect(result).not.toBeNull();
      expect(result!.isPaused).toBe(true);
      expect(result!.freezeAuthority).toBeNull();
      expect(result!.priceOracle).toBeNull();
      expect(result!.bump).toBe(255);
    });

    it('returns null when account does not exist', async () => {
      const mock = vi.fn().mockResolvedValue(null);
      const sdk = makeSdk(mock);

      const result = await sdk.getMintConfig();
      expect(result).toBeNull();
    });
  });

  describe('getIssuer', () => {
    it('deserializes an Issuer buffer', async () => {
      const fields = {
        authority: PublicKey.unique(),
        mintConfig: PublicKey.unique(),
        issuerType: IssuerType.Exchange,
        dailyMintLimit: new BN(1_000_000),
        dailyBurnLimit: new BN(500_000),
        dailyMinted: new BN(100_000),
        dailyBurned: new BN(50_000),
        lastDailyReset: new BN(1700000000),
        totalMinted: new BN(10_000_000),
        totalBurned: new BN(5_000_000),
        isActive: true,
        registeredAt: new BN(1699000000),
        bump: 253,
      };

      const data = serializeIssuer(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.getIssuer(fields.authority);

      expect(result).not.toBeNull();
      expect(result!.authority.equals(fields.authority)).toBe(true);
      expect(result!.mintConfig.equals(fields.mintConfig)).toBe(true);
      expect(result!.issuerType).toBe(IssuerType.Exchange);
      expect(result!.dailyMintLimit.eq(fields.dailyMintLimit)).toBe(true);
      expect(result!.dailyBurnLimit.eq(fields.dailyBurnLimit)).toBe(true);
      expect(result!.dailyMinted.eq(fields.dailyMinted)).toBe(true);
      expect(result!.dailyBurned.eq(fields.dailyBurned)).toBe(true);
      expect(result!.lastDailyReset.eq(fields.lastDailyReset)).toBe(true);
      expect(result!.totalMinted.eq(fields.totalMinted)).toBe(true);
      expect(result!.totalBurned.eq(fields.totalBurned)).toBe(true);
      expect(result!.isActive).toBe(true);
      expect(result!.registeredAt.eq(fields.registeredAt)).toBe(true);
      expect(result!.bump).toBe(253);
    });

    it('returns null when account does not exist', async () => {
      const mock = vi.fn().mockResolvedValue(null);
      const sdk = makeSdk(mock);

      const result = await sdk.getIssuer(PublicKey.unique());
      expect(result).toBeNull();
    });
  });
});
