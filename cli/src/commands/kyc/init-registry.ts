import { Command } from "commander";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getMint } from "@solana/spl-token";
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import {
  formatTxResult,
  formatSimulateResult,
} from "../../format.js";
import { parsePublicKey } from "../../validation.js";

export function registerInitRegistry(parent: Command): void {
  parent
    .command("init-registry")
    .description("Initialize a KYC registry for a Token-2022 mint")
    .requiredOption("--mint <pubkey>", "Token mint address")
    .option(
      "--admin <pubkey>",
      "Registry authority that manages the whitelist/blacklist (default: payer)"
    )
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const mint = parsePublicKey(opts.mint);
      const admin = opts.admin
        ? parsePublicKey(opts.admin)
        : ctx.payer.publicKey;

      // The signer must be the mint authority, or else the transfer-hook
      // program's upgrade authority, shown by passing its ProgramData
      // account (e.g. for a mint whose authority is a program PDA).
      const mintInfo = await getMint(
        ctx.connection,
        mint,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const isMintAuthority =
        mintInfo.mintAuthority?.equals(ctx.payer.publicKey) ?? false;
      const programData = isMintAuthority
        ? null
        : PublicKey.findProgramAddressSync(
            [ctx.transferHookProgram.programId.toBuffer()],
            new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
          )[0];

      const [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("kyc_registry"), mint.toBuffer()],
        ctx.transferHookProgram.programId
      );

      const builder = ctx.transferHookProgram.methods
        .initializeRegistry(admin)
        .accounts({
          authority: ctx.payer.publicKey,
          mint,
          registry: registryPda,
          programData,
          systemProgram: SystemProgram.programId,
        });

      if (flags.simulate) {
        const result = await builder.simulate();
        console.log(formatSimulateResult(result, flags.json ?? false));
      } else {
        const sig = await builder.rpc();
        console.log(formatTxResult(sig, flags.json ?? false));
        console.log(`Registry PDA: ${registryPda.toBase58()}`);
      }
    });
}
