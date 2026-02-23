import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import {
  formatTxResult,
  formatSimulateResult,
} from "../../format.js";
import {
  parsePublicKey,
  parseAmount,
  parseOptionalHexBytes,
} from "../../validation.js";

export function registerSeize(parent: Command): void {
  parent
    .command("seize")
    .description(
      "Seize tokens from a frozen account via permanent delegate (SSS-2 only). " +
        "Requires the mint to have been initialized with SSS-2 preset or --enable-permanent-delegate."
    )
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--source <pubkey>", "Frozen account to seize from")
    .requiredOption("--treasury <pubkey>", "Treasury account to receive seized tokens")
    .option("--amount <amount>", "Amount to seize (0 = entire balance)", "0")
    .option("--reason <hex>", "Reason for seizure (32 bytes hex)")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const mint = parsePublicKey(opts.mint);
      const source = parsePublicKey(opts.source);
      const treasury = parsePublicKey(opts.treasury);

      const [mintConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_config")],
        ctx.stablecoinProgram.programId
      );

      const params = {
        amount: parseAmount(opts.amount),
        reason: parseOptionalHexBytes(opts.reason, 32),
      };

      const builder = ctx.stablecoinProgram.methods
        .seize(params)
        .accounts({
          authority: ctx.payer.publicKey,
          mintConfig: mintConfigPda,
          mint,
          source,
          treasury,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
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
