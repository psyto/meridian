import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import {
  formatTxResult,
  formatSimulateResult,
} from "../../format.js";
import { parsePublicKey } from "../../validation.js";

export function registerWhitelistRemove(parent: Command): void {
  parent
    .command("whitelist-remove")
    .description("Remove a wallet from the KYC whitelist")
    .requiredOption("--mint <pubkey>", "Token mint address")
    .requiredOption("--wallet <pubkey>", "Wallet address to remove")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const mint = parsePublicKey(opts.mint);
      const wallet = parsePublicKey(opts.wallet);

      const [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("kyc_registry"), mint.toBuffer()],
        ctx.transferHookProgram.programId
      );

      const [whitelistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("whitelist"), wallet.toBuffer()],
        ctx.transferHookProgram.programId
      );

      const builder = ctx.transferHookProgram.methods
        .removeFromWhitelist()
        .accounts({
          authority: ctx.payer.publicKey,
          registry: registryPda,
          whitelistEntry: whitelistPda,
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
