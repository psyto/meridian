import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { MeridianClient } from './client';
import { BN } from '@coral-xyz/anchor';
import { Jurisdiction } from '@accredit/types';

/**
 * RWA (Real World Assets) SDK Module
 *
 * Handles tokenization, custody verification, dividends,
 * and ownership management of real-world assets.
 */

export enum RwaAssetType {
  Equity = 0,
  Bond = 1,
  RealEstate = 2,
  Commodity = 3,
  Equipment = 4,
  IntellectualProperty = 5,
  Fund = 6,
}

export enum AssetStatus {
  Pending = 0,
  Active = 1,
  Suspended = 2,
  Delisted = 3,
}

export enum Currency {
  Jpy = 0,
  Usd = 1,
  Eur = 2,
  Sgd = 3,
}

// Jurisdiction is imported from @accredit/types and used internally.
// It is re-exported via ./types, not re-exported here to avoid ambiguity.

export interface RwaAsset {
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
}

export interface OwnershipProof {
  asset: PublicKey;
  owner: PublicKey;
  amount: BN;
  acquisitionPrice: BN;
  acquiredAt: BN;
  isActive: boolean;
  bump: number;
}

export interface Dividend {
  asset: PublicKey;
  amountPerToken: BN;
  totalAmount: BN;
  paymentToken: PublicKey;
  recordDate: BN;
  paymentDate: BN;
  status: DividendStatus;
  claimedAmount: BN;
}

export enum DividendStatus {
  Announced = 0,
  Payable = 1,
  Completed = 2,
  Cancelled = 3,
}

export interface RegisterAssetParams {
  custodian: PublicKey;
  assetType: RwaAssetType;
  valuation: BN;
  valuationCurrency: Currency;
  name: string;
  symbol: string;
  isin?: Uint8Array;
  jurisdiction: number;
  legalDocumentHash: Uint8Array;
}

/**
 * RWA SDK
 */
export class RwaSdk {
  private client: MeridianClient;

  constructor(client: MeridianClient) {
    this.client = client;
  }

  /**
   * Get RWA asset information
   */
  async getAsset(symbol: string): Promise<RwaAsset | null> {
    const [assetPda] = this.client.deriveRwaAssetPda(symbol);

    try {
      const accountInfo = await this.client.connection.getAccountInfo(assetPda);
      if (!accountInfo) return null;

      return this.deserializeRwaAsset(accountInfo.data as Buffer);
    } catch {
      return null;
    }
  }

  /**
   * Get ownership proof for an asset
   */
  async getOwnershipProof(
    asset: PublicKey,
    owner: PublicKey
  ): Promise<OwnershipProof | null> {
    const [proofPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('ownership'), asset.toBuffer(), owner.toBuffer()],
      this.client.programIds.rwaRegistry
    );

    try {
      const accountInfo = await this.client.connection.getAccountInfo(proofPda);
      if (!accountInfo) return null;

      return this.deserializeOwnershipProof(accountInfo.data as Buffer);
    } catch {
      return null;
    }
  }

  /**
   * Get pending dividends for an asset
   */
  async getPendingDividends(_asset: PublicKey): Promise<Dividend[]> {
    // Would query program accounts filtered by asset
    return [];
  }

  /**
   * Create register asset instruction
   */
  createRegisterAssetInstruction(
    authority: PublicKey,
    params: RegisterAssetParams
  ): TransactionInstruction {
    const [assetPda] = this.client.deriveRwaAssetPda(params.symbol);

    const data = Buffer.alloc(512); // Placeholder

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: assetPda, isSigner: false, isWritable: true },
        // Additional accounts...
      ],
      programId: this.client.programIds.rwaRegistry,
      data,
    });
  }

  /**
   * Create verify custody instruction
   */
  createVerifyCustodyInstruction(
    custodian: PublicKey,
    asset: PublicKey,
    _proofHash: Uint8Array
  ): TransactionInstruction {
    const data = Buffer.alloc(8 + 32);

    return new TransactionInstruction({
      keys: [
        { pubkey: custodian, isSigner: true, isWritable: false },
        { pubkey: asset, isSigner: false, isWritable: true },
      ],
      programId: this.client.programIds.rwaRegistry,
      data,
    });
  }

  /**
   * Create claim dividend instruction
   */
  createClaimDividendInstruction(
    owner: PublicKey,
    asset: PublicKey,
    dividend: PublicKey
  ): TransactionInstruction {
    const [ownershipPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('ownership'), asset.toBuffer(), owner.toBuffer()],
      this.client.programIds.rwaRegistry
    );

    const data = Buffer.alloc(8);

    return new TransactionInstruction({
      keys: [
        { pubkey: owner, isSigner: true, isWritable: false },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: ownershipPda, isSigner: false, isWritable: false },
        { pubkey: dividend, isSigner: false, isWritable: true },
      ],
      programId: this.client.programIds.rwaRegistry,
      data,
    });
  }

  private deserializeRwaAsset(data: Buffer): RwaAsset | null {
    try {
      let offset = 8; // skip discriminator

      const authority = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const custodian = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const assetType = data[offset] as RwaAssetType;
      offset += 1;

      const tokenMint = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const totalSupply = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const valuation = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const valuationCurrency = data[offset] as Currency;
      offset += 1;

      // String: 4-byte length prefix + UTF-8 data
      const nameLen = data.readUInt32LE(offset);
      offset += 4;
      const name = data.subarray(offset, offset + nameLen).toString('utf8');
      offset += nameLen;

      const symbolLen = data.readUInt32LE(offset);
      offset += 4;
      const symbol = data.subarray(offset, offset + symbolLen).toString('utf8');
      offset += symbolLen;

      // Option<[u8; 12]>
      const hasIsin = data[offset] === 1;
      offset += 1;
      const isin = hasIsin
        ? new Uint8Array(data.subarray(offset, offset + 12))
        : null;
      offset += 12;

      const jurisdiction = data[offset] as Jurisdiction;
      offset += 1;

      const legalDocumentHash = new Uint8Array(data.subarray(offset, offset + 32));
      offset += 32;

      const custodyProofHash = new Uint8Array(data.subarray(offset, offset + 32));
      offset += 32;

      const status = data[offset] as AssetStatus;
      offset += 1;

      const isFrozen = data[offset] === 1;
      offset += 1;

      const lastAudit = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const createdAt = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const bump = data[offset];

      return {
        authority,
        custodian,
        assetType,
        tokenMint,
        totalSupply,
        valuation,
        valuationCurrency,
        name,
        symbol,
        isin,
        jurisdiction,
        legalDocumentHash,
        custodyProofHash,
        status,
        isFrozen,
        lastAudit,
        createdAt,
        bump,
      };
    } catch {
      return null;
    }
  }

  private deserializeOwnershipProof(data: Buffer): OwnershipProof | null {
    try {
      let offset = 8; // skip discriminator

      const asset = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const owner = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const amount = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const acquisitionPrice = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const acquiredAt = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const isActive = data[offset] === 1;
      offset += 1;

      const bump = data[offset];

      return {
        asset,
        owner,
        amount,
        acquisitionPrice,
        acquiredAt,
        isActive,
        bump,
      };
    } catch {
      return null;
    }
  }

  /**
   * Calculate yield based on dividends
   */
  calculateYield(asset: RwaAsset, annualDividend: BN): number {
    if (asset.valuation.isZero()) return 0;
    return annualDividend.muln(10000).div(asset.valuation).toNumber() / 100;
  }

  /**
   * Format valuation for display
   */
  formatValuation(amount: BN, currency: Currency): string {
    const symbols = {
      [Currency.Jpy]: '¥',
      [Currency.Usd]: '$',
      [Currency.Eur]: '€',
      [Currency.Sgd]: 'S$',
    };

    const decimals = currency === Currency.Jpy ? 0 : 2;
    const divisor = decimals > 0 ? Math.pow(10, decimals) : 1;
    const value = amount.toNumber() / divisor;

    return `${symbols[currency]}${value.toLocaleString()}`;
  }
}

/**
 * Create RWA SDK instance
 */
export function createRwaSdk(client: MeridianClient): RwaSdk {
  return new RwaSdk(client);
}
