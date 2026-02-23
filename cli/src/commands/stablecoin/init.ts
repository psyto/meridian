import { Command } from "commander";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import {
  formatTxResult,
  formatSimulateResult,
} from "../../format.js";
import {
  parsePreset,
  parsePublicKey,
} from "../../validation.js";

export function registerInit(parent: Command): void {
  parent
    .command("init")
    .description("Initialize a new stablecoin mint with Token-2022 extensions")
    .requiredOption("--preset <preset>", "Stablecoin preset: sss1, sss2, custom")
    .requiredOption("--name <name>", "Token name")
    .requiredOption("--symbol <symbol>", "Token symbol")
    .option("--uri <uri>", "Metadata URI", "")
    .option("--decimals <n>", "Token decimals", "2")
    .option("--freeze-authority <pubkey>", "Freeze authority override")
    .option("--price-oracle <pubkey>", "Price oracle pubkey")
    .option("--treasury <pubkey>", "Treasury for seized tokens (required for SSS-2)")
    .option("--enable-permanent-delegate", "Enable permanent delegate")
    .option("--enable-transfer-hook", "Enable transfer hook")
    .option("--default-account-frozen", "New accounts start frozen")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const mintKeypair = Keypair.generate();
      const preset = parsePreset(opts.preset);

      const params = {
        preset,
        name: opts.name,
        symbol: opts.symbol,
        uri: opts.uri,
        decimals: parseInt(opts.decimals),
        freezeAuthority: opts.freezeAuthority
          ? parsePublicKey(opts.freezeAuthority)
          : null,
        priceOracle: opts.priceOracle
          ? parsePublicKey(opts.priceOracle)
          : null,
        treasury: opts.treasury
          ? parsePublicKey(opts.treasury)
          : null,
        enablePermanentDelegate: opts.enablePermanentDelegate ?? null,
        enableTransferHook: opts.enableTransferHook ?? null,
        defaultAccountFrozen: opts.defaultAccountFrozen ?? null,
      };

      const [mintConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_config")],
        ctx.stablecoinProgram.programId
      );

      const builder = ctx.stablecoinProgram.methods
        .initialize(params)
        .accounts({
          authority: ctx.payer.publicKey,
          mintConfig: mintConfigPda,
          mint: mintKeypair.publicKey,
          transferHookProgram: ctx.transferHookProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([mintKeypair]);

      if (flags.simulate) {
        const result = await builder.simulate();
        console.log(formatSimulateResult(result, flags.json ?? false));
      } else {
        const sig = await builder.rpc();
        console.log(formatTxResult(sig, flags.json ?? false));
        console.log(`Mint address: ${mintKeypair.publicKey.toBase58()}`);
      }
    });
}
