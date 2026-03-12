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

export function registerZkRevoke(parent: Command): void {
  parent
    .command("revoke")
    .description("Revoke a wallet's ZK attestation")
    .requiredOption("--wallet <pubkey>", "Wallet address to revoke")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const wallet = parsePublicKey(opts.wallet);

      const [verifierConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("verifier_config")],
        ctx.zkVerifierProgramId
      );

      const [attestationPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("attestation"), wallet.toBuffer()],
        ctx.zkVerifierProgramId
      );

      const builder = ctx.zkVerifierProgram.methods
        .revokeAttestation()
        .accounts({
          authority: ctx.payer.publicKey,
          verifierConfig: verifierConfigPda,
          attestation: attestationPda,
          wallet,
        });

      if (flags.simulate) {
        const result = await builder.simulate();
        console.log(formatSimulateResult(result, flags.json ?? false));
      } else {
        const sig = await builder.rpc();
        console.log(formatTxResult(sig, flags.json ?? false));
        console.log(`Attestation revoked for ${wallet.toBase58()}`);
      }
    });
}
