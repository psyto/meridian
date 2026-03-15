/**
 * Meridian Shield Escrow - Devnet Demo Script
 *
 * Demonstrates the full lifecycle of a compliant token swap through the
 * Shield Escrow on Solana devnet:
 *   0. Setup keypairs and provider
 *   1. Fund participants with SOL
 *   2. Create two Token-2022 mints (USDC + wSOL)
 *   3. Create token accounts and mint tokens
 *   4. Initialize Shield Config
 *   5. Deposit USDC into escrow
 *   6. Execute swap (simulated keeper)
 *   7. Withdraw output tokens
 *   8. Print summary and Explorer links
 *
 * Run with: npx ts-node scripts/demo-devnet.ts
 *       or: npx tsx scripts/demo-devnet.ts
 *
 * Flags:
 *   --use-keeper    After deposit, wait for the keeper service (scripts/keeper.ts)
 *                   to execute the swap instead of doing it manually inline.
 *                   Start the keeper in another terminal first:
 *                     npx tsx scripts/keeper.ts --interval 5000
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  mintTo,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHIELD_ESCROW_ID = new PublicKey("6fQoefGQ4dRURCDBCo3p4pMWuypLoC1Kjgo6d8pYowpk");

// Load IDL
const shieldIdl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../target/idl/shield_escrow.json"), "utf-8")
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUsdc(raw: number | bigint): string {
  return `${(Number(raw) / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC`;
}

function formatWsol(raw: number | bigint): string {
  return `${(Number(raw) / 1_000_000_000).toLocaleString("en-US", { minimumFractionDigits: 9 })} wSOL`;
}

function hr() {
  console.log("=".repeat(72));
}

function step(n: number, label: string) {
  console.log();
  hr();
  console.log(`  STEP ${n}: ${label}`);
  hr();
}

async function confirmTx(connection: Connection, sig: string) {
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature: sig, ...latestBlockhash },
    "confirmed"
  );
}

// PDA derivation helpers matching on-chain seeds
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

function deriveSwapReceiptPda(trader: PublicKey, nonce: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("receipt"), trader.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
    SHIELD_ESCROW_ID
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log();
  console.log("########################################################################");
  console.log("#                                                                      #");
  console.log("#          MERIDIAN  -  Shield Escrow Devnet Demo                      #");
  console.log("#          Compliant Token Swap via KYC-whitelisted Escrow             #");
  console.log("#                                                                      #");
  console.log("########################################################################");
  console.log();

  // -------------------------------------------------------------------------
  // 0. Setup
  // -------------------------------------------------------------------------
  step(0, "Load / generate keypairs & provider");

  const connection = new Connection(clusterApiUrl("devnet"), {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  });

  const KEYPAIR_DIR = path.join(__dirname, "../.demo-keypairs");
  if (!fs.existsSync(KEYPAIR_DIR)) fs.mkdirSync(KEYPAIR_DIR, { recursive: true });

  function loadOrGenerate(name: string): Keypair {
    const fp = path.join(KEYPAIR_DIR, `${name}.json`);
    if (fs.existsSync(fp)) {
      const raw = JSON.parse(fs.readFileSync(fp, "utf-8"));
      const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
      console.log(`  Loaded existing keypair for ${name}: ${kp.publicKey.toBase58().slice(0, 12)}...`);
      return kp;
    }
    const kp = Keypair.generate();
    fs.writeFileSync(fp, JSON.stringify(Array.from(kp.secretKey)));
    console.log(`  Generated new keypair for ${name}: ${kp.publicKey.toBase58().slice(0, 12)}...`);
    return kp;
  }

  // Use the Solana CLI wallet as authority (already funded)
  const solanaIdPath = path.join(process.env.HOME || "~", ".config/solana/id.json");
  let authority: Keypair;
  if (fs.existsSync(solanaIdPath)) {
    const raw = JSON.parse(fs.readFileSync(solanaIdPath, "utf-8"));
    authority = Keypair.fromSecretKey(Uint8Array.from(raw));
    console.log(`  Loaded Solana CLI wallet as authority: ${authority.publicKey.toBase58().slice(0, 12)}...`);
    const fp = path.join(KEYPAIR_DIR, "authority.json");
    if (!fs.existsSync(fp)) fs.writeFileSync(fp, JSON.stringify(Array.from(authority.secretKey)));
  } else {
    authority = loadOrGenerate("authority");
  }

  const trader = loadOrGenerate("trader");
  const keeper = loadOrGenerate("keeper");
  const usdcMintKp = loadOrGenerate("usdc-mint");
  const wsolMintKp = loadOrGenerate("wsol-mint");

  // Provider
  const wallet = new Wallet(authority);
  const provider = new AnchorProvider(connection, wallet, {
    preflightCommitment: "confirmed",
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = new Program(shieldIdl, provider);

  // Derived PDAs
  const [shieldConfigPda] = deriveShieldConfigPda();
  const [escrowAuthority] = deriveEscrowAuthorityPda();
  console.log(`  Shield Config PDA:    ${shieldConfigPda.toBase58()}`);
  console.log(`  Escrow Authority PDA: ${escrowAuthority.toBase58()}`);

  // -------------------------------------------------------------------------
  // 1. Fund participants
  // -------------------------------------------------------------------------
  step(1, "Fund participants with SOL");

  const authBal = await connection.getBalance(authority.publicKey);
  console.log(`  Authority balance: ${(authBal / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
  if (authBal < 1 * LAMPORTS_PER_SOL) {
    throw new Error("Authority wallet needs at least 1 SOL. Fund it via: solana airdrop 2 --url devnet");
  }

  // Transfer SOL to trader
  const traderBal = await connection.getBalance(trader.publicKey);
  if (traderBal < 0.1 * LAMPORTS_PER_SOL) {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: trader.publicKey,
        lamports: 0.5 * LAMPORTS_PER_SOL,
      })
    );
    const sig = await connection.sendTransaction(tx, [authority]);
    await confirmTx(connection, sig);
    console.log(`  Transferred 0.5 SOL to trader (${trader.publicKey.toBase58().slice(0, 8)}...)`);
  } else {
    console.log(`  Trader already funded: ${(traderBal / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
  }

  // -------------------------------------------------------------------------
  // 2. Create Token-2022 mints
  // -------------------------------------------------------------------------
  step(2, "Create Token-2022 mints (USDC + wSOL)");

  const usdcMint = usdcMintKp.publicKey;
  const wsolMint = wsolMintKp.publicKey;

  // USDC mint (6 decimals)
  let usdcMintExists = false;
  try {
    const info = await connection.getAccountInfo(usdcMint);
    if (info) usdcMintExists = true;
  } catch {}

  if (!usdcMintExists) {
    console.log("  Creating USDC mint (6 decimals, Token-2022)...");
    await createMint(
      connection,
      authority,
      authority.publicKey, // mint authority
      null,
      6,
      usdcMintKp,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`  USDC Mint created: ${usdcMint.toBase58()}`);
  } else {
    console.log(`  USDC Mint already exists: ${usdcMint.toBase58()}`);
  }

  // wSOL mint (9 decimals)
  let wsolMintExists = false;
  try {
    const info = await connection.getAccountInfo(wsolMint);
    if (info) wsolMintExists = true;
  } catch {}

  if (!wsolMintExists) {
    console.log("  Creating wSOL mint (9 decimals, Token-2022)...");
    await createMint(
      connection,
      authority,
      authority.publicKey, // mint authority
      null,
      9,
      wsolMintKp,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`  wSOL Mint created: ${wsolMint.toBase58()}`);
  } else {
    console.log(`  wSOL Mint already exists: ${wsolMint.toBase58()}`);
  }

  console.log(`  USDC Mint: ${usdcMint.toBase58()}`);
  console.log(`  wSOL Mint: ${wsolMint.toBase58()}`);

  // -------------------------------------------------------------------------
  // 3. Create token accounts and mint tokens
  // -------------------------------------------------------------------------
  step(3, "Create token accounts and mint 10,000 USDC to trader");

  // Trader ATAs (input = USDC, output = wSOL)
  const traderUsdcAta = await getOrCreateAssociatedTokenAccount(
    connection, authority, usdcMint, trader.publicKey, false, undefined, undefined, TOKEN_2022_PROGRAM_ID
  );
  console.log(`  Trader USDC ATA: ${traderUsdcAta.address.toBase58()}`);

  const traderWsolAta = await getOrCreateAssociatedTokenAccount(
    connection, authority, wsolMint, trader.publicKey, false, undefined, undefined, TOKEN_2022_PROGRAM_ID
  );
  console.log(`  Trader wSOL ATA: ${traderWsolAta.address.toBase58()}`);

  // Escrow authority ATAs (PDA-owned, allowOwnerOffCurve)
  const escrowUsdcAta = await getOrCreateAssociatedTokenAccount(
    connection, authority, usdcMint, escrowAuthority, true, undefined, undefined, TOKEN_2022_PROGRAM_ID
  );
  console.log(`  Escrow USDC ATA: ${escrowUsdcAta.address.toBase58()}`);

  const escrowWsolAta = await getOrCreateAssociatedTokenAccount(
    connection, authority, wsolMint, escrowAuthority, true, undefined, undefined, TOKEN_2022_PROGRAM_ID
  );
  console.log(`  Escrow wSOL ATA: ${escrowWsolAta.address.toBase58()}`);

  // Fee recipient ATA (authority's wSOL account for collecting fees)
  const feeRecipientWsolAta = await getOrCreateAssociatedTokenAccount(
    connection, authority, wsolMint, authority.publicKey, false, undefined, undefined, TOKEN_2022_PROGRAM_ID
  );
  console.log(`  Fee Recipient wSOL ATA: ${feeRecipientWsolAta.address.toBase58()}`);

  // Mint 10,000 USDC to trader
  const USDC_AMOUNT = 10_000_000_000; // 10,000 USDC (6 decimals)
  const traderUsdcBalance = Number(traderUsdcAta.amount);
  if (traderUsdcBalance < USDC_AMOUNT) {
    console.log("  Minting 10,000 USDC to trader...");
    await mintTo(
      connection, authority, usdcMint, traderUsdcAta.address, authority, BigInt(USDC_AMOUNT),
      [], undefined, TOKEN_2022_PROGRAM_ID
    );
    console.log("  Minted 10,000 USDC to trader.");
  } else {
    console.log(`  Trader already has enough USDC: ${formatUsdc(traderUsdcBalance)}`);
  }

  // -------------------------------------------------------------------------
  // 4. Initialize Shield Config
  // -------------------------------------------------------------------------
  step(4, "Initialize Shield Config");

  const transferHookProgram = PublicKey.default; // dummy for demo
  const kycRegistry = PublicKey.default; // dummy for demo
  const feeBps = 30; // 0.3%
  const feeRecipient = authority.publicKey;

  let configExists = false;
  try {
    const info = await connection.getAccountInfo(shieldConfigPda);
    if (info && info.data.length > 0) {
      configExists = true;
      console.log("  Shield Config already initialized, skipping...");
    }
  } catch {}

  let initTxSig = "";
  if (!configExists) {
    console.log("  Initializing Shield Config...");
    console.log(`    Transfer Hook Program: ${transferHookProgram.toBase58()}`);
    console.log(`    KYC Registry:          ${kycRegistry.toBase58()}`);
    console.log(`    Fee BPS:               ${feeBps} (${feeBps / 100}%)`);
    console.log(`    Fee Recipient:         ${feeRecipient.toBase58().slice(0, 12)}...`);

    initTxSig = await program.methods
      .initialize(transferHookProgram, kycRegistry, feeBps, feeRecipient)
      .accounts({
        authority: authority.publicKey,
        shieldConfig: shieldConfigPda,
        escrowAuthority: escrowAuthority,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();
    console.log(`  Shield Config initialized. tx: ${initTxSig.slice(0, 20)}...`);
  }
  console.log(`  Shield Config PDA: ${shieldConfigPda.toBase58()}`);

  // -------------------------------------------------------------------------
  // Parse flags
  // -------------------------------------------------------------------------
  const useKeeper = process.argv.includes("--use-keeper");
  if (useKeeper) {
    console.log();
    console.log("  ** --use-keeper flag detected **");
    console.log("  Step 6 will wait for the keeper service to execute the swap.");
    console.log("  Make sure `npx tsx scripts/keeper.ts` is running in another terminal.");
  }

  // -------------------------------------------------------------------------
  // 5. Deposit
  // -------------------------------------------------------------------------
  step(5, "Trader deposits 1,000 USDC into escrow");

  const nonce = new BN(Math.floor(Date.now() / 1000));
  const depositAmount = new BN(1_000_000_000); // 1,000 USDC (6 decimals)
  const [swapReceiptPda] = deriveSwapReceiptPda(trader.publicKey, nonce);

  console.log(`  Nonce:          ${nonce.toString()}`);
  console.log(`  Deposit Amount: ${formatUsdc(depositAmount.toNumber())}`);
  console.log(`  SwapReceipt PDA: ${swapReceiptPda.toBase58()}`);

  const depositTxSig = await program.methods
    .deposit(nonce, depositAmount)
    .accounts({
      trader: trader.publicKey,
      shieldConfig: shieldConfigPda,
      escrowAuthority: escrowAuthority,
      inputMint: usdcMint,
      outputMint: wsolMint,
      traderInputToken: traderUsdcAta.address,
      escrowInputToken: escrowUsdcAta.address,
      swapReceipt: swapReceiptPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([trader])
    .rpc();
  console.log(`  Deposit tx: ${depositTxSig.slice(0, 20)}...`);

  // Print balances after deposit
  const traderUsdcAfterDeposit = await getAccount(connection, traderUsdcAta.address, undefined, TOKEN_2022_PROGRAM_ID);
  const escrowUsdcAfterDeposit = await getAccount(connection, escrowUsdcAta.address, undefined, TOKEN_2022_PROGRAM_ID);
  console.log();
  console.log("  --- Balances after deposit ---");
  console.log(`  Trader USDC:  ${formatUsdc(traderUsdcAfterDeposit.amount)}`);
  console.log(`  Escrow USDC:  ${formatUsdc(escrowUsdcAfterDeposit.amount)}`);

  // -------------------------------------------------------------------------
  // 6. Execute Swap
  // -------------------------------------------------------------------------
  let swapTxSig = "";

  if (useKeeper) {
    step(6, "Waiting for keeper service to execute the swap...");
    console.log("  The receipt is now Pending. The keeper will pick it up,");
    console.log("  simulate the Jupiter swap, mint output tokens, and call execute_swap.");
    console.log();

    // Poll until the receipt status changes from Pending
    const KEEPER_POLL_INTERVAL = 3_000; // 3 seconds
    const KEEPER_TIMEOUT = 120_000; // 2 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < KEEPER_TIMEOUT) {
      const receipt = await program.account.swapReceipt.fetch(swapReceiptPda);
      // status is an enum object in Anchor; check for "completed" key
      const statusObj = receipt.status as any;
      if (statusObj.completed !== undefined || statusObj.Completed !== undefined) {
        console.log("  Keeper has executed the swap!");
        break;
      }
      if (statusObj.refunded !== undefined || statusObj.Refunded !== undefined) {
        throw new Error("Swap was refunded by the keeper instead of executed.");
      }
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      process.stdout.write(`\r  Waiting... (${elapsed}s elapsed)`);
      await new Promise((r) => setTimeout(r, KEEPER_POLL_INTERVAL));
    }
    console.log();

    const receipt = await program.account.swapReceipt.fetch(swapReceiptPda);
    const statusObj = receipt.status as any;
    if (statusObj.pending !== undefined || statusObj.Pending !== undefined) {
      throw new Error(
        "Timed out waiting for keeper. Is `npx tsx scripts/keeper.ts` running?"
      );
    }

    swapTxSig = "(executed by keeper)";
  } else {
    step(6, "Execute swap (simulated keeper marks swap as completed)");

    // Simulate Jupiter having deposited swap result: mint 990 wSOL to escrow output
    // 1000 USDC -> ~990 wSOL (simulated rate, before protocol fee)
    const simulatedOutputAmount = new BN(990_000_000_000); // 990 wSOL (9 decimals)
    console.log("  Simulating Jupiter swap result: minting 990 wSOL to escrow...");
    await mintTo(
      connection, authority, wsolMint, escrowWsolAta.address, authority, BigInt(simulatedOutputAmount.toString()),
      [], undefined, TOKEN_2022_PROGRAM_ID
    );
    console.log(`  Minted ${formatWsol(simulatedOutputAmount.toNumber())} to escrow wSOL account.`);

    // Call executeSwap as authority (keeper)
    const outputAmount = simulatedOutputAmount;
    const minOutputAmount = new BN(980_000_000_000); // slippage tolerance

    console.log(`  Output Amount:     ${formatWsol(outputAmount.toNumber())}`);
    console.log(`  Min Output Amount: ${formatWsol(minOutputAmount.toNumber())}`);

    swapTxSig = await program.methods
      .executeSwap(outputAmount, minOutputAmount)
      .accounts({
        authority: authority.publicKey,
        shieldConfig: shieldConfigPda,
        swapReceipt: swapReceiptPda,
      })
      .signers([authority])
      .rpc();
    console.log(`  Execute swap tx: ${swapTxSig.slice(0, 20)}...`);
  }

  // Fetch receipt to show fee calculations
  const receiptAfterSwap = await program.account.swapReceipt.fetch(swapReceiptPda);
  console.log();
  console.log("  --- Swap Receipt after execution ---");
  console.log(`  Output Amount (net): ${formatWsol(Number(receiptAfterSwap.outputAmount))}`);
  console.log(`  Fee Amount:          ${formatWsol(Number(receiptAfterSwap.feeAmount))}`);
  console.log(`  Status:              Completed`);

  // -------------------------------------------------------------------------
  // 7. Withdraw
  // -------------------------------------------------------------------------
  step(7, "Trader withdraws output tokens from escrow");

  const traderWsolBefore = await getAccount(connection, traderWsolAta.address, undefined, TOKEN_2022_PROGRAM_ID);
  const feeRecipientBefore = await getAccount(connection, feeRecipientWsolAta.address, undefined, TOKEN_2022_PROGRAM_ID);

  console.log("  --- Balances BEFORE withdrawal ---");
  console.log(`  Trader wSOL:        ${formatWsol(traderWsolBefore.amount)}`);
  console.log(`  Fee Recipient wSOL: ${formatWsol(feeRecipientBefore.amount)}`);
  console.log();

  const withdrawTxSig = await program.methods
    .withdraw()
    .accounts({
      trader: trader.publicKey,
      shieldConfig: shieldConfigPda,
      escrowAuthority: escrowAuthority,
      outputMint: wsolMint,
      escrowOutputToken: escrowWsolAta.address,
      traderOutputToken: traderWsolAta.address,
      feeRecipientToken: feeRecipientWsolAta.address,
      swapReceipt: swapReceiptPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([trader])
    .rpc();
  console.log(`  Withdraw tx: ${withdrawTxSig.slice(0, 20)}...`);

  // Print final balances
  const traderWsolAfter = await getAccount(connection, traderWsolAta.address, undefined, TOKEN_2022_PROGRAM_ID);
  const feeRecipientAfter = await getAccount(connection, feeRecipientWsolAta.address, undefined, TOKEN_2022_PROGRAM_ID);
  const escrowWsolAfter = await getAccount(connection, escrowWsolAta.address, undefined, TOKEN_2022_PROGRAM_ID);

  console.log();
  console.log("  --- Balances AFTER withdrawal ---");
  console.log(`  Trader wSOL:        ${formatWsol(traderWsolAfter.amount)}`);
  console.log(`  Fee Recipient wSOL: ${formatWsol(feeRecipientAfter.amount)} (fee collected)`);
  console.log(`  Escrow wSOL:        ${formatWsol(escrowWsolAfter.amount)} (should be 0)`);

  // -------------------------------------------------------------------------
  // 8. Summary
  // -------------------------------------------------------------------------
  step(8, "Summary");

  const config = await program.account.shieldConfig.fetch(shieldConfigPda);
  console.log("  Shield Config Stats:");
  console.log(`    Total Swaps:   ${config.totalSwaps.toString()}`);
  console.log(`    Total Volume:  ${formatUsdc(Number(config.totalVolume))} (input volume)`);
  console.log(`    Fee Rate:      ${config.feeBps / 100}%`);
  console.log(`    Active:        ${config.isActive}`);

  console.log();
  console.log("  Swap Receipt Details:");
  const finalReceipt = await program.account.swapReceipt.fetch(swapReceiptPda);
  console.log(`    Trader:        ${finalReceipt.trader.toBase58()}`);
  console.log(`    Input Mint:    ${finalReceipt.inputMint.toBase58()}`);
  console.log(`    Output Mint:   ${finalReceipt.outputMint.toBase58()}`);
  console.log(`    Input Amount:  ${formatUsdc(Number(finalReceipt.inputAmount))}`);
  console.log(`    Output Amount: ${formatWsol(Number(finalReceipt.outputAmount))} (after fee)`);
  console.log(`    Fee Amount:    ${formatWsol(Number(finalReceipt.feeAmount))}`);

  console.log();
  hr();
  console.log("  DEMO COMPLETE -- Full escrow swap lifecycle on Solana devnet!");
  hr();

  console.log();
  console.log("  Explorer links:");
  console.log(`    Shield Config: https://explorer.solana.com/address/${shieldConfigPda.toBase58()}?cluster=devnet`);
  console.log(`    Swap Receipt:  https://explorer.solana.com/address/${swapReceiptPda.toBase58()}?cluster=devnet`);
  console.log(`    USDC Mint:     https://explorer.solana.com/address/${usdcMint.toBase58()}?cluster=devnet`);
  console.log(`    wSOL Mint:     https://explorer.solana.com/address/${wsolMint.toBase58()}?cluster=devnet`);
  console.log(`    Deposit Tx:    https://explorer.solana.com/tx/${depositTxSig}?cluster=devnet`);
  console.log(`    Swap Tx:       https://explorer.solana.com/tx/${swapTxSig}?cluster=devnet`);
  console.log(`    Withdraw Tx:   https://explorer.solana.com/tx/${withdrawTxSig}?cluster=devnet`);

  console.log();
  console.log("  NOTE: In production, Step 6 is handled by the keeper service");
  console.log("  (scripts/keeper.ts) which polls for pending receipts, quotes via");
  console.log("  Jupiter, simulates the swap on devnet, and calls execute_swap.");
  console.log("  Run with --use-keeper to test this integration:");
  console.log("    Terminal 1: npx tsx scripts/keeper.ts --interval 5000");
  console.log("    Terminal 2: npx tsx scripts/demo-devnet.ts --use-keeper");
  console.log();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error();
    console.error("  DEMO FAILED:");
    console.error(`  ${err.message || err}`);
    if (err.logs) {
      console.error();
      console.error("  Program logs:");
      for (const log of err.logs) {
        console.error(`    ${log}`);
      }
    }
    if (err.stack) {
      console.error();
      console.error("  Stack trace:");
      console.error(err.stack);
    }
    console.error();
    process.exit(1);
  });
