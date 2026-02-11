import { describe, it, expect, vi } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { MeridianClient, DEFAULT_PROGRAM_IDS } from '../client';
import { RwaSdk, RwaAsset, RwaAssetType, AssetStatus, Currency, Jurisdiction } from '../rwa';

function makeSdk(getAccountInfoMock?: ReturnType<typeof vi.fn>) {
  const connection = {
    commitment: 'confirmed',
    getAccountInfo: getAccountInfoMock ?? vi.fn().mockResolvedValue(null),
  } as unknown as Connection;
  const client = new MeridianClient({ connection });
  return new RwaSdk(client);
}

function makeAsset(overrides?: Partial<RwaAsset>): RwaAsset {
  return {
    authority: PublicKey.unique(),
    custodian: PublicKey.unique(),
    assetType: RwaAssetType.Equity,
    tokenMint: PublicKey.unique(),
    totalSupply: new BN(1_000_000),
    valuation: new BN(100_000_000),
    valuationCurrency: Currency.Jpy,
    name: 'Test Asset',
    symbol: 'TEST',
    isin: null,
    jurisdiction: Jurisdiction.Japan,
    legalDocumentHash: new Uint8Array(32),
    custodyProofHash: new Uint8Array(32),
    status: AssetStatus.Active,
    isFrozen: false,
    lastAudit: new BN(1700000000),
    createdAt: new BN(1700000000),
    bump: 255,
    ...overrides,
  };
}

function serializeRwaAsset(fields: {
  authority: PublicKey;
  custodian: PublicKey;
  assetType: RwaAssetType;
  tokenMint: PublicKey;
  totalSupply: BN;
  valuation: BN;
  valuationCurrency: Currency;
  name: string;
  symbol: string;
  isin: Uint8Array | null;
  jurisdiction: Jurisdiction;
  legalDocumentHash: Uint8Array;
  custodyProofHash: Uint8Array;
  status: AssetStatus;
  isFrozen: boolean;
  lastAudit: BN;
  createdAt: BN;
  bump: number;
}): Buffer {
  const nameBytes = Buffer.from(fields.name, 'utf8');
  const symbolBytes = Buffer.from(fields.symbol, 'utf8');
  const size = 8 + 32 * 3 + 1 + 8 * 2 + 1 + 4 + nameBytes.length + 4 + symbolBytes.length + 1 + 12 + 1 + 32 + 32 + 1 + 1 + 8 + 8 + 1;
  const buf = Buffer.alloc(size);
  let offset = 8;

  fields.authority.toBuffer().copy(buf, offset); offset += 32;
  fields.custodian.toBuffer().copy(buf, offset); offset += 32;
  buf[offset] = fields.assetType; offset += 1;
  fields.tokenMint.toBuffer().copy(buf, offset); offset += 32;
  buf.set(fields.totalSupply.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.valuation.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf[offset] = fields.valuationCurrency; offset += 1;

  buf.writeUInt32LE(nameBytes.length, offset); offset += 4;
  nameBytes.copy(buf, offset); offset += nameBytes.length;

  buf.writeUInt32LE(symbolBytes.length, offset); offset += 4;
  symbolBytes.copy(buf, offset); offset += symbolBytes.length;

  if (fields.isin) {
    buf[offset] = 1; offset += 1;
    buf.set(fields.isin, offset); offset += 12;
  } else {
    buf[offset] = 0; offset += 1;
    offset += 12;
  }

  buf[offset] = fields.jurisdiction; offset += 1;
  buf.set(fields.legalDocumentHash, offset); offset += 32;
  buf.set(fields.custodyProofHash, offset); offset += 32;
  buf[offset] = fields.status; offset += 1;
  buf[offset] = fields.isFrozen ? 1 : 0; offset += 1;
  buf.set(fields.lastAudit.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.createdAt.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf[offset] = fields.bump;

  return buf;
}

function serializeOwnershipProof(fields: {
  asset: PublicKey;
  owner: PublicKey;
  amount: BN;
  acquisitionPrice: BN;
  acquiredAt: BN;
  isActive: boolean;
  bump: number;
}): Buffer {
  const size = 8 + 32 * 2 + 8 * 3 + 1 + 1;
  const buf = Buffer.alloc(size);
  let offset = 8;

  fields.asset.toBuffer().copy(buf, offset); offset += 32;
  fields.owner.toBuffer().copy(buf, offset); offset += 32;
  buf.set(fields.amount.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.acquisitionPrice.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.acquiredAt.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf[offset] = fields.isActive ? 1 : 0; offset += 1;
  buf[offset] = fields.bump;

  return buf;
}

describe('RwaSdk', () => {
  describe('calculateYield', () => {
    it('returns percentage from valuation and annual dividend', () => {
      const sdk = makeSdk();
      const asset = makeAsset({ valuation: new BN(10000) });

      // annualDividend=500, valuation=10000 → 500*10000/10000 = 5000 / 100 = 50%
      const result = sdk.calculateYield(asset, new BN(500));
      expect(result).toBe(5);
    });

    it('returns 0 when valuation is zero', () => {
      const sdk = makeSdk();
      const asset = makeAsset({ valuation: new BN(0) });

      expect(sdk.calculateYield(asset, new BN(500))).toBe(0);
    });

    it('handles small yields', () => {
      const sdk = makeSdk();
      const asset = makeAsset({ valuation: new BN(100_000) });

      // 100 / 100000 = 0.1% → 100*10000/100000=10 → 10/100 = 0.1
      const result = sdk.calculateYield(asset, new BN(100));
      expect(result).toBe(0.1);
    });
  });

  describe('formatValuation', () => {
    it('formats JPY with ¥ symbol and 0 decimals', () => {
      const sdk = makeSdk();
      const result = sdk.formatValuation(new BN(1000000), Currency.Jpy);
      expect(result).toContain('¥');
      expect(result).toContain('1,000,000');
    });

    it('formats USD with $ symbol and 2 decimals', () => {
      const sdk = makeSdk();
      // 100050 / 100 = 1000.50
      const result = sdk.formatValuation(new BN(100050), Currency.Usd);
      expect(result).toContain('$');
    });

    it('formats EUR with € symbol', () => {
      const sdk = makeSdk();
      const result = sdk.formatValuation(new BN(100000), Currency.Eur);
      expect(result).toContain('€');
    });

    it('formats SGD with S$ symbol', () => {
      const sdk = makeSdk();
      const result = sdk.formatValuation(new BN(100000), Currency.Sgd);
      expect(result).toContain('S$');
    });
  });

  describe('createRegisterAssetInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createRegisterAssetInstruction(authority, {
        custodian: PublicKey.unique(),
        assetType: RwaAssetType.Equity,
        valuation: new BN(1000000),
        valuationCurrency: Currency.Jpy,
        name: 'Test',
        symbol: 'TST',
        jurisdiction: 0,
        legalDocumentHash: new Uint8Array(32),
      });

      expect(ix.programId.equals(
        DEFAULT_PROGRAM_IDS.rwaRegistry
      )).toBe(true);
    });

    it('includes authority as a signer', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createRegisterAssetInstruction(authority, {
        custodian: PublicKey.unique(),
        assetType: RwaAssetType.Bond,
        valuation: new BN(5000000),
        valuationCurrency: Currency.Usd,
        name: 'Bond',
        symbol: 'BND',
        jurisdiction: 1,
        legalDocumentHash: new Uint8Array(32),
      });

      const authorityKey = ix.keys.find((k) => k.pubkey.equals(authority));
      expect(authorityKey).toBeDefined();
      expect(authorityKey!.isSigner).toBe(true);
    });

    it('includes asset PDA as writable', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createRegisterAssetInstruction(authority, {
        custodian: PublicKey.unique(),
        assetType: RwaAssetType.RealEstate,
        valuation: new BN(100000000),
        valuationCurrency: Currency.Jpy,
        name: 'Real Estate',
        symbol: 'RE1',
        jurisdiction: 0,
        legalDocumentHash: new Uint8Array(32),
      });

      // Second key is the asset PDA
      const assetKey = ix.keys[1];
      expect(assetKey.isWritable).toBe(true);
    });
  });

  describe('createVerifyCustodyInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const custodian = PublicKey.unique();
      const asset = PublicKey.unique();

      const ix = sdk.createVerifyCustodyInstruction(
        custodian, asset, new Uint8Array(32)
      );

      expect(ix.programId.equals(
        DEFAULT_PROGRAM_IDS.rwaRegistry
      )).toBe(true);
    });

    it('includes custodian as a signer', () => {
      const sdk = makeSdk();
      const custodian = PublicKey.unique();
      const asset = PublicKey.unique();

      const ix = sdk.createVerifyCustodyInstruction(
        custodian, asset, new Uint8Array(32)
      );

      const custodianKey = ix.keys.find((k) => k.pubkey.equals(custodian));
      expect(custodianKey).toBeDefined();
      expect(custodianKey!.isSigner).toBe(true);
    });

    it('includes asset as writable', () => {
      const sdk = makeSdk();
      const custodian = PublicKey.unique();
      const asset = PublicKey.unique();

      const ix = sdk.createVerifyCustodyInstruction(
        custodian, asset, new Uint8Array(32)
      );

      const assetKey = ix.keys.find((k) => k.pubkey.equals(asset));
      expect(assetKey).toBeDefined();
      expect(assetKey!.isWritable).toBe(true);
    });
  });

  describe('createClaimDividendInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const owner = PublicKey.unique();
      const asset = PublicKey.unique();
      const dividend = PublicKey.unique();

      const ix = sdk.createClaimDividendInstruction(owner, asset, dividend);

      expect(ix.programId.equals(
        DEFAULT_PROGRAM_IDS.rwaRegistry
      )).toBe(true);
    });

    it('includes owner as a signer', () => {
      const sdk = makeSdk();
      const owner = PublicKey.unique();
      const asset = PublicKey.unique();
      const dividend = PublicKey.unique();

      const ix = sdk.createClaimDividendInstruction(owner, asset, dividend);

      const ownerKey = ix.keys.find((k) => k.pubkey.equals(owner));
      expect(ownerKey).toBeDefined();
      expect(ownerKey!.isSigner).toBe(true);
    });

    it('includes ownership PDA derived from asset and owner', () => {
      const sdk = makeSdk();
      const owner = PublicKey.unique();
      const asset = PublicKey.unique();
      const dividend = PublicKey.unique();

      const ix = sdk.createClaimDividendInstruction(owner, asset, dividend);

      // The instruction should have 4 keys: owner, asset, ownershipPda, dividend
      expect(ix.keys.length).toBe(4);

      // ownershipPda is derived deterministically
      const [expectedPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('ownership'), asset.toBuffer(), owner.toBuffer()],
        DEFAULT_PROGRAM_IDS.rwaRegistry
      );
      const pdaKey = ix.keys[2];
      expect(pdaKey.pubkey.equals(expectedPda)).toBe(true);
    });

    it('includes dividend as writable', () => {
      const sdk = makeSdk();
      const owner = PublicKey.unique();
      const asset = PublicKey.unique();
      const dividend = PublicKey.unique();

      const ix = sdk.createClaimDividendInstruction(owner, asset, dividend);

      const dividendKey = ix.keys.find((k) => k.pubkey.equals(dividend));
      expect(dividendKey).toBeDefined();
      expect(dividendKey!.isWritable).toBe(true);
    });
  });

  describe('getAsset', () => {
    it('deserializes an RwaAsset buffer', async () => {
      const legalHash = new Uint8Array(32);
      legalHash.fill(0xab);
      const custodyHash = new Uint8Array(32);
      custodyHash.fill(0xcd);

      const fields = {
        authority: PublicKey.unique(),
        custodian: PublicKey.unique(),
        assetType: RwaAssetType.Bond,
        tokenMint: PublicKey.unique(),
        totalSupply: new BN(10_000),
        valuation: new BN(50_000_000),
        valuationCurrency: Currency.Usd,
        name: 'Japan Govt Bond',
        symbol: 'JGB',
        isin: new Uint8Array([74, 80, 49, 50, 48, 49, 56, 55, 48, 48, 49, 50]),
        jurisdiction: Jurisdiction.Japan,
        legalDocumentHash: legalHash,
        custodyProofHash: custodyHash,
        status: AssetStatus.Active,
        isFrozen: false,
        lastAudit: new BN(1700000000),
        createdAt: new BN(1699000000),
        bump: 248,
      };

      const data = serializeRwaAsset(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.getAsset('JGB');

      expect(result).not.toBeNull();
      expect(result!.authority.equals(fields.authority)).toBe(true);
      expect(result!.custodian.equals(fields.custodian)).toBe(true);
      expect(result!.assetType).toBe(RwaAssetType.Bond);
      expect(result!.tokenMint.equals(fields.tokenMint)).toBe(true);
      expect(result!.totalSupply.eq(fields.totalSupply)).toBe(true);
      expect(result!.valuation.eq(fields.valuation)).toBe(true);
      expect(result!.valuationCurrency).toBe(Currency.Usd);
      expect(result!.name).toBe('Japan Govt Bond');
      expect(result!.symbol).toBe('JGB');
      expect(result!.isin).not.toBeNull();
      expect(Buffer.from(result!.isin!).toString()).toBe('JP1201870012');
      expect(result!.jurisdiction).toBe(Jurisdiction.Japan);
      expect(result!.legalDocumentHash).toEqual(legalHash);
      expect(result!.custodyProofHash).toEqual(custodyHash);
      expect(result!.status).toBe(AssetStatus.Active);
      expect(result!.isFrozen).toBe(false);
      expect(result!.lastAudit.eq(fields.lastAudit)).toBe(true);
      expect(result!.createdAt.eq(fields.createdAt)).toBe(true);
      expect(result!.bump).toBe(248);
    });

    it('deserializes an RwaAsset with no ISIN', async () => {
      const fields = {
        authority: PublicKey.unique(),
        custodian: PublicKey.unique(),
        assetType: RwaAssetType.RealEstate,
        tokenMint: PublicKey.unique(),
        totalSupply: new BN(100),
        valuation: new BN(200_000_000),
        valuationCurrency: Currency.Jpy,
        name: 'Tokyo Office',
        symbol: 'TKO1',
        isin: null,
        jurisdiction: Jurisdiction.Japan,
        legalDocumentHash: new Uint8Array(32),
        custodyProofHash: new Uint8Array(32),
        status: AssetStatus.Pending,
        isFrozen: true,
        lastAudit: new BN(0),
        createdAt: new BN(1699000000),
        bump: 247,
      };

      const data = serializeRwaAsset(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.getAsset('TKO1');

      expect(result).not.toBeNull();
      expect(result!.isin).toBeNull();
      expect(result!.isFrozen).toBe(true);
      expect(result!.status).toBe(AssetStatus.Pending);
    });

    it('returns null when account does not exist', async () => {
      const mock = vi.fn().mockResolvedValue(null);
      const sdk = makeSdk(mock);

      const result = await sdk.getAsset('NONE');
      expect(result).toBeNull();
    });
  });

  describe('getOwnershipProof', () => {
    it('deserializes an OwnershipProof buffer', async () => {
      const fields = {
        asset: PublicKey.unique(),
        owner: PublicKey.unique(),
        amount: new BN(500),
        acquisitionPrice: new BN(10_000),
        acquiredAt: new BN(1700000000),
        isActive: true,
        bump: 246,
      };

      const data = serializeOwnershipProof(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.getOwnershipProof(fields.asset, fields.owner);

      expect(result).not.toBeNull();
      expect(result!.asset.equals(fields.asset)).toBe(true);
      expect(result!.owner.equals(fields.owner)).toBe(true);
      expect(result!.amount.eq(fields.amount)).toBe(true);
      expect(result!.acquisitionPrice.eq(fields.acquisitionPrice)).toBe(true);
      expect(result!.acquiredAt.eq(fields.acquiredAt)).toBe(true);
      expect(result!.isActive).toBe(true);
      expect(result!.bump).toBe(246);
    });

    it('returns null when account does not exist', async () => {
      const mock = vi.fn().mockResolvedValue(null);
      const sdk = makeSdk(mock);

      const result = await sdk.getOwnershipProof(PublicKey.unique(), PublicKey.unique());
      expect(result).toBeNull();
    });
  });
});
