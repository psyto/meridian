import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import {
  isValidPublicKey,
  formatBN,
  parseToBN,
  percentChange,
  bpsToPercent,
  percentToBps,
  truncateAddress,
  formatTimestamp,
  getCurrentTimestamp,
  isExpired,
  daysUntilExpiry,
  calculatePriceImpact,
  constantProductOutput,
  isValidStablecoinAmount,
  generateReference,
  sleep,
  retry,
} from '../utils';

describe('isValidPublicKey', () => {
  it('returns true for a valid base58 address', () => {
    const key = PublicKey.unique();
    expect(isValidPublicKey(key.toString())).toBe(true);
  });

  it('returns false for an invalid string', () => {
    expect(isValidPublicKey('not-a-key')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidPublicKey('')).toBe(false);
  });
});

describe('formatBN', () => {
  it('formats with specified decimals', () => {
    // 1_500_000 with 6 decimals = "1.500000"
    expect(formatBN(new BN(1_500_000), 6)).toBe('1.500000');
  });

  it('formats zero', () => {
    expect(formatBN(new BN(0), 6)).toBe('0.000000');
  });

  it('uses custom displayDecimals to truncate', () => {
    // 1_500_000 with 6 decimals, display 2 → "1.50"
    expect(formatBN(new BN(1_500_000), 6, 2)).toBe('1.50');
  });

  it('formats with 2 decimals', () => {
    expect(formatBN(new BN(150), 2)).toBe('1.50');
  });
});

describe('parseToBN', () => {
  it('parses decimal string to BN', () => {
    const result = parseToBN('1.5', 6);
    expect(result.eq(new BN(1_500_000))).toBe(true);
  });

  it('handles no decimal part', () => {
    const result = parseToBN('100', 6);
    expect(result.eq(new BN(100_000_000))).toBe(true);
  });

  it('handles short decimal part (pads with zeros)', () => {
    const result = parseToBN('1.5', 2);
    expect(result.eq(new BN(150))).toBe(true);
  });
});

describe('formatBN / parseToBN round-trip', () => {
  it('preserves value through format then parse', () => {
    const original = new BN(1_234_567);
    const formatted = formatBN(original, 6);
    const parsed = parseToBN(formatted, 6);
    expect(parsed.eq(original)).toBe(true);
  });

  it('round-trips a large value', () => {
    const original = new BN(999_999_999);
    const formatted = formatBN(original, 6);
    const parsed = parseToBN(formatted, 6);
    expect(parsed.eq(original)).toBe(true);
  });
});

describe('percentChange', () => {
  it('calculates positive change', () => {
    const result = percentChange(new BN(100), new BN(150));
    expect(result).toBe(50);
  });

  it('calculates negative change', () => {
    const result = percentChange(new BN(100), new BN(80));
    expect(result).toBe(-20);
  });

  it('returns 0 for no change', () => {
    const result = percentChange(new BN(100), new BN(100));
    expect(result).toBe(0);
  });

  it('returns 0 when old value is zero', () => {
    const result = percentChange(new BN(0), new BN(100));
    expect(result).toBe(0);
  });
});

describe('bpsToPercent', () => {
  it('converts basis points to percentage', () => {
    expect(bpsToPercent(100)).toBe(1);
    expect(bpsToPercent(50)).toBe(0.5);
    expect(bpsToPercent(10000)).toBe(100);
  });
});

describe('percentToBps', () => {
  it('converts percentage to basis points', () => {
    expect(percentToBps(1)).toBe(100);
    expect(percentToBps(0.5)).toBe(50);
    expect(percentToBps(100)).toBe(10000);
  });
});

describe('bpsToPercent / percentToBps round-trip', () => {
  it('round-trips correctly', () => {
    expect(percentToBps(bpsToPercent(250))).toBe(250);
    expect(bpsToPercent(percentToBps(3.5))).toBe(3.5);
  });
});

describe('truncateAddress', () => {
  it('truncates a PublicKey', () => {
    const key = PublicKey.unique();
    const str = key.toString();
    const truncated = truncateAddress(key);
    expect(truncated).toBe(`${str.slice(0, 4)}...${str.slice(-4)}`);
  });

  it('truncates a string', () => {
    const str = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop';
    const result = truncateAddress(str);
    expect(result).toBe('ABCD...mnop');
  });

  it('respects custom chars parameter', () => {
    const str = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop';
    const result = truncateAddress(str, 6);
    expect(result).toBe('ABCDEF...klmnop');
  });
});

describe('formatTimestamp', () => {
  it('converts unix timestamp (number) to ISO string', () => {
    const result = formatTimestamp(1700000000);
    expect(result).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it('converts unix timestamp (BN) to ISO string', () => {
    const result = formatTimestamp(new BN(1700000000));
    expect(result).toBe(new Date(1700000000 * 1000).toISOString());
  });
});

describe('getCurrentTimestamp', () => {
  it('returns a reasonable unix timestamp', () => {
    const ts = getCurrentTimestamp();
    // Should be roughly now (within a second)
    expect(ts).toBeGreaterThan(1700000000);
    expect(ts).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });
});

describe('isExpired', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for a past timestamp', () => {
    // 2024-01-01 in unix
    const past = Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000);
    expect(isExpired(past)).toBe(true);
  });

  it('returns false for a future timestamp', () => {
    const future = Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000);
    expect(isExpired(future)).toBe(false);
  });

  it('works with BN input', () => {
    const past = new BN(Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000));
    expect(isExpired(past)).toBe(true);
  });
});

describe('daysUntilExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates correct days until expiry', () => {
    // 10 days from now
    const currentUnix = Math.floor(new Date('2025-01-01T00:00:00Z').getTime() / 1000);
    const futureUnix = currentUnix + 10 * 86400;
    expect(daysUntilExpiry(futureUnix)).toBe(10);
  });

  it('returns 0 for expired timestamp', () => {
    const past = Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000);
    expect(daysUntilExpiry(past)).toBe(0);
  });

  it('works with BN input', () => {
    const currentUnix = Math.floor(new Date('2025-01-01T00:00:00Z').getTime() / 1000);
    const future = new BN(currentUnix + 30 * 86400);
    expect(daysUntilExpiry(future)).toBe(30);
  });
});

describe('calculatePriceImpact', () => {
  it('returns percentage price impact for a swap', () => {
    const inputAmount = new BN(1000);
    const inputReserve = new BN(100_000);
    const outputReserve = new BN(100_000);
    // Output from constant product: 1000 * 100000 / (100000 + 1000) = 990.099...
    const outputAmount = new BN(990);

    const impact = calculatePriceImpact(inputAmount, outputAmount, inputReserve, outputReserve);
    // Should be a small positive number (roughly 1%)
    expect(impact).toBeGreaterThan(0);
    expect(impact).toBeLessThan(5);
  });

  it('returns 0 impact when trade matches spot price exactly', () => {
    // If outputAmount/inputAmount == outputReserve/inputReserve, impact = 0
    const impact = calculatePriceImpact(
      new BN(100), new BN(100), new BN(1000), new BN(1000)
    );
    expect(impact).toBe(0);
  });
});

describe('constantProductOutput', () => {
  it('calculates correct AMM output', () => {
    const input = new BN(1000);
    const inputReserve = new BN(100_000);
    const outputReserve = new BN(100_000);

    const output = constantProductOutput(input, inputReserve, outputReserve);

    // With 30bps fee: inputWithFee = 1000 - 3 = 997
    // output = 997 * 100000 / (100000 + 997) = 99700000 / 100997 ≈ 987
    expect(output.gtn(0)).toBe(true);
    expect(output.ltn(1000)).toBe(true); // Output should be less than input due to fees
  });

  it('respects custom fee parameter', () => {
    const input = new BN(1000);
    const inputReserve = new BN(100_000);
    const outputReserve = new BN(100_000);

    const output0 = constantProductOutput(input, inputReserve, outputReserve, 0);
    const output100 = constantProductOutput(input, inputReserve, outputReserve, 100);

    // Zero fee should give more output
    expect(output0.gt(output100)).toBe(true);
  });

  it('returns 0 for zero input', () => {
    const output = constantProductOutput(
      new BN(0), new BN(100_000), new BN(100_000)
    );
    expect(output.eq(new BN(0))).toBe(true);
  });
});

describe('isValidStablecoinAmount', () => {
  it('returns true for positive amount within max', () => {
    expect(isValidStablecoinAmount(new BN(1000))).toBe(true);
  });

  it('returns false for zero', () => {
    expect(isValidStablecoinAmount(new BN(0))).toBe(false);
  });

  it('returns false for negative amount', () => {
    expect(isValidStablecoinAmount(new BN(-1))).toBe(false);
  });

  it('returns false for amount over max', () => {
    // Max is 1_000_000_000_000 (10 billion with 2 decimals)
    const overMax = new BN('1000000000001');
    expect(isValidStablecoinAmount(overMax)).toBe(false);
  });

  it('returns true for amount exactly at max', () => {
    const atMax = new BN('1000000000000');
    expect(isValidStablecoinAmount(atMax)).toBe(true);
  });
});

describe('generateReference', () => {
  it('returns a 32-byte Uint8Array', () => {
    const ref = generateReference();
    expect(ref).toBeInstanceOf(Uint8Array);
    expect(ref.length).toBe(32);
  });

  it('produces different values on successive calls', () => {
    const ref1 = generateReference();
    const ref2 = generateReference();

    // Compare as strings to check inequality
    const str1 = Array.from(ref1).join(',');
    const str2 = Array.from(ref2).join(',');
    expect(str1).not.toBe(str2);
  });
});

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after specified time', async () => {
    let resolved = false;
    const p = sleep(1000).then(() => { resolved = true; });

    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    await p;

    expect(resolved).toBe(true);
  });
});

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('succeeds after transient failures', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      if (callCount < 3) throw new Error(`fail ${callCount}`);
      return 'ok';
    });

    const promise = retry(fn, 3, 100);

    // Advance through backoff delays: 100ms, then 200ms
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after maxRetries exhausted', async () => {
    vi.useRealTimers();
    const fn = vi.fn(async () => {
      throw new Error('always fails');
    });

    await expect(retry(fn, 3, 0)).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
