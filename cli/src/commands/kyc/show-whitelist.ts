import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import { serializeAccount } from "../../format.js";
import { parsePublicKey } from "../../validation.js";

export function registerShowWhitelist(parent: Command): void {
  parent
    .command("show-whitelist")
    .description("Display a WhitelistEntry account")
    .requiredOption("--mint <pubkey>", "Token mint address")
    .requiredOption("--wallet <pubkey>", "Wallet address to look up")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const wallet = parsePublicKey(opts.wallet);
      const mint = parsePublicKey(opts.mint);

      const [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("kyc_registry"), mint.toBuffer()],
        ctx.transferHookProgram.programId
      );

      const [whitelistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("whitelist"), registryPda.toBuffer(), wallet.toBuffer()],
        ctx.transferHookProgram.programId
      );

      const account =
        await ctx.transferHookProgram.account.whitelistEntry.fetch(
          whitelistPda
        );
      console.log(serializeAccount(account, flags.json ?? false));
    });
}
