import { Command } from "commander";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import {
  formatTxResult,
  formatSimulateResult,
} from "../../format.js";
import {
  parseCollateralType,
  parsePublicKey,
} from "../../validation.js";

export function registerInitVault(parent: Command): void {
  parent
    .command("init-vault")
    .description("Initialize the collateral vault")
    .requiredOption(
      "--collateral-type <type>",
      "Collateral type: fiat, government-bond, bank-deposit, other"
    )
    .option("--auditor <pubkey>", "Auditor public key")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const [mintConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_config")],
        ctx.stablecoinProgram.programId
      );

      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("collateral_vault"), mintConfigPda.toBuffer()],
        ctx.stablecoinProgram.programId
      );

      const params = {
        collateralType: parseCollateralType(opts.collateralType),
        auditor: opts.auditor ? parsePublicKey(opts.auditor) : null,
      };

      const builder = ctx.stablecoinProgram.methods
        .initializeVault(params)
        .accounts({
          authority: ctx.payer.publicKey,
          mintConfig: mintConfigPda,
          collateralVault: vaultPda,
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
