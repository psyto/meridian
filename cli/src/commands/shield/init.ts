import { Command } from "commander";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import {
  formatTxResult,
  formatSimulateResult,
} from "../../format.js";
import { parsePublicKey } from "../../validation.js";

export function registerShieldInit(parent: Command): void {
  parent
    .command("init")
    .description("Initialize shield escrow configuration")
    .requiredOption(
      "--transfer-hook-program <pubkey>",
      "Transfer hook program ID for compliance checks"
    )
    .requiredOption("--kyc-registry <pubkey>", "KYC registry account")
    .requiredOption("--fee-bps <n>", "Fee in basis points (e.g. 30 = 0.3%)")
    .requiredOption("--fee-recipient <pubkey>", "Fee recipient address")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const transferHookProgram = parsePublicKey(opts.transferHookProgram);
      const kycRegistry = parsePublicKey(opts.kycRegistry);
      const feeRecipient = parsePublicKey(opts.feeRecipient);
      const feeBps = parseInt(opts.feeBps);

      const [shieldConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("shield_config")],
        ctx.shieldEscrowProgramId
      );

      const builder = ctx.shieldEscrowProgram.methods
        .initialize({
          transferHookProgram,
          kycRegistry,
          feeBps,
          feeRecipient,
        })
        .accounts({
          authority: ctx.payer.publicKey,
          shieldConfig: shieldConfigPda,
          systemProgram: SystemProgram.programId,
        });

      if (flags.simulate) {
        const result = await builder.simulate();
        console.log(formatSimulateResult(result, flags.json ?? false));
      } else {
        const sig = await builder.rpc();
        console.log(formatTxResult(sig, flags.json ?? false));
        console.log(`Shield config: ${shieldConfigPda.toBase58()}`);
      }
    });
}
