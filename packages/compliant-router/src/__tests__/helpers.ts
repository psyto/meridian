import { vi } from 'vitest';
import { PublicKey, Connection } from '@solana/web3.js';
import type {
  QuoteResponse,
  PoolComplianceEntry,
  WhitelistEntry,
  RoutePlanStep,
} from '../types';
import { PoolStatus, KycLevel, Jurisdiction } from '../types';

/** A deterministic keypair for test fixtures */
const TEST_KEY_1 = PublicKey.unique();
const TEST_KEY_2 = PublicKey.unique();
const TEST_REGISTRY = PublicKey.unique();

/**
 * Stable AMM key strings (valid base58 PublicKeys) for use in mock quotes and whitelist tests.
 * These are the default ammKey values used by mockQuoteResponse.
 */
export const AMM_KEY_1 = PublicKey.unique().toBase58();
export const AMM_KEY_2 = PublicKey.unique().toBase58();

/**
 * Build a valid QuoteResponse with 2 routePlan steps.
 * All fields can be overridden via the `overrides` parameter.
 */
export function mockQuoteResponse(
  overrides?: Partial<QuoteResponse> & { routePlanOverrides?: Partial<RoutePlanStep>[] }
): QuoteResponse {
  const { routePlanOverrides, ...rest } = overrides ?? {};

  const defaultRoutePlan: RoutePlanStep[] = [
    {
      swapInfo: {
        ammKey: AMM_KEY_1,
        label: 'Orca',
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        inAmount: '1000000',
        outAmount: '990000',
        feeAmount: '3000',
        feeMint: 'So11111111111111111111111111111111111111112',
      },
      percent: 100,
    },
    {
      swapInfo: {
        ammKey: AMM_KEY_2,
        label: 'Raydium',
        inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        inAmount: '990000',
        outAmount: '985000',
        feeAmount: '2500',
        feeMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      },
      percent: 100,
    },
  ];

  // Apply per-step overrides if provided
  const routePlan = routePlanOverrides
    ? defaultRoutePlan.map((step, i) => ({
        ...step,
        ...routePlanOverrides[i],
        swapInfo: { ...step.swapInfo, ...routePlanOverrides[i]?.swapInfo },
      }))
    : defaultRoutePlan;

  return {
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    inAmount: '1000000',
    outAmount: '985000',
    otherAmountThreshold: '980000',
    swapMode: 'ExactIn',
    slippageBps: 50,
    priceImpactPct: '0.15',
    routePlan,
    contextSlot: 250000000,
    timeTaken: 0.05,
    ...rest,
  };
}

/**
 * Build a PoolComplianceEntry for a given AMM key string (must be a valid base58 PublicKey).
 */
export function mockPoolComplianceEntry(
  ammKeyStr: string,
  overrides?: Partial<Omit<PoolComplianceEntry, 'ammKey'>>
): PoolComplianceEntry {
  return {
    ammKey: new PublicKey(ammKeyStr),
    registry: TEST_REGISTRY,
    operator: TEST_KEY_1,
    dexLabel: 'TestDEX',
    status: PoolStatus.Active,
    jurisdiction: Jurisdiction.Japan,
    kycLevel: KycLevel.Basic,
    auditHash: new Uint8Array(32),
    auditExpiry: Math.floor(Date.now() / 1000) + 86400 * 365,
    registeredAt: Math.floor(Date.now() / 1000) - 86400,
    updatedAt: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

/**
 * Build a WhitelistEntry with sane defaults.
 */
export function mockWhitelistEntry(
  overrides?: Partial<WhitelistEntry>
): WhitelistEntry {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return {
    wallet: TEST_KEY_2,
    registry: TEST_REGISTRY,
    kycLevel: KycLevel.Standard,
    jurisdiction: Jurisdiction.Japan,
    kycHash: new Uint8Array(32),
    isActive: true,
    dailyLimit: BigInt(1_000_000_000),
    dailyVolume: BigInt(0),
    volumeResetTime: now,
    verifiedAt: now - BigInt(86400),
    expiryTimestamp: now + BigInt(86400 * 365),
    lastActivity: now,
    ...overrides,
  };
}

/**
 * Build a mock Solana Connection with common RPC methods stubbed.
 */
export function mockConnection(): Connection {
  return {
    getAccountInfo: vi.fn().mockResolvedValue(null),
    getProgramAccounts: vi.fn().mockResolvedValue([]),
    getSlot: vi.fn().mockResolvedValue(100),
  } as unknown as Connection;
}

/**
 * Serialize a WhitelistEntry to a Buffer matching the on-chain layout.
 * 8-byte discriminator + fields in the order expected by deserializeWhitelistEntry.
 */
export function serializeWhitelistEntry(entry: WhitelistEntry): Buffer {
  // discriminator(8) + wallet(32) + registry(32) + kycLevel(1) + jurisdiction(1) +
  // kycHash(32) + isActive(1) + dailyLimit(8) + dailyVolume(8) + volumeResetTime(8) +
  // verifiedAt(8) + expiryTimestamp(8) + lastActivity(8) = 155
  const buf = Buffer.alloc(8 + 32 + 32 + 1 + 1 + 32 + 1 + 8 + 8 + 8 + 8 + 8 + 8);
  let offset = 0;

  // 8-byte discriminator (zeros)
  offset += 8;

  // wallet (32 bytes)
  entry.wallet.toBuffer().copy(buf, offset);
  offset += 32;

  // registry (32 bytes)
  entry.registry.toBuffer().copy(buf, offset);
  offset += 32;

  // kycLevel (1 byte)
  buf[offset] = entry.kycLevel;
  offset += 1;

  // jurisdiction (1 byte)
  buf[offset] = entry.jurisdiction;
  offset += 1;

  // kycHash (32 bytes)
  Buffer.from(entry.kycHash).copy(buf, offset);
  offset += 32;

  // isActive (1 byte)
  buf[offset] = entry.isActive ? 1 : 0;
  offset += 1;

  // dailyLimit (u64 LE)
  buf.writeBigUInt64LE(BigInt(entry.dailyLimit), offset);
  offset += 8;

  // dailyVolume (u64 LE)
  buf.writeBigUInt64LE(BigInt(entry.dailyVolume), offset);
  offset += 8;

  // volumeResetTime (i64 LE)
  buf.writeBigInt64LE(BigInt(entry.volumeResetTime), offset);
  offset += 8;

  // verifiedAt (i64 LE)
  buf.writeBigInt64LE(BigInt(entry.verifiedAt), offset);
  offset += 8;

  // expiryTimestamp (i64 LE)
  buf.writeBigInt64LE(BigInt(entry.expiryTimestamp), offset);
  offset += 8;

  // lastActivity (i64 LE)
  buf.writeBigInt64LE(BigInt(entry.lastActivity), offset);
  offset += 8;

  return buf;
}

/**
 * Serialize a PoolComplianceEntry to a Buffer matching the on-chain layout.
 */
export function serializePoolEntry(entry: PoolComplianceEntry): Buffer {
  const dexLabelBuf = Buffer.from(entry.dexLabel, 'utf8');
  // discriminator(8) + ammKey(32) + registry(32) + operator(32) +
  // strLen(4) + dexLabel(N) + status(1) + jurisdiction(1) + kycLevel(1) +
  // auditHash(32) + auditExpiry(8) + registeredAt(8) + updatedAt(8) + padding(1)
  const totalSize = 8 + 32 + 32 + 32 + 4 + dexLabelBuf.length + 1 + 1 + 1 + 32 + 8 + 8 + 8 + 1;
  const buf = Buffer.alloc(totalSize);
  let offset = 0;

  // discriminator
  offset += 8;

  entry.ammKey.toBuffer().copy(buf, offset);
  offset += 32;

  entry.registry.toBuffer().copy(buf, offset);
  offset += 32;

  entry.operator.toBuffer().copy(buf, offset);
  offset += 32;

  buf.writeUInt32LE(dexLabelBuf.length, offset);
  offset += 4;
  dexLabelBuf.copy(buf, offset);
  offset += dexLabelBuf.length;

  buf[offset] = entry.status;
  offset += 1;

  buf[offset] = entry.jurisdiction;
  offset += 1;

  buf[offset] = entry.kycLevel;
  offset += 1;

  Buffer.from(entry.auditHash).copy(buf, offset);
  offset += 32;

  buf.writeBigInt64LE(BigInt(entry.auditExpiry), offset);
  offset += 8;

  buf.writeBigInt64LE(BigInt(entry.registeredAt), offset);
  offset += 8;

  buf.writeBigInt64LE(BigInt(entry.updatedAt), offset);
  offset += 8;

  return buf;
}
