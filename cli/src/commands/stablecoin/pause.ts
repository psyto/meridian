import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import {
  formatTxResult,
  formatSimulateResult,
} from "../../format.js";

export function registerPause(parent: Command): void {
  parent
    .command("pause")
    .description("Pause or unpause minting/burning operations")
    .option("--unpause", "Unpause instead of pause")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const [mintConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_config")],
        ctx.stablecoinProgram.programId
      );

      const method = opts.unpause ? "unpause" : "pause";

      const builder = ctx.stablecoinProgram.methods[method]().accounts({
        authority: ctx.payer.publicKey,
        mintConfig: mintConfigPda,
      });

      if (flags.simulate) {
        const result = await builder.simulate();
        console.log(formatSimulateResult(result, flags.json ?? false));
      } else {
        const sig = await builder.rpc();
        console.log(formatTxResult(sig, flags.json ?? false));
        console.log(opts.unpause ? "Mint unpaused" : "Mint paused");
      }
    });
}
