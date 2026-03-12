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

export function registerShieldUpdateConfig(parent: Command): void {
  parent
    .command("update-config")
    .description("Update shield escrow configuration")
    .option("--fee-bps <n>", "New fee in basis points")
    .option("--fee-recipient <pubkey>", "New fee recipient address")
    .option("--active", "Set shield escrow to active")
    .option("--inactive", "Set shield escrow to inactive")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const [shieldConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("shield_config")],
        ctx.shieldEscrowProgramId
      );

      const params: any = {
        feeBps: opts.feeBps !== undefined ? parseInt(opts.feeBps) : null,
        feeRecipient: opts.feeRecipient
          ? parsePublicKey(opts.feeRecipient)
          : null,
        active: opts.active ? true : opts.inactive ? false : null,
      };

      const builder = ctx.shieldEscrowProgram.methods
        .updateConfig(params)
        .accounts({
          authority: ctx.payer.publicKey,
          shieldConfig: shieldConfigPda,
        });

      if (flags.simulate) {
        const result = await builder.simulate();
        console.log(formatSimulateResult(result, flags.json ?? false));
      } else {
        const sig = await builder.rpc();
        console.log(formatTxResult(sig, flags.json ?? false));
        console.log("Shield config updated");
      }
    });
}
