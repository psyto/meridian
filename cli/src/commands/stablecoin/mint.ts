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

export function registerMint(parent: Command): void {
  parent
    .command("mint")
    .description("Mint stablecoin tokens to a recipient")
    .requiredOption("--amount <amount>", "Amount to mint (in smallest units)")
    .requiredOption("--recipient <pubkey>", "Recipient token account")
    .requiredOption("--mint <pubkey>", "Mint address")
    .option("--reference <hex>", "Bank transfer reference (32 bytes hex)")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const mint = parsePublicKey(opts.mint);
      const recipientTokenAccount = parsePublicKey(opts.recipient);

      const [mintConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_config")],
        ctx.stablecoinProgram.programId
      );

      const [issuerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("issuer"), ctx.payer.publicKey.toBuffer()],
        ctx.stablecoinProgram.programId
      );

      const params = {
        amount: parseAmount(opts.amount),
        reference: parseOptionalHexBytes(opts.reference, 32),
      };

      const builder = ctx.stablecoinProgram.methods
        .mint(params)
        .accounts({
          issuerAuthority: ctx.payer.publicKey,
          mintConfig: mintConfigPda,
          issuer: issuerPda,
          mint,
          recipientTokenAccount,
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
