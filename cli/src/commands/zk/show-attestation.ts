import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import { serializeAccount } from "../../format.js";
import { parsePublicKey } from "../../validation.js";

export function registerZkShowAttestation(parent: Command): void {
  parent
    .command("show-attestation")
    .description("Display ZK attestation for a wallet")
    .requiredOption("--wallet <pubkey>", "Wallet address to look up")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const wallet = parsePublicKey(opts.wallet);

      const [attestationPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("attestation"), wallet.toBuffer()],
        ctx.zkVerifierProgramId
      );

      const account =
        await ctx.zkVerifierProgram.account.attestation.fetch(attestationPda);
      console.log(serializeAccount(account, flags.json ?? false));
    });
}
