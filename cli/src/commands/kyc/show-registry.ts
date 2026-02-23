import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import { serializeAccount } from "../../format.js";
import { parsePublicKey } from "../../validation.js";

export function registerShowRegistry(parent: Command): void {
  parent
    .command("show-registry")
    .description("Display the KYC Registry account")
    .requiredOption("--mint <pubkey>", "Token mint address")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const mint = parsePublicKey(opts.mint);

      const [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("kyc_registry"), mint.toBuffer()],
        ctx.transferHookProgram.programId
      );

      const account =
        await ctx.transferHookProgram.account.kycRegistry.fetch(registryPda);
      console.log(serializeAccount(account, flags.json ?? false));
    });
}
