import { Command } from "commander";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { readFileSync, existsSync } from "node:fs";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import {
  formatTxResult,
  formatSimulateResult,
} from "../../format.js";
import { parseHexBytes } from "../../validation.js";

function loadVerificationKey(value: string): number[] {
  if (existsSync(value)) {
    const raw = readFileSync(value, "utf-8").trim();
    const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
    return bytes;
  }
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

export function registerZkInit(parent: Command): void {
  parent
    .command("init")
    .description("Initialize ZK verifier configuration")
    .requiredOption("--circuit-id <hex>", "Circuit identifier (32-byte hex)")
    .requiredOption(
      "--verification-key <hex-or-path>",
      "Verification key as hex string or path to file"
    )
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const circuitId = parseHexBytes(opts.circuitId, 32);
      const verificationKey = loadVerificationKey(opts.verificationKey);

      const [verifierConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("verifier_config")],
        ctx.zkVerifierProgramId
      );

      const builder = ctx.zkVerifierProgram.methods
        .initialize({
          circuitId: Buffer.from(circuitId),
          verificationKey: Buffer.from(verificationKey),
        })
        .accounts({
          authority: ctx.payer.publicKey,
          verifierConfig: verifierConfigPda,
          systemProgram: SystemProgram.programId,
        });

      if (flags.simulate) {
        const result = await builder.simulate();
        console.log(formatSimulateResult(result, flags.json ?? false));
      } else {
        const sig = await builder.rpc();
        console.log(formatTxResult(sig, flags.json ?? false));
        console.log(`Verifier config: ${verifierConfigPda.toBase58()}`);
      }
    });
}
