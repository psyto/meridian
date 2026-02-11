import { PublicKey, Connection, Commitment } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

/**
 * Utility functions for the Meridian SDK
 */

/**
 * Validate a Solana public key
 */
export function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await sleep(baseDelay * Math.pow(2, i));
      }
    }
  }

  throw lastError;
}

/**
 * Format a BN as a decimal string with specified precision
 */
export function formatBN(
  value: BN,
  decimals: number,
  displayDecimals?: number
): string {
  const divisor = new BN(10).pow(new BN(decimals));
  const intPart = value.div(divisor);
  const decPart = value.mod(divisor).toString().padStart(decimals, '0');

  const display = displayDecimals ?? decimals;
  return `${intPart.toString()}.${decPart.slice(0, display)}`;
}

/**
 * Parse a decimal string to BN
 */
export function parseToBN(value: string, decimals: number): BN {
  const parts = value.split('.');
  const intPart = parts[0] || '0';
  const decPart = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
  return new BN(intPart + decPart);
}

/**
 * Calculate percentage change
 */
export function percentChange(oldValue: BN, newValue: BN): number {
  if (oldValue.isZero()) return 0;
  return newValue.sub(oldValue).muln(10000).div(oldValue).toNumber() / 100;
}

/**
 * Calculate basis points to percentage
 */
export function bpsToPercent(bps: number): number {
  return bps / 100;
}

/**
 * Calculate percentage to basis points
 */
export function percentToBps(percent: number): number {
  return percent * 100;
}

/**
 * Truncate a public key for display
 */
export function truncateAddress(address: PublicKey | string, chars: number = 4): string {
  const str = typeof address === 'string' ? address : address.toString();
  return `${str.slice(0, chars)}...${str.slice(-chars)}`;
}

/**
 * Format timestamp to ISO string
 */
export function formatTimestamp(timestamp: BN | number): string {
  const ts = typeof timestamp === 'number' ? timestamp : timestamp.toNumber();
  return new Date(ts * 1000).toISOString();
}

/**
 * Get current Unix timestamp
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Check if a timestamp is expired
 */
export function isExpired(expiryTimestamp: BN | number): boolean {
  const expiry = typeof expiryTimestamp === 'number' ? expiryTimestamp : expiryTimestamp.toNumber();
  return getCurrentTimestamp() >= expiry;
}

/**
 * Calculate days until expiry
 */
export function daysUntilExpiry(expiryTimestamp: BN | number): number {
  const expiry = typeof expiryTimestamp === 'number' ? expiryTimestamp : expiryTimestamp.toNumber();
  const diff = expiry - getCurrentTimestamp();
  return Math.max(0, Math.floor(diff / 86400));
}

/**
 * Wait for transaction confirmation
 */
export async function confirmTransaction(
  connection: Connection,
  signature: string,
  commitment: Commitment = 'confirmed'
): Promise<boolean> {
  const latestBlockhash = await connection.getLatestBlockhash();

  const result = await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    commitment
  );

  return !result.value.err;
}

/**
 * Calculate price impact for AMM swap
 */
export function calculatePriceImpact(
  inputAmount: BN,
  outputAmount: BN,
  inputReserve: BN,
  outputReserve: BN
): number {
  // Spot price before trade
  const spotPrice = outputReserve.muln(1_000_000).div(inputReserve);

  // Effective price from trade
  const effectivePrice = outputAmount.muln(1_000_000).div(inputAmount);

  // Price impact as percentage
  const impact = spotPrice.sub(effectivePrice).abs().muln(10000).div(spotPrice);
  return impact.toNumber() / 100;
}

/**
 * Calculate constant product output
 */
export function constantProductOutput(
  inputAmount: BN,
  inputReserve: BN,
  outputReserve: BN,
  feeBps: number = 30
): BN {
  const fee = inputAmount.muln(feeBps).divn(10000);
  const inputWithFee = inputAmount.sub(fee);

  const numerator = inputWithFee.mul(outputReserve);
  const denominator = inputReserve.add(inputWithFee);

  return numerator.div(denominator);
}

/**
 * Validate stablecoin amount (must be positive and reasonable)
 */
export function isValidStablecoinAmount(amount: BN): boolean {
  // Maximum single transaction: 10 billion with 2 decimals
  const MAX_AMOUNT = new BN('1000000000000');

  return amount.gtn(0) && amount.lte(MAX_AMOUNT);
}

/**
 * Generate a random reference for transactions
 */
export function generateReference(): Uint8Array {
  const reference = new Uint8Array(32);
  crypto.getRandomValues(reference);
  return reference;
}
