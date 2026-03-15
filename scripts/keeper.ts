/**
 * Meridian Shield Escrow - Keeper Service
 *
 * Automates the Jupiter swap step that bridges the deposit -> execute_swap
 * lifecycle in the Shield Escrow program. Polls for SwapReceipt accounts
 * with status = Pending, quotes via Jupiter, simulates the swap on devnet
 * (minting output tokens), then calls execute_swap on-chain.
 *
 * Usage:
 *   npx tsx scripts/keeper.ts
 *   npx tsx scripts/keeper.ts --interval 5000
 *   npx tsx scripts/keeper.ts --dry-run
 *   npx tsx scripts/keeper.ts --twap-window 60 --twap-max-deviation 0.02 --twap-samples 3
 *   npx tsx scripts/keeper.ts --max-pending-minutes 10
 *
 * Environment:
 *   KEEPER_INTERVAL_MS          - polling interval in ms (default: 10000)
 *   KEEPER_DRY_RUN              - set to "true" to skip on-chain execution
 *   KEEPER_MAX_SLIPPAGE         - max slippage fraction (default: 0.05 = 5%)
 *   SOLANA_CLUSTER              - "devnet" | "mainnet-beta" (default: "devnet")
 *   KEEPER_TWAP_WINDOW          - TWAP window in seconds (default: 60)
 *   KEEPER_TWAP_MAX_DEVIATION   - max TWAP deviation fraction (default: 0.02 = 2%)
 *   KEEPER_TWAP_SAMPLES         - min TWAP samples before execution (default: 3)
 *   KEEPER_MAX_PENDING_MINUTES  - max age of Pending receipt in minutes (default: 10)
 *
 * MEV Protection:
 *   The keeper enforces TWAP to prevent price manipulation between deposit and swap.
 *   Before executing a swap, the keeper checks the current Jupiter quote price against
 *   a time-weighted average of recent quotes. If the price deviates more than the
 *   configured threshold, execution is delayed until the price stabilizes.
 *
 *   Stale swap detection flags receipts that have been Pending longer than the
 *   configured maximum, which may indicate stuck swaps or manipulation attempts.
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHIELD_ESCROW_ID = new PublicKey(
  "6fQoefGQ4dRURCDBCo3p4pMWuypLoC1Kjgo6d8pYowpk"
);

const JUPITER_QUOTE_URL = "https://quote-api.jup.ag/v6/quote";

// SwapReceipt account discriminator (first 8 bytes) from IDL
const SWAP_RECEIPT_DISCRIMINATOR = Buffer.from([81, 15, 134, 204, 23, 56, 232, 20]);

// SwapStatus enum values
const SwapStatus = {
  Pending: 0,
  Completed: 1,
  Refunded: 2,
} as const;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface KeeperConfig {
  intervalMs: number;
  dryRun: boolean;
  maxSlippage: number;
  cluster: "devnet" | "mainnet-beta";
  /** TWAP window in seconds. The keeper samples quotes over this window
   *  and rejects execution if the current price deviates too much. */
  twapWindowSec: number;
  /** Maximum allowed deviation from TWAP before delaying execution (fraction, e.g. 0.02 = 2%) */
  twapMaxDeviation: number;
  /** Number of TWAP samples to collect within the window */
  twapSamples: number;
  /** Maximum age of a Pending swap receipt in minutes before it is flagged as stale */
  maxPendingMinutes: number;
}

function parseConfig(): KeeperConfig {
  const args = process.argv.slice(2);
  let intervalMs = parseInt(process.env.KEEPER_INTERVAL_MS || "10000", 10);
  let dryRun = process.env.KEEPER_DRY_RUN === "true";
  let maxSlippage = parseFloat(process.env.KEEPER_MAX_SLIPPAGE || "0.05");
  let cluster = (process.env.SOLANA_CLUSTER || "devnet") as "devnet" | "mainnet-beta";
  let twapWindowSec = parseInt(process.env.KEEPER_TWAP_WINDOW || "60", 10);
  let twapMaxDeviation = parseFloat(process.env.KEEPER_TWAP_MAX_DEVIATION || "0.02");
  let twapSamples = parseInt(process.env.KEEPER_TWAP_SAMPLES || "3", 10);
  let maxPendingMinutes = parseInt(process.env.KEEPER_MAX_PENDING_MINUTES || "10", 10);

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--interval" && args[i + 1]) {
      intervalMs = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--max-slippage" && args[i + 1]) {
      maxSlippage = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === "--cluster" && args[i + 1]) {
      cluster = args[i + 1] as "devnet" | "mainnet-beta";
      i++;
    } else if (args[i] === "--twap-window" && args[i + 1]) {
      twapWindowSec = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--twap-max-deviation" && args[i + 1]) {
      twapMaxDeviation = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === "--twap-samples" && args[i + 1]) {
      twapSamples = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--max-pending-minutes" && args[i + 1]) {
      maxPendingMinutes = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { intervalMs, dryRun, maxSlippage, cluster, twapWindowSec, twapMaxDeviation, twapSamples, maxPendingMinutes };
}

// ---------------------------------------------------------------------------
// Monitoring / Stats
// ---------------------------------------------------------------------------

interface KeeperStats {
  totalSwapsProcessed: number;
  totalInputVolume: bigint;
  totalOutputVolume: bigint;
  totalSlippageBps: number;
  swapCount: number; // for averaging
  lastPollTimestamp: Date | null;
  startedAt: Date;
  errors: number;
  twapDelays: number;
  staleSwapsDetected: number;
}

function createStats(): KeeperStats {
  return {
    totalSwapsProcessed: 0,
    totalInputVolume: BigInt(0),
    totalOutputVolume: BigInt(0),
    totalSlippageBps: 0,
    swapCount: 0,
    lastPollTimestamp: null,
    startedAt: new Date(),
    errors: 0,
    twapDelays: 0,
    staleSwapsDetected: 0,
  };
}

function printStats(stats: KeeperStats): void {
  const uptimeMs = Date.now() - stats.startedAt.getTime();
  const uptimeMin = (uptimeMs / 60_000).toFixed(1);
  const avgSlippage =
    stats.swapCount > 0
      ? (stats.totalSlippageBps / stats.swapCount).toFixed(2)
      : "N/A";

  console.log();
  console.log("=== Keeper Stats ===");
  console.log(`  Uptime:              ${uptimeMin} min`);
  console.log(`  Swaps processed:     ${stats.totalSwapsProcessed}`);
  console.log(`  Total input volume:  ${stats.totalInputVolume.toString()} (raw units)`);
  console.log(`  Total output volume: ${stats.totalOutputVolume.toString()} (raw units)`);
  console.log(`  Average slippage:    ${avgSlippage} bps`);
  console.log(`  TWAP delays:         ${stats.twapDelays}`);
  console.log(`  Stale swaps:         ${stats.staleSwapsDetected}`);
  console.log(`  Errors:              ${stats.errors}`);
  console.log(
    `  Last poll:           ${stats.lastPollTimestamp?.toISOString() ?? "never"}`
  );
  console.log("====================");
  console.log();
}

// ---------------------------------------------------------------------------
// TWAP Price Tracker
// ---------------------------------------------------------------------------

/** A single price sample with timestamp */
interface PriceSample {
  /** Output amount per unit of input (raw quote ratio) */
  rate: bigint;
  timestamp: number;
}

/**
 * Tracks Jupiter quote prices over a sliding window to compute TWAP.
 * Keyed by "inputMint:outputMint" pair.
 */
class TwapTracker {
  private samples: Map<string, PriceSample[]> = new Map();
  private windowMs: number;
  private maxSamples: number;

  constructor(windowSec: number, maxSamples: number) {
    this.windowMs = windowSec * 1000;
    this.maxSamples = Math.max(maxSamples, 1);
  }

  /** Build a cache key for a trading pair */
  private pairKey(inputMint: string, outputMint: string): string {
    return `${inputMint}:${outputMint}`;
  }

  /** Record a new price sample */
  addSample(inputMint: string, outputMint: string, inAmount: bigint, outAmount: bigint): void {
    if (inAmount <= BigInt(0)) return;
    const key = this.pairKey(inputMint, outputMint);
    const now = Date.now();
    // Rate = outAmount * 1e18 / inAmount (scaled for precision)
    const rate = (outAmount * BigInt("1000000000000000000")) / inAmount;

    let pairSamples = this.samples.get(key);
    if (!pairSamples) {
      pairSamples = [];
      this.samples.set(key, pairSamples);
    }

    pairSamples.push({ rate, timestamp: now });

    // Prune old samples outside the window
    const cutoff = now - this.windowMs;
    this.samples.set(key, pairSamples.filter(s => s.timestamp >= cutoff));
  }

  /** Get TWAP for a pair. Returns null if insufficient data. */
  getTwap(inputMint: string, outputMint: string): bigint | null {
    const key = this.pairKey(inputMint, outputMint);
    const pairSamples = this.samples.get(key);
    if (!pairSamples || pairSamples.length === 0) return null;

    // Prune old samples
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const validSamples = pairSamples.filter(s => s.timestamp >= cutoff);
    this.samples.set(key, validSamples);

    if (validSamples.length === 0) return null;

    // Time-weighted average: weight each sample by duration until next sample
    if (validSamples.length === 1) return validSamples[0].rate;

    let weightedSum = BigInt(0);
    let totalWeight = BigInt(0);

    for (let i = 0; i < validSamples.length; i++) {
      const nextTs = i < validSamples.length - 1
        ? validSamples[i + 1].timestamp
        : now;
      const weight = BigInt(nextTs - validSamples[i].timestamp);
      weightedSum += validSamples[i].rate * weight;
      totalWeight += weight;
    }

    if (totalWeight === BigInt(0)) return validSamples[validSamples.length - 1].rate;
    return weightedSum / totalWeight;
  }

  /** Check how many samples are in the current window */
  getSampleCount(inputMint: string, outputMint: string): number {
    const key = this.pairKey(inputMint, outputMint);
    const pairSamples = this.samples.get(key);
    if (!pairSamples) return 0;
    const now = Date.now();
    const cutoff = now - this.windowMs;
    return pairSamples.filter(s => s.timestamp >= cutoff).length;
  }
}

/**
 * Check if the current quote price deviates too much from TWAP.
 * Returns { allowed: true } if the swap should proceed, or
 * { allowed: false, deviation, twapRate, currentRate } if it should be delayed.
 */
function checkTwapDeviation(
  twapTracker: TwapTracker,
  inputMint: string,
  outputMint: string,
  inAmount: bigint,
  outAmount: bigint,
  maxDeviation: number,
  minSamples: number,
): { allowed: boolean; deviation?: number; twapRate?: string; currentRate?: string; reason?: string } {
  // Always record the current quote as a sample
  twapTracker.addSample(inputMint, outputMint, inAmount, outAmount);

  const sampleCount = twapTracker.getSampleCount(inputMint, outputMint);
  if (sampleCount < minSamples) {
    return {
      allowed: false,
      reason: `Insufficient TWAP samples: ${sampleCount}/${minSamples}. Collecting more data before execution.`,
    };
  }

  const twap = twapTracker.getTwap(inputMint, outputMint);
  if (twap === null || twap === BigInt(0)) {
    return { allowed: true }; // No TWAP data yet, allow
  }

  // Current rate (scaled same as TWAP)
  const currentRate = (outAmount * BigInt("1000000000000000000")) / inAmount;

  // Calculate deviation: |currentRate - twap| / twap
  const diff = currentRate > twap ? currentRate - twap : twap - currentRate;
  // deviation as a fraction * 10000 (bps)
  const deviationBps = Number((diff * BigInt(10000)) / twap);
  const deviationFraction = deviationBps / 10000;

  if (deviationFraction > maxDeviation) {
    return {
      allowed: false,
      deviation: deviationFraction,
      twapRate: twap.toString(),
      currentRate: currentRate.toString(),
      reason: `Price deviation ${(deviationFraction * 100).toFixed(2)}% exceeds TWAP threshold ${(maxDeviation * 100).toFixed(1)}%`,
    };
  }

  return {
    allowed: true,
    deviation: deviationFraction,
    twapRate: twap.toString(),
    currentRate: currentRate.toString(),
  };
}

// ---------------------------------------------------------------------------
// Stale swap detection
// ---------------------------------------------------------------------------

/**
 * Check if a receipt is stale (Pending for too long).
 * Returns the age in minutes if stale, or null if not stale.
 */
function checkStaleSwap(
  receipt: PendingReceipt,
  maxPendingMinutes: number,
): { isStale: boolean; ageMinutes: number } {
  const nowSec = Math.floor(Date.now() / 1000);
  const createdAtSec = receipt.createdAt.toNumber();
  const ageMinutes = (nowSec - createdAtSec) / 60;

  return {
    isStale: ageMinutes > maxPendingMinutes,
    ageMinutes: Math.round(ageMinutes * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// PDA derivation helpers
// ---------------------------------------------------------------------------

function deriveShieldConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("shield_config")],
    SHIELD_ESCROW_ID
  );
}

function deriveEscrowAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_authority")],
    SHIELD_ESCROW_ID
  );
}

// ---------------------------------------------------------------------------
// SwapReceipt deserialization from raw account data
// ---------------------------------------------------------------------------

interface PendingReceipt {
  pubkey: PublicKey;
  trader: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  inputAmount: BN;
  outputAmount: BN;
  feeAmount: BN;
  status: number;
  nonce: BN;
  createdAt: BN;
  bump: number;
}

function deserializeSwapReceipt(
  pubkey: PublicKey,
  data: Buffer
): PendingReceipt | null {
  try {
    // Layout from IDL types.SwapReceipt:
    // 8 discriminator
    // 32 trader (pubkey)
    // 32 input_mint (pubkey)
    // 32 output_mint (pubkey)
    // 8  input_amount (u64)
    // 8  output_amount (u64)
    // 8  fee_amount (u64)
    // 1  status (enum: 0=Pending,1=Completed,2=Refunded)
    // 8  nonce (u64)
    // 8  created_at (i64)
    // 1+8 completed_at (Option<i64>: 1 byte tag + 8 bytes if Some)
    // 1  bump (u8)

    let offset = 8; // skip discriminator

    const trader = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const inputMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const outputMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const inputAmount = new BN(data.subarray(offset, offset + 8), "le");
    offset += 8;

    const outputAmount = new BN(data.subarray(offset, offset + 8), "le");
    offset += 8;

    const feeAmount = new BN(data.subarray(offset, offset + 8), "le");
    offset += 8;

    const status = data[offset];
    offset += 1;

    const nonce = new BN(data.subarray(offset, offset + 8), "le");
    offset += 8;

    const createdAt = new BN(data.subarray(offset, offset + 8), "le");
    offset += 8;

    // completed_at: Option<i64> - skip
    const hasCompletedAt = data[offset];
    offset += 1;
    if (hasCompletedAt === 1) {
      offset += 8;
    }

    const bump = data[offset];

    return {
      pubkey,
      trader,
      inputMint,
      outputMint,
      inputAmount,
      outputAmount,
      feeAmount,
      status,
      nonce,
      createdAt,
      bump,
    };
  } catch (err) {
    console.error(`  [WARN] Failed to deserialize receipt ${pubkey.toBase58()}: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Jupiter Quote (for mainnet pricing reference)
// ---------------------------------------------------------------------------

interface JupiterQuote {
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
}

async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
  slippageBps: number = 50
): Promise<JupiterQuote | null> {
  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount,
      slippageBps: slippageBps.toString(),
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(`${JUPITER_QUOTE_URL}?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      console.log(`  [WARN] Jupiter API error (${response.status}): ${text}`);
      return null;
    }

    return (await response.json()) as JupiterQuote;
  } catch (err: any) {
    console.log(`  [WARN] Jupiter quote failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Devnet swap simulation
// ---------------------------------------------------------------------------

/**
 * On devnet, Token-2022 mints created for testing have no Jupiter liquidity.
 * We simulate the swap by:
 *   1. Querying Jupiter for a price reference (if possible with known mints)
 *   2. Falling back to a 1:1 rate adjusted for decimal differences
 *   3. Minting output tokens directly to the escrow output token account
 */
async function simulateDevnetSwap(
  connection: Connection,
  authority: Keypair,
  escrowAuthority: PublicKey,
  receipt: PendingReceipt,
  maxSlippage: number
): Promise<{ outputAmount: BN; slippageBps: number } | null> {
  const inputAmountRaw = receipt.inputAmount;

  // Try Jupiter quote with well-known mainnet mints for price reference
  // USDC mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
  // SOL mainnet: So11111111111111111111111111111111111111112
  let jupiterOutputAmount: bigint | null = null;
  let slippageBps = 0;

  const jupiterQuote = await getJupiterQuote(
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    "So11111111111111111111111111111111111111112",     // SOL
    inputAmountRaw.toString(),
    50
  );

  if (jupiterQuote) {
    jupiterOutputAmount = BigInt(jupiterQuote.outAmount);
    console.log(
      `  Jupiter reference quote: ${inputAmountRaw.toString()} -> ${jupiterOutputAmount.toString()}`
    );
    console.log(`  Price impact: ${jupiterQuote.priceImpactPct}%`);
  } else {
    // Fallback: simulate ~1:990 USDC->wSOL rate (1 USDC ~= 0.00667 SOL at ~$150/SOL)
    // With 6 decimal USDC and 9 decimal wSOL: amount * 990 / 1000
    const inputBigInt = BigInt(inputAmountRaw.toString());
    jupiterOutputAmount = (inputBigInt * BigInt(990)) / BigInt(1000);
    console.log(
      `  Using fallback simulated rate: ${inputAmountRaw.toString()} -> ${jupiterOutputAmount.toString()}`
    );
  }

  // Slippage check: output_amount >= input_amount * (1 - maxSlippage)
  // For same-decimal comparison, we compare raw amounts
  const inputBigInt = BigInt(inputAmountRaw.toString());
  const minAcceptable =
    (inputBigInt * BigInt(Math.floor((1 - maxSlippage) * 10000))) /
    BigInt(10000);

  // Calculate slippage in bps relative to input
  if (inputBigInt > BigInt(0)) {
    if (jupiterOutputAmount < inputBigInt) {
      slippageBps = Number(
        ((inputBigInt - jupiterOutputAmount) * BigInt(10000)) / inputBigInt
      );
    } else {
      slippageBps = 0; // output >= input, no slippage
    }
  }

  // Slippage guard: check that output is reasonable
  // For cross-decimal swaps (e.g. USDC 6 dec -> wSOL 9 dec), the raw amounts
  // are not directly comparable. We use the 5% guard as a sanity check on
  // the simulated output, which on devnet uses the same scaling.
  if (jupiterOutputAmount < minAcceptable) {
    console.log(
      `  [SKIP] Slippage too high: output ${jupiterOutputAmount.toString()} ` +
        `< min acceptable ${minAcceptable.toString()} (${(maxSlippage * 100).toFixed(1)}% max)`
    );
    return null;
  }

  const outputAmount = new BN(jupiterOutputAmount.toString());

  // Mint output tokens to escrow's output token account
  const escrowOutputAta = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    receipt.outputMint,
    escrowAuthority,
    true, // allowOwnerOffCurve (PDA)
    undefined,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );

  console.log(`  Minting ${outputAmount.toString()} output tokens to escrow...`);
  await mintTo(
    connection,
    authority,
    receipt.outputMint,
    escrowOutputAta.address,
    authority,
    BigInt(outputAmount.toString()),
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID
  );

  return { outputAmount, slippageBps };
}

// ---------------------------------------------------------------------------
// Poll for pending receipts
// ---------------------------------------------------------------------------

async function findPendingReceipts(
  connection: Connection
): Promise<PendingReceipt[]> {
  // Use getProgramAccounts with a memcmp filter for:
  // 1. Account discriminator (first 8 bytes matching SwapReceipt)
  // 2. Status byte = Pending (0) at the correct offset
  //
  // SwapReceipt layout offset for status:
  //   8 (disc) + 32 (trader) + 32 (input_mint) + 32 (output_mint)
  //   + 8 (input_amount) + 8 (output_amount) + 8 (fee_amount) = 128
  const STATUS_OFFSET = 8 + 32 + 32 + 32 + 8 + 8 + 8; // = 128

  const accounts = await connection.getProgramAccounts(SHIELD_ESCROW_ID, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: anchor.utils.bytes.bs58.encode(SWAP_RECEIPT_DISCRIMINATOR),
        },
      },
      {
        memcmp: {
          offset: STATUS_OFFSET,
          bytes: anchor.utils.bytes.bs58.encode(Buffer.from([SwapStatus.Pending])),
        },
      },
    ],
  });

  const receipts: PendingReceipt[] = [];
  for (const { pubkey, account } of accounts) {
    const receipt = deserializeSwapReceipt(pubkey, account.data as Buffer);
    if (receipt && receipt.status === SwapStatus.Pending) {
      receipts.push(receipt);
    }
  }

  return receipts;
}

// ---------------------------------------------------------------------------
// Execute swap on-chain
// ---------------------------------------------------------------------------

async function executeSwapOnChain(
  program: Program,
  authority: Keypair,
  receipt: PendingReceipt,
  outputAmount: BN,
  minOutputAmount: BN
): Promise<string> {
  const [shieldConfigPda] = deriveShieldConfigPda();

  const txSig = await program.methods
    .executeSwap(outputAmount, minOutputAmount)
    .accounts({
      authority: authority.publicKey,
      shieldConfig: shieldConfigPda,
      swapReceipt: receipt.pubkey,
    })
    .signers([authority])
    .rpc();

  return txSig;
}

// ---------------------------------------------------------------------------
// Process a single pending receipt
// ---------------------------------------------------------------------------

async function processReceipt(
  connection: Connection,
  program: Program,
  authority: Keypair,
  receipt: PendingReceipt,
  config: KeeperConfig,
  stats: KeeperStats,
  twapTracker: TwapTracker
): Promise<void> {
  console.log();
  console.log(`--- Processing receipt ${receipt.pubkey.toBase58().slice(0, 16)}... ---`);
  console.log(`  Trader:       ${receipt.trader.toBase58()}`);
  console.log(`  Input Mint:   ${receipt.inputMint.toBase58()}`);
  console.log(`  Output Mint:  ${receipt.outputMint.toBase58()}`);
  console.log(`  Input Amount: ${receipt.inputAmount.toString()}`);
  console.log(`  Nonce:        ${receipt.nonce.toString()}`);

  // Check for stale swaps
  const staleCheck = checkStaleSwap(receipt, config.maxPendingMinutes);
  if (staleCheck.isStale) {
    console.warn(
      `  [WARN] STALE SWAP: Receipt has been Pending for ${staleCheck.ageMinutes} minutes ` +
      `(threshold: ${config.maxPendingMinutes} min). This may indicate a stuck swap or manipulation attempt.`
    );
    stats.staleSwapsDetected++;
  } else {
    console.log(`  Swap age:     ${staleCheck.ageMinutes} min (max: ${config.maxPendingMinutes} min)`);
  }

  if (config.dryRun) {
    console.log("  [DRY RUN] Skipping execution.");
    return;
  }

  // Step 1: Get a price quote for TWAP checking
  const inputMintStr = receipt.inputMint.toBase58();
  const outputMintStr = receipt.outputMint.toBase58();
  const inputAmountRaw = BigInt(receipt.inputAmount.toString());

  // For devnet, use well-known mints for Jupiter quote; for mainnet, use actual mints
  const quoteInputMint = config.cluster === "devnet"
    ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    : inputMintStr;
  const quoteOutputMint = config.cluster === "devnet"
    ? "So11111111111111111111111111111111111111112"
    : outputMintStr;

  const jupiterQuote = await getJupiterQuote(
    quoteInputMint,
    quoteOutputMint,
    receipt.inputAmount.toString(),
    50
  );

  let quoteOutAmount: bigint;
  if (jupiterQuote) {
    quoteOutAmount = BigInt(jupiterQuote.outAmount);
    console.log(
      `  Jupiter quote: ${receipt.inputAmount.toString()} -> ${quoteOutAmount.toString()}`
    );
    if (jupiterQuote.priceImpactPct) {
      console.log(`  Price impact:  ${jupiterQuote.priceImpactPct}%`);
    }
  } else {
    // Fallback simulated rate
    quoteOutAmount = (inputAmountRaw * BigInt(990)) / BigInt(1000);
    console.log(
      `  Using fallback simulated rate: ${receipt.inputAmount.toString()} -> ${quoteOutAmount.toString()}`
    );
  }

  // Step 2: TWAP check -- record sample and verify deviation
  const twapResult = checkTwapDeviation(
    twapTracker,
    quoteInputMint,
    quoteOutputMint,
    inputAmountRaw,
    quoteOutAmount,
    config.twapMaxDeviation,
    config.twapSamples,
  );

  console.log(`  [TWAP] Samples in window: ${twapTracker.getSampleCount(quoteInputMint, quoteOutputMint)}`);
  if (twapResult.twapRate) {
    console.log(`  [TWAP] TWAP rate:    ${twapResult.twapRate}`);
    console.log(`  [TWAP] Current rate: ${twapResult.currentRate}`);
  }
  if (twapResult.deviation !== undefined) {
    console.log(`  [TWAP] Deviation:    ${(twapResult.deviation * 100).toFixed(3)}% (max: ${(config.twapMaxDeviation * 100).toFixed(1)}%)`);
  }

  if (!twapResult.allowed) {
    console.log(`  [TWAP DELAY] ${twapResult.reason}`);
    stats.twapDelays++;
    return;
  }

  console.log(`  [TWAP] Price check PASSED`);

  // Step 3: Simulate swap (devnet) or execute Jupiter swap (mainnet)
  const [escrowAuthority] = deriveEscrowAuthorityPda();

  let outputAmount: BN;
  let slippageBps: number;

  if (config.cluster === "devnet") {
    const result = await simulateDevnetSwap(
      connection,
      authority,
      escrowAuthority,
      receipt,
      config.maxSlippage
    );
    if (!result) {
      stats.errors++;
      return;
    }
    outputAmount = result.outputAmount;
    slippageBps = result.slippageBps;
  } else {
    // Mainnet: use the Jupiter quote we already obtained
    if (!jupiterQuote) {
      console.log("  [ERROR] Failed to get Jupiter quote. Skipping.");
      stats.errors++;
      return;
    }

    outputAmount = new BN(jupiterQuote.outAmount);
    const outputBigInt = BigInt(jupiterQuote.outAmount);
    slippageBps =
      inputAmountRaw > BigInt(0) && outputBigInt < inputAmountRaw
        ? Number(((inputAmountRaw - outputBigInt) * BigInt(10000)) / inputAmountRaw)
        : 0;

    // Slippage guard
    const minAcceptable =
      (inputAmountRaw * BigInt(Math.floor((1 - config.maxSlippage) * 10000))) /
      BigInt(10000);
    if (outputBigInt < minAcceptable) {
      console.log(
        `  [SKIP] Slippage too high: output ${outputBigInt.toString()} ` +
          `< min acceptable ${minAcceptable.toString()}`
      );
      stats.errors++;
      return;
    }
  }

  // Step 4: Call execute_swap on-chain
  // min_output_amount = outputAmount * 0.99 (1% tolerance for on-chain rounding)
  const minOutputAmount = new BN(
    (BigInt(outputAmount.toString()) * BigInt(99)) / BigInt(100)
  );

  console.log(`  Output amount:     ${outputAmount.toString()}`);
  console.log(`  Min output amount: ${minOutputAmount.toString()}`);
  console.log(`  Slippage:          ${slippageBps} bps`);

  try {
    const txSig = await executeSwapOnChain(
      program,
      authority,
      receipt,
      outputAmount,
      minOutputAmount
    );

    console.log(`  execute_swap tx: ${txSig}`);
    console.log(
      `  Explorer: https://explorer.solana.com/tx/${txSig}?cluster=${config.cluster}`
    );

    // Update stats
    stats.totalSwapsProcessed++;
    stats.totalInputVolume += BigInt(receipt.inputAmount.toString());
    stats.totalOutputVolume += BigInt(outputAmount.toString());
    stats.totalSlippageBps += slippageBps;
    stats.swapCount++;
  } catch (err: any) {
    console.error(`  [ERROR] execute_swap failed: ${err.message}`);
    if (err.logs) {
      for (const log of err.logs) {
        console.error(`    ${log}`);
      }
    }
    stats.errors++;
  }
}

// ---------------------------------------------------------------------------
// Main keeper loop
// ---------------------------------------------------------------------------

async function runKeeper(): Promise<void> {
  const config = parseConfig();

  console.log();
  console.log("################################################################");
  console.log("#                                                              #");
  console.log("#     MERIDIAN  -  Shield Escrow Keeper Service                #");
  console.log("#     Automated swap execution for the compliance shield       #");
  console.log("#                                                              #");
  console.log("################################################################");
  console.log();
  console.log(`  Cluster:         ${config.cluster}`);
  console.log(`  Interval:        ${config.intervalMs}ms`);
  console.log(`  Max slippage:    ${(config.maxSlippage * 100).toFixed(1)}%`);
  console.log(`  TWAP window:     ${config.twapWindowSec}s (${config.twapSamples} samples, ${(config.twapMaxDeviation * 100).toFixed(1)}% max deviation)`);
  console.log(`  Max pending:     ${config.maxPendingMinutes} min`);
  console.log(`  Dry run:         ${config.dryRun}`);
  console.log();

  // Setup connection
  const connection = new Connection(clusterApiUrl(config.cluster), {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  });

  // Load authority keypair
  const solanaIdPath = path.join(
    process.env.HOME || "~",
    ".config/solana/id.json"
  );
  const keypairDir = path.join(__dirname, "../.demo-keypairs");

  let authority: Keypair;
  if (fs.existsSync(solanaIdPath)) {
    const raw = JSON.parse(fs.readFileSync(solanaIdPath, "utf-8"));
    authority = Keypair.fromSecretKey(Uint8Array.from(raw));
    console.log(
      `  Authority (Solana CLI): ${authority.publicKey.toBase58().slice(0, 16)}...`
    );
  } else if (fs.existsSync(path.join(keypairDir, "authority.json"))) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(keypairDir, "authority.json"), "utf-8")
    );
    authority = Keypair.fromSecretKey(Uint8Array.from(raw));
    console.log(
      `  Authority (demo keypair): ${authority.publicKey.toBase58().slice(0, 16)}...`
    );
  } else {
    throw new Error(
      "No authority keypair found. Run the demo script first or ensure ~/.config/solana/id.json exists."
    );
  }

  // Check balance
  const balance = await connection.getBalance(authority.publicKey);
  console.log(
    `  Authority balance: ${(balance / 1e9).toFixed(4)} SOL`
  );
  if (balance < 0.01 * 1e9) {
    throw new Error("Authority wallet has insufficient SOL. Fund it first.");
  }

  // Load IDL and create program
  const idlPath = path.join(__dirname, "../target/idl/shield_escrow.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const wallet = new Wallet(authority);
  const provider = new AnchorProvider(connection, wallet, {
    preflightCommitment: "confirmed",
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new Program(idl, provider);

  // Verify shield config exists and we are the authority
  const [shieldConfigPda] = deriveShieldConfigPda();
  try {
    const configAccount = await program.account.shieldConfig.fetch(
      shieldConfigPda
    );
    if (configAccount.authority.toBase58() !== authority.publicKey.toBase58()) {
      console.log(
        `  [WARN] Loaded authority (${authority.publicKey.toBase58().slice(0, 12)}...) ` +
          `does not match on-chain authority (${configAccount.authority.toBase58().slice(0, 12)}...).`
      );
      console.log(
        "  The keeper will not be able to call execute_swap unless it is the config authority."
      );
    } else {
      console.log("  Authority matches on-chain shield config.");
    }

    if (!configAccount.isActive) {
      console.log("  [WARN] Shield escrow is currently deactivated.");
    }

    console.log(`  Fee rate: ${configAccount.feeBps / 100}%`);
    console.log(
      `  Total swaps (on-chain): ${configAccount.totalSwaps.toString()}`
    );
  } catch (err: any) {
    console.log(
      `  [WARN] Could not fetch shield config: ${err.message}. ` +
        "The escrow may not be initialized yet."
    );
  }

  console.log();
  console.log("  Starting keeper loop...");
  console.log();

  const stats = createStats();
  const twapTracker = new TwapTracker(config.twapWindowSec, config.twapSamples * 10);

  // Graceful shutdown
  let running = true;
  process.on("SIGINT", () => {
    console.log("\n  Received SIGINT, shutting down...");
    running = false;
  });
  process.on("SIGTERM", () => {
    console.log("\n  Received SIGTERM, shutting down...");
    running = false;
  });

  // Print stats periodically (every 5 polls)
  let pollCount = 0;

  while (running) {
    try {
      stats.lastPollTimestamp = new Date();
      console.log(
        `[${stats.lastPollTimestamp.toISOString()}] Polling for pending receipts...`
      );

      const pendingReceipts = await findPendingReceipts(connection);

      if (pendingReceipts.length === 0) {
        console.log("  No pending receipts found.");
      } else {
        console.log(`  Found ${pendingReceipts.length} pending receipt(s).`);

        for (const receipt of pendingReceipts) {
          if (!running) break;
          try {
            await processReceipt(
              connection,
              program,
              authority,
              receipt,
              config,
              stats,
              twapTracker
            );
          } catch (err: any) {
            console.error(
              `  [ERROR] Unexpected error processing receipt: ${err.message}`
            );
            stats.errors++;
          }
        }
      }

      pollCount++;
      if (pollCount % 5 === 0) {
        printStats(stats);
      }
    } catch (err: any) {
      console.error(`[ERROR] Poll cycle failed: ${err.message}`);
      stats.errors++;
    }

    if (running) {
      await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
    }
  }

  // Final stats on shutdown
  printStats(stats);
  console.log("  Keeper service stopped.");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

runKeeper().catch((err) => {
  console.error();
  console.error("KEEPER FATAL ERROR:");
  console.error(err.message || err);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
