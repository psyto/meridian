import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import { serializeAccount } from "../../format.js";

export function registerShieldShowConfig(parent: Command): void {
  parent
    .command("show-config")
    .description("Display shield escrow configuration")
    .action(async (_, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const [shieldConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("shield_config")],
        ctx.shieldEscrowProgramId
      );

      const account =
        await ctx.shieldEscrowProgram.account.shieldConfig.fetch(
          shieldConfigPda
        );
      console.log(serializeAccount(account, flags.json ?? false));
    });
}
