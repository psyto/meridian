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

export function registerBurn(parent: Command): void {
  parent
    .command("burn")
    .description("Burn stablecoin tokens for fiat redemption")
    .requiredOption("--amount <amount>", "Amount to burn (in smallest units)")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--token-account <pubkey>", "Holder token account to burn from")
    .option(
      "--redemption-info <hex>",
      "Encrypted bank account info for fiat redemption (64 bytes hex)"
    )
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const mint = parsePublicKey(opts.mint);
      const holderTokenAccount = parsePublicKey(opts.tokenAccount);

      const [mintConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_config")],
        ctx.stablecoinProgram.programId
      );

      const params = {
        amount: parseAmount(opts.amount),
        redemptionInfo: parseOptionalHexBytes(opts.redemptionInfo, 64),
      };

      const builder = ctx.stablecoinProgram.methods
        .burn(params)
        .accounts({
          holder: ctx.payer.publicKey,
          mintConfig: mintConfigPda,
          mint,
          holderTokenAccount,
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
