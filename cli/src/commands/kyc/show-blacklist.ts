import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import { serializeAccount } from "../../format.js";
import { parsePublicKey } from "../../validation.js";

export function registerShowBlacklist(parent: Command): void {
  parent
    .command("show-blacklist")
    .description("Display a BlacklistEntry account")
    .requiredOption("--wallet <pubkey>", "Wallet address to look up")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const wallet = parsePublicKey(opts.wallet);

      const [blacklistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("blacklist"), wallet.toBuffer()],
        ctx.transferHookProgram.programId
      );

      const account =
        await ctx.transferHookProgram.account.blacklistEntry.fetch(
          blacklistPda
        );
      console.log(serializeAccount(account, flags.json ?? false));
    });
}
