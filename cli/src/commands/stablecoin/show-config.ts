import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import { serializeAccount } from "../../format.js";

export function registerShowConfig(parent: Command): void {
  parent
    .command("show-config")
    .description("Display the stablecoin MintConfig account")
    .action(async (_, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const [mintConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_config")],
        ctx.stablecoinProgram.programId
      );

      const account =
        await ctx.stablecoinProgram.account.mintConfig.fetch(mintConfigPda);
      console.log(serializeAccount(account, flags.json ?? false));
    });
}
