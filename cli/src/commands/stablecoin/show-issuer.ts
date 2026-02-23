import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import { serializeAccount } from "../../format.js";
import { parsePublicKey } from "../../validation.js";

export function registerShowIssuer(parent: Command): void {
  parent
    .command("show-issuer")
    .description("Display an Issuer account")
    .requiredOption(
      "--issuer-authority <pubkey>",
      "Issuer authority public key"
    )
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const issuerAuthority = parsePublicKey(opts.issuerAuthority);

      const [issuerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("issuer"), issuerAuthority.toBuffer()],
        ctx.stablecoinProgram.programId
      );

      const account =
        await ctx.stablecoinProgram.account.issuer.fetch(issuerPda);
      console.log(serializeAccount(account, flags.json ?? false));
    });
}
