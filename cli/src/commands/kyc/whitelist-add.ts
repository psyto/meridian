import { Command } from "commander";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import {
  formatTxResult,
  formatSimulateResult,
} from "../../format.js";
import {
  parsePublicKey,
  parseKycLevel,
  parseJurisdiction,
  parseOptionalHexBytes,
  parseAmount,
} from "../../validation.js";

export function registerWhitelistAdd(parent: Command): void {
  parent
    .command("whitelist-add")
    .description("Add a wallet to the KYC whitelist")
    .requiredOption("--mint <pubkey>", "Token mint address")
    .requiredOption("--wallet <pubkey>", "Wallet address to whitelist")
    .requiredOption(
      "--kyc-level <level>",
      "KYC level: basic, standard, enhanced, institutional"
    )
    .requiredOption(
      "--jurisdiction <jurisdiction>",
      "Jurisdiction: japan, singapore, hongkong, eu, usa, other"
    )
    .option("--kyc-hash <hex>", "KYC data hash (32 bytes hex)")
    .option("--daily-limit <amount>", "Daily transaction limit (0 = unlimited)", "0")
    .option(
      "--expiry-days <days>",
      "KYC expiry in days from now",
      "365"
    )
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

      const expiryTimestamp = new anchor.BN(
        Math.floor(Date.now() / 1000) + parseInt(opts.expiryDays) * 86400
      );

      const params = {
        wallet,
        kycLevel: parseKycLevel(opts.kycLevel),
        jurisdiction: parseJurisdiction(opts.jurisdiction),
        kycHash: parseOptionalHexBytes(opts.kycHash, 32),
        dailyLimit: parseAmount(opts.dailyLimit),
        expiryTimestamp,
      };

      const builder = ctx.transferHookProgram.methods
        .addToWhitelist(params)
        .accounts({
          authority: ctx.payer.publicKey,
          registry: registryPda,
          whitelistEntry: whitelistPda,
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
