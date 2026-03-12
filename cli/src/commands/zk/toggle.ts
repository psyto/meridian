import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import {
  formatTxResult,
  formatSimulateResult,
} from "../../format.js";

export function registerZkToggle(parent: Command): void {
  parent
    .command("toggle")
    .description("Activate or deactivate ZK verifier")
    .option("--activate", "Activate the verifier")
    .option("--deactivate", "Deactivate the verifier")
    .action(async (opts, cmd) => {
      if (!opts.activate && !opts.deactivate) {
        throw new Error("Must specify --activate or --deactivate");
      }
      if (opts.activate && opts.deactivate) {
        throw new Error("Cannot specify both --activate and --deactivate");
      }

      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const [verifierConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("verifier_config")],
        ctx.zkVerifierProgramId
      );

      const active = opts.activate ? true : false;

      const builder = ctx.zkVerifierProgram.methods
        .toggleVerifier({ active })
        .accounts({
          authority: ctx.payer.publicKey,
          verifierConfig: verifierConfigPda,
        });

      if (flags.simulate) {
        const result = await builder.simulate();
        console.log(formatSimulateResult(result, flags.json ?? false));
      } else {
        const sig = await builder.rpc();
        console.log(formatTxResult(sig, flags.json ?? false));
        console.log(`Verifier ${active ? "activated" : "deactivated"}`);
      }
    });
}
