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
 *
 * Environment:
 *   KEEPER_INTERVAL_MS  - polling interval in ms (default: 10000)
 *   KEEPER_DRY_RUN      - set to "true" to skip on-chain execution
 *   KEEPER_MAX_SLIPPAGE  - max slippage fraction (default: 0.05 = 5%)
 *   SOLANA_CLUSTER       - "devnet" | "mainnet-beta" (default: "devnet")
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
}

function parseConfig(): KeeperConfig {
  const args = process.argv.slice(2);
  let intervalMs = parseInt(process.env.KEEPER_INTERVAL_MS || "10000", 10);
  let dryRun = process.env.KEEPER_DRY_RUN === "true";
  let maxSlippage = parseFloat(process.env.KEEPER_MAX_SLIPPAGE || "0.05");
  let cluster = (process.env.SOLANA_CLUSTER || "devnet") as "devnet" | "mainnet-beta";

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
    }
  }

  return { intervalMs, dryRun, maxSlippage, cluster };
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
  console.log(`  Errors:              ${stats.errors}`);
  console.log(
    `  Last poll:           ${stats.lastPollTimestamp?.toISOString() ?? "never"}`
  );
  console.log("====================");
  console.log();
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
  stats: KeeperStats
): Promise<void> {
  console.log();
  console.log(`--- Processing receipt ${receipt.pubkey.toBase58().slice(0, 16)}... ---`);
  console.log(`  Trader:       ${receipt.trader.toBase58()}`);
  console.log(`  Input Mint:   ${receipt.inputMint.toBase58()}`);
  console.log(`  Output Mint:  ${receipt.outputMint.toBase58()}`);
  console.log(`  Input Amount: ${receipt.inputAmount.toString()}`);
  console.log(`  Nonce:        ${receipt.nonce.toString()}`);

  if (config.dryRun) {
    console.log("  [DRY RUN] Skipping execution.");
    return;
  }

  // Step 1: Simulate swap (devnet) or execute Jupiter swap (mainnet)
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
    // Mainnet: use Jupiter API for actual swap
    // For now, this path queries Jupiter but does not execute the actual
    // swap transaction (that requires CPI or a separate Jupiter tx).
    // The keeper would need to:
    //   1. Get Jupiter quote
    //   2. Get Jupiter swap transaction
    //   3. Sign and send the swap tx
    //   4. Read the output amount from the resulting token balance
    //   5. Call execute_swap with the output amount
    const quote = await getJupiterQuote(
      receipt.inputMint.toBase58(),
      receipt.outputMint.toBase58(),
      receipt.inputAmount.toString(),
      50
    );
    if (!quote) {
      console.log("  [ERROR] Failed to get Jupiter quote. Skipping.");
      stats.errors++;
      return;
    }

    outputAmount = new BN(quote.outAmount);
    const inputBigInt = BigInt(receipt.inputAmount.toString());
    const outputBigInt = BigInt(quote.outAmount);
    slippageBps =
      inputBigInt > BigInt(0) && outputBigInt < inputBigInt
        ? Number(((inputBigInt - outputBigInt) * BigInt(10000)) / inputBigInt)
        : 0;

    // Slippage guard
    const minAcceptable =
      (inputBigInt * BigInt(Math.floor((1 - config.maxSlippage) * 10000))) /
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

  // Step 2: Call execute_swap on-chain
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
  console.log(`  Cluster:       ${config.cluster}`);
  console.log(`  Interval:      ${config.intervalMs}ms`);
  console.log(`  Max slippage:  ${(config.maxSlippage * 100).toFixed(1)}%`);
  console.log(`  Dry run:       ${config.dryRun}`);
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
              stats
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
