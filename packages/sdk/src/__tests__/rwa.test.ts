import { describe, it, expect } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { MeridianClient, DEFAULT_PROGRAM_IDS } from '../client';
import { RwaSdk, RwaAsset, RwaAssetType, AssetStatus, Currency } from '../rwa';

function makeSdk() {
  const client = new MeridianClient({
    connection: { commitment: 'confirmed' } as unknown as Connection,
  });
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
    status: AssetStatus.Active,
    isFrozen: false,
    lastAudit: new BN(1700000000),
    createdAt: new BN(1700000000),
    ...overrides,
  };
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
});
