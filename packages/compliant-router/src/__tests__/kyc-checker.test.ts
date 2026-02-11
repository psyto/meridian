import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PublicKey, Connection } from '@solana/web3.js';
import { KycComplianceChecker } from '../kyc-checker';
import { KycLevel, Jurisdiction } from '../types';
import { mockConnection, mockWhitelistEntry, serializeWhitelistEntry } from './helpers';

describe('KycComplianceChecker', () => {
  let conn: ReturnType<typeof mockConnection>;
  let checker: KycComplianceChecker;
  const hookProgramId = PublicKey.unique();

  beforeEach(() => {
    conn = mockConnection();
    checker = new KycComplianceChecker(conn as unknown as Connection, hookProgramId);
  });

  describe('deriveWhitelistPda', () => {
    it('is deterministic for the same wallet', () => {
      const wallet = PublicKey.unique();
      const [pda1, bump1] = checker.deriveWhitelistPda(wallet);
      const [pda2, bump2] = checker.deriveWhitelistPda(wallet);

      expect(pda1.equals(pda2)).toBe(true);
      expect(bump1).toBe(bump2);
    });

    it('produces different PDAs for different wallets', () => {
      const [pda1] = checker.deriveWhitelistPda(PublicKey.unique());
      const [pda2] = checker.deriveWhitelistPda(PublicKey.unique());

      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('getWhitelistEntry', () => {
    it('returns deserialized entry from account data', async () => {
      const wallet = PublicKey.unique();
      const entry = mockWhitelistEntry({ wallet });
      const buf = serializeWhitelistEntry(entry);

      (conn.getAccountInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: buf,
        executable: false,
        lamports: 0,
        owner: hookProgramId,
      });

      const result = await checker.getWhitelistEntry(wallet);

      expect(result).not.toBeNull();
      expect(result!.wallet.equals(wallet)).toBe(true);
      expect(result!.kycLevel).toBe(KycLevel.Standard);
      expect(result!.isActive).toBe(true);
    });

    it('returns null when account does not exist', async () => {
      (conn.getAccountInfo as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await checker.getWhitelistEntry(PublicKey.unique());
      expect(result).toBeNull();
    });

    it('caches entries — second call does not re-fetch', async () => {
      const wallet = PublicKey.unique();
      const entry = mockWhitelistEntry({ wallet });
      const buf = serializeWhitelistEntry(entry);

      (conn.getAccountInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: buf,
        executable: false,
        lamports: 0,
        owner: hookProgramId,
      });

      await checker.getWhitelistEntry(wallet);
      await checker.getWhitelistEntry(wallet);

      expect(conn.getAccountInfo).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkTraderCompliance', () => {
    const ALL_JURISDICTIONS = 0b00111111;

    it('returns not compliant when no entry exists', async () => {
      (conn.getAccountInfo as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await checker.checkTraderCompliance(
        PublicKey.unique(),
        KycLevel.Basic,
        ALL_JURISDICTIONS
      );

      expect(result.isCompliant).toBe(false);
      expect(result.reason).toBe('No KYC record found');
    });

    it('returns not compliant when entry is inactive', async () => {
      const wallet = PublicKey.unique();
      const entry = mockWhitelistEntry({ wallet, isActive: false });
      const buf = serializeWhitelistEntry(entry);

      (conn.getAccountInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: buf, executable: false, lamports: 0, owner: hookProgramId,
      });

      const result = await checker.checkTraderCompliance(wallet, KycLevel.Basic, ALL_JURISDICTIONS);

      expect(result.isCompliant).toBe(false);
      expect(result.reason).toBe('KYC record is inactive');
      expect(result.entry).toBeDefined();
    });

    it('returns not compliant when KYC is expired', async () => {
      const wallet = PublicKey.unique();
      const pastTimestamp = BigInt(Math.floor(Date.now() / 1000) - 86400);
      const entry = mockWhitelistEntry({ wallet, expiryTimestamp: pastTimestamp });
      const buf = serializeWhitelistEntry(entry);

      (conn.getAccountInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: buf, executable: false, lamports: 0, owner: hookProgramId,
      });

      const result = await checker.checkTraderCompliance(wallet, KycLevel.Basic, ALL_JURISDICTIONS);

      expect(result.isCompliant).toBe(false);
      expect(result.reason).toBe('KYC verification has expired');
    });

    it('returns not compliant when KYC level is too low', async () => {
      const wallet = PublicKey.unique();
      const entry = mockWhitelistEntry({ wallet, kycLevel: KycLevel.Basic });
      const buf = serializeWhitelistEntry(entry);

      (conn.getAccountInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: buf, executable: false, lamports: 0, owner: hookProgramId,
      });

      const result = await checker.checkTraderCompliance(wallet, KycLevel.Enhanced, ALL_JURISDICTIONS);

      expect(result.isCompliant).toBe(false);
      expect(result.reason).toContain('below minimum');
    });

    it('returns not compliant when jurisdiction is disallowed', async () => {
      const wallet = PublicKey.unique();
      // Jurisdiction.Usa = 4 → bit 4 (0b10000)
      const entry = mockWhitelistEntry({ wallet, jurisdiction: Jurisdiction.Usa });
      const buf = serializeWhitelistEntry(entry);

      (conn.getAccountInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: buf, executable: false, lamports: 0, owner: hookProgramId,
      });

      // Only allow Japan (bit 0) → 0b000001
      const japanOnly = 1 << Jurisdiction.Japan;
      const result = await checker.checkTraderCompliance(wallet, KycLevel.Basic, japanOnly);

      expect(result.isCompliant).toBe(false);
      expect(result.reason).toContain('not allowed');
    });

    it('returns compliant when all checks pass', async () => {
      const wallet = PublicKey.unique();
      const entry = mockWhitelistEntry({
        wallet,
        kycLevel: KycLevel.Enhanced,
        jurisdiction: Jurisdiction.Japan,
        isActive: true,
      });
      const buf = serializeWhitelistEntry(entry);

      (conn.getAccountInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: buf, executable: false, lamports: 0, owner: hookProgramId,
      });

      const result = await checker.checkTraderCompliance(wallet, KycLevel.Basic, ALL_JURISDICTIONS);

      expect(result.isCompliant).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.entry).toBeDefined();
      expect(result.entry!.kycLevel).toBe(KycLevel.Enhanced);
    });
  });

  describe('clearCache', () => {
    it('forces re-fetch after clearCache()', async () => {
      const wallet = PublicKey.unique();
      const entry = mockWhitelistEntry({ wallet });
      const buf = serializeWhitelistEntry(entry);

      (conn.getAccountInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: buf, executable: false, lamports: 0, owner: hookProgramId,
      });

      await checker.getWhitelistEntry(wallet);
      checker.clearCache();
      await checker.getWhitelistEntry(wallet);

      expect(conn.getAccountInfo).toHaveBeenCalledTimes(2);
    });

    it('clears only the specified trader when given a pubkey', async () => {
      const wallet1 = PublicKey.unique();
      const wallet2 = PublicKey.unique();
      const entry1 = mockWhitelistEntry({ wallet: wallet1 });
      const entry2 = mockWhitelistEntry({ wallet: wallet2 });

      let callCount = 0;
      (conn.getAccountInfo as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callCount++;
        // Return different entries based on call order
        const entry = callCount <= 1 || callCount === 3 ? entry1 : entry2;
        return {
          data: serializeWhitelistEntry(entry),
          executable: false,
          lamports: 0,
          owner: hookProgramId,
        };
      });

      await checker.getWhitelistEntry(wallet1);
      await checker.getWhitelistEntry(wallet2);
      expect(conn.getAccountInfo).toHaveBeenCalledTimes(2);

      // Clear only wallet1
      checker.clearCache(wallet1);

      // wallet1 should re-fetch, wallet2 should use cache
      await checker.getWhitelistEntry(wallet1);
      await checker.getWhitelistEntry(wallet2);
      expect(conn.getAccountInfo).toHaveBeenCalledTimes(3);
    });
  });
});
