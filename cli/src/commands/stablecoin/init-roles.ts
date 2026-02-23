import { Command } from "commander";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import {
  formatTxResult,
  formatSimulateResult,
} from "../../format.js";

export function registerInitRoles(parent: Command): void {
  parent
    .command("init-roles")
    .description("Initialize role-based access control for the stablecoin")
    .action(async (_, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const [mintConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_config")],
        ctx.stablecoinProgram.programId
      );

      const [roleConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("role_config"), mintConfigPda.toBuffer()],
        ctx.stablecoinProgram.programId
      );

      const builder = ctx.stablecoinProgram.methods
        .initializeRoles()
        .accounts({
          authority: ctx.payer.publicKey,
          mintConfig: mintConfigPda,
          roleConfig: roleConfigPda,
          systemProgram: SystemProgram.programId,
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
