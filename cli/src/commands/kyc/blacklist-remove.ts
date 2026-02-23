import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import {
  formatTxResult,
  formatSimulateResult,
} from "../../format.js";
import { parsePublicKey } from "../../validation.js";

export function registerBlacklistRemove(parent: Command): void {
  parent
    .command("blacklist-remove")
    .description("Remove a wallet from the blacklist")
    .requiredOption("--mint <pubkey>", "Token mint address")
    .requiredOption("--wallet <pubkey>", "Wallet address to remove from blacklist")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const mint = parsePublicKey(opts.mint);
      const wallet = parsePublicKey(opts.wallet);

      const [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("kyc_registry"), mint.toBuffer()],
        ctx.transferHookProgram.programId
      );

      const [blacklistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("blacklist"), wallet.toBuffer()],
        ctx.transferHookProgram.programId
      );

      const builder = ctx.transferHookProgram.methods
        .removeFromBlacklist()
        .accounts({
          authority: ctx.payer.publicKey,
          registry: registryPda,
          blacklistEntry: blacklistPda,
        });

      if (flags.simulate) {
        const result = await builder.simulate();
        console.log(formatSimulateResult(result, flags.json ?? false));
      } else {
        const sig = await builder.rpc();
        console.log(formatTxResult(sig, flags.json ?? false));
      }
    });
}
