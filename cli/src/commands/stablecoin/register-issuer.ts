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
  parsePublicKey,
  parseIssuerType,
  parseAmount,
} from "../../validation.js";

export function registerRegisterIssuer(parent: Command): void {
  parent
    .command("register-issuer")
    .description("Register an authorized issuer")
    .requiredOption("--issuer-authority <pubkey>", "Issuer authority public key")
    .requiredOption(
      "--issuer-type <type>",
      "Issuer type: trust-bank, distributor, exchange, api-partner"
    )
    .option("--daily-mint-limit <amount>", "Daily mint limit (0 = unlimited)", "0")
    .option("--daily-burn-limit <amount>", "Daily burn limit (0 = unlimited)", "0")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const issuerAuthority = parsePublicKey(opts.issuerAuthority);

      const [mintConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_config")],
        ctx.stablecoinProgram.programId
      );

      const [issuerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("issuer"), issuerAuthority.toBuffer()],
        ctx.stablecoinProgram.programId
      );

      const params = {
        issuerAuthority,
        issuerType: parseIssuerType(opts.issuerType),
        dailyMintLimit: parseAmount(opts.dailyMintLimit),
        dailyBurnLimit: parseAmount(opts.dailyBurnLimit),
      };

      const builder = ctx.stablecoinProgram.methods
        .registerIssuer(params)
        .accounts({
          authority: ctx.payer.publicKey,
          mintConfig: mintConfigPda,
          issuer: issuerPda,
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
