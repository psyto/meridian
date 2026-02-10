import { Connection, PublicKey } from '@solana/web3.js';
import { KycLevel, Jurisdiction, type WhitelistEntry } from './types';

const WHITELIST_SEED = Buffer.from('whitelist');

/**
 * Reads transfer-hook WhitelistEntry accounts to verify trader KYC status.
 * Compatible with the meridian transfer-hook program's PDA scheme.
 */
export class KycComplianceChecker {
  private connection: Connection;
  private transferHookProgramId: PublicKey;
  private entryCache: Map<string, WhitelistEntry> = new Map();

  constructor(connection: Connection, transferHookProgramId: PublicKey) {
    this.connection = connection;
    this.transferHookProgramId = transferHookProgramId;
  }

  /**
   * Derive the WhitelistEntry PDA for a given wallet
   */
  deriveWhitelistPda(wallet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [WHITELIST_SEED, wallet.toBuffer()],
      this.transferHookProgramId
    );
  }

  /**
   * Fetch a trader's WhitelistEntry from on-chain state
   */
  async getWhitelistEntry(
    trader: PublicKey
  ): Promise<WhitelistEntry | null> {
    const cached = this.entryCache.get(trader.toBase58());
    if (cached) return cached;

    const [pda] = this.deriveWhitelistPda(trader);

    const accountInfo = await this.connection.getAccountInfo(pda);
    if (!accountInfo) return null;

    const entry = this.deserializeWhitelistEntry(accountInfo.data);
    if (entry) {
      this.entryCache.set(trader.toBase58(), entry);
    }
    return entry;
  }

  /**
   * Check if a trader meets minimum KYC requirements
   */
  async checkTraderCompliance(
    trader: PublicKey,
    minKycLevel: KycLevel,
    allowedJurisdictionBitmask: number
  ): Promise<{
    isCompliant: boolean;
    reason?: string;
    entry?: WhitelistEntry;
  }> {
    const entry = await this.getWhitelistEntry(trader);

    if (!entry) {
      return { isCompliant: false, reason: 'No KYC record found' };
    }

    if (!entry.isActive) {
      return {
        isCompliant: false,
        reason: 'KYC record is inactive',
        entry,
      };
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (Number(entry.expiryTimestamp) > 0 && now > Number(entry.expiryTimestamp)) {
      return {
        isCompliant: false,
        reason: 'KYC verification has expired',
        entry,
      };
    }

    // Check KYC level
    if (entry.kycLevel < minKycLevel) {
      return {
        isCompliant: false,
        reason: `KYC level ${entry.kycLevel} below minimum ${minKycLevel}`,
        entry,
      };
    }

    // Check jurisdiction
    const jurisdictionBit = 1 << entry.jurisdiction;
    if ((allowedJurisdictionBitmask & jurisdictionBit) === 0) {
      return {
        isCompliant: false,
        reason: `Jurisdiction ${Jurisdiction[entry.jurisdiction]} is not allowed`,
        entry,
      };
    }

    return { isCompliant: true, entry };
  }

  /**
   * Clear the entry cache for a specific trader or all traders
   */
  clearCache(trader?: PublicKey): void {
    if (trader) {
      this.entryCache.delete(trader.toBase58());
    } else {
      this.entryCache.clear();
    }
  }

  private deserializeWhitelistEntry(data: Buffer): WhitelistEntry | null {
    try {
      // Skip 8-byte discriminator
      let offset = 8;

      const wallet = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const registry = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const kycLevel = data[offset] as KycLevel;
      offset += 1;

      const jurisdiction = data[offset] as Jurisdiction;
      offset += 1;

      const kycHash = new Uint8Array(data.subarray(offset, offset + 32));
      offset += 32;

      const isActive = data[offset] === 1;
      offset += 1;

      const dailyLimit = data.readBigUInt64LE(offset);
      offset += 8;

      const dailyVolume = data.readBigUInt64LE(offset);
      offset += 8;

      const volumeResetTime = data.readBigInt64LE(offset);
      offset += 8;

      const verifiedAt = data.readBigInt64LE(offset);
      offset += 8;

      const expiryTimestamp = data.readBigInt64LE(offset);
      offset += 8;

      const lastActivity = data.readBigInt64LE(offset);
      offset += 8;

      return {
        wallet,
        registry,
        kycLevel,
        jurisdiction,
        kycHash,
        isActive,
        dailyLimit,
        dailyVolume,
        volumeResetTime,
        verifiedAt,
        expiryTimestamp,
        lastActivity,
      };
    } catch {
      return null;
    }
  }
}
