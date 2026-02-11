import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PublicKey, Connection } from '@solana/web3.js';
import { PoolWhitelistManager } from '../pool-whitelist';
import { PoolStatus, Jurisdiction, KycLevel } from '../types';
import type { PoolComplianceEntry } from '../types';
import { mockConnection, serializePoolEntry } from './helpers';

describe('PoolWhitelistManager', () => {
  let conn: ReturnType<typeof mockConnection>;
  let manager: PoolWhitelistManager;
  const programId = PublicKey.unique();
  const authority = PublicKey.unique();

  beforeEach(() => {
    conn = mockConnection();
    manager = new PoolWhitelistManager(conn as unknown as Connection, programId, authority);
  });

  function makeEntry(ammKey: PublicKey, overrides?: Partial<PoolComplianceEntry>): PoolComplianceEntry {
    return {
      ammKey,
      registry: PublicKey.unique(),
      operator: PublicKey.unique(),
      dexLabel: 'TestDEX',
      status: PoolStatus.Active,
      jurisdiction: Jurisdiction.Japan,
      kycLevel: KycLevel.Basic,
      auditHash: new Uint8Array(32),
      auditExpiry: Math.floor(Date.now() / 1000) + 86400,
      registeredAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
      ...overrides,
    };
  }

  describe('addPool / isWhitelisted / removePool', () => {
    it('marks a pool as whitelisted after add', () => {
      const key = PublicKey.unique();
      const entry = makeEntry(key);
      manager.addPool(entry);

      expect(manager.isWhitelisted(key.toBase58())).toBe(true);
    });

    it('returns false for unknown pool', () => {
      expect(manager.isWhitelisted(PublicKey.unique().toBase58())).toBe(false);
    });

    it('returns false after removePool', () => {
      const key = PublicKey.unique();
      manager.addPool(makeEntry(key));
      expect(manager.isWhitelisted(key.toBase58())).toBe(true);

      const removed = manager.removePool(key.toBase58());
      expect(removed).toBe(true);
      expect(manager.isWhitelisted(key.toBase58())).toBe(false);
    });

    it('removePool returns false for non-existent key', () => {
      expect(manager.removePool(PublicKey.unique().toBase58())).toBe(false);
    });
  });

  describe('getEntry / getWhitelistedKeys / size', () => {
    it('getEntry returns the entry after add', () => {
      const key = PublicKey.unique();
      const entry = makeEntry(key);
      manager.addPool(entry);

      const retrieved = manager.getEntry(key.toBase58());
      expect(retrieved).toBeDefined();
      expect(retrieved!.dexLabel).toBe('TestDEX');
    });

    it('getEntry returns undefined for unknown key', () => {
      expect(manager.getEntry(PublicKey.unique().toBase58())).toBeUndefined();
    });

    it('getWhitelistedKeys returns all keys', () => {
      const k1 = PublicKey.unique();
      const k2 = PublicKey.unique();
      manager.addPool(makeEntry(k1));
      manager.addPool(makeEntry(k2));

      const keys = manager.getWhitelistedKeys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain(k1.toBase58());
      expect(keys).toContain(k2.toBase58());
    });

    it('size reflects current pool count', () => {
      expect(manager.size).toBe(0);
      const k1 = PublicKey.unique();
      manager.addPool(makeEntry(k1));
      expect(manager.size).toBe(1);
      manager.removePool(k1.toBase58());
      expect(manager.size).toBe(0);
    });
  });

  describe('isWhitelisted with non-Active statuses', () => {
    it('returns false for Suspended pool', () => {
      const key = PublicKey.unique();
      manager.addPool(makeEntry(key, { status: PoolStatus.Suspended }));
      expect(manager.isWhitelisted(key.toBase58())).toBe(false);
    });

    it('returns false for Revoked pool', () => {
      const key = PublicKey.unique();
      manager.addPool(makeEntry(key, { status: PoolStatus.Revoked }));
      expect(manager.isWhitelisted(key.toBase58())).toBe(false);
    });
  });

  describe('deriveRegistryPda / derivePoolEntryPda', () => {
    it('deriveRegistryPda is deterministic', () => {
      const [pda1, bump1] = manager.deriveRegistryPda();
      const [pda2, bump2] = manager.deriveRegistryPda();

      expect(pda1.equals(pda2)).toBe(true);
      expect(bump1).toBe(bump2);
    });

    it('derivePoolEntryPda is deterministic', () => {
      const registryKey = PublicKey.unique();
      const ammKey = PublicKey.unique();

      const [pda1, bump1] = manager.derivePoolEntryPda(registryKey, ammKey);
      const [pda2, bump2] = manager.derivePoolEntryPda(registryKey, ammKey);

      expect(pda1.equals(pda2)).toBe(true);
      expect(bump1).toBe(bump2);
    });

    it('different inputs produce different PDAs', () => {
      const registryKey = PublicKey.unique();
      const [pda1] = manager.derivePoolEntryPda(registryKey, PublicKey.unique());
      const [pda2] = manager.derivePoolEntryPda(registryKey, PublicKey.unique());

      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('syncFromChain', () => {
    it('populates cache from getProgramAccounts and updates syncSlot', async () => {
      const ammKey1 = PublicKey.unique();
      const ammKey2 = PublicKey.unique();
      const [registryPda] = manager.deriveRegistryPda();

      const entry1 = makeEntry(ammKey1, { registry: registryPda, status: PoolStatus.Active });
      const entry2 = makeEntry(ammKey2, { registry: registryPda, status: PoolStatus.Active });

      // The deserialized data size must match the expected dataSize filter:
      // 8 + 32 + 32 + 32 + (4 + 32) + 1 + 1 + 1 + 32 + 8 + 8 + 8 + 1 = 200
      // We use dexLabel of exactly 32 chars for length match
      const entry1With32Label = { ...entry1, dexLabel: 'A'.repeat(32) };
      const entry2With32Label = { ...entry2, dexLabel: 'B'.repeat(32) };

      const buf1 = serializePoolEntry(entry1With32Label);
      const buf2 = serializePoolEntry(entry2With32Label);

      (conn.getProgramAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([
        { pubkey: PublicKey.unique(), account: { data: buf1, executable: false, lamports: 0, owner: programId } },
        { pubkey: PublicKey.unique(), account: { data: buf2, executable: false, lamports: 0, owner: programId } },
      ]);
      (conn.getSlot as ReturnType<typeof vi.fn>).mockResolvedValue(42);

      const count = await manager.syncFromChain();

      expect(count).toBe(2);
      expect(manager.size).toBe(2);
      expect(manager.isWhitelisted(ammKey1.toBase58())).toBe(true);
      expect(manager.isWhitelisted(ammKey2.toBase58())).toBe(true);
      expect(manager.syncSlot).toBe(42);
    });

    it('excludes non-Active entries during sync', async () => {
      const ammKey = PublicKey.unique();
      const [registryPda] = manager.deriveRegistryPda();

      const entry = makeEntry(ammKey, {
        registry: registryPda,
        status: PoolStatus.Suspended,
        dexLabel: 'X'.repeat(32),
      });
      const buf = serializePoolEntry(entry);

      (conn.getProgramAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([
        { pubkey: PublicKey.unique(), account: { data: buf, executable: false, lamports: 0, owner: programId } },
      ]);
      (conn.getSlot as ReturnType<typeof vi.fn>).mockResolvedValue(50);

      const count = await manager.syncFromChain();

      expect(count).toBe(0);
      expect(manager.size).toBe(0);
    });
  });
});
