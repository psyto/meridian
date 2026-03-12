import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import { serializeAccount } from "../../format.js";

export function registerZkShowConfig(parent: Command): void {
  parent
    .command("show-config")
    .description("Display ZK verifier configuration")
    .action(async (_, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const [verifierConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("verifier_config")],
        ctx.zkVerifierProgramId
      );

      const account =
        await ctx.zkVerifierProgram.account.verifierConfig.fetch(
          verifierConfigPda
        );
      console.log(serializeAccount(account, flags.json ?? false));
    });
}
