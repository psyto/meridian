import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import pkg from "@coral-xyz/anchor";
const { BN } = pkg;
import { getGlobalFlags } from "../../cli.js";
import { loadConfig } from "../../config.js";
import { createContext } from "../../context.js";
import { serializeAccount } from "../../format.js";
import { parsePublicKey } from "../../validation.js";

export function registerShieldShowReceipt(parent: Command): void {
  parent
    .command("show-receipt")
    .description("Display a swap receipt")
    .requiredOption("--trader <pubkey>", "Trader wallet address")
    .requiredOption("--nonce <n>", "Receipt nonce")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const trader = parsePublicKey(opts.trader);
      const nonce = new BN(opts.nonce);

      const [receiptPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("receipt"),
          trader.toBuffer(),
          nonce.toArrayLike(Buffer, "le", 8),
        ],
        ctx.shieldEscrowProgramId
      );

      const account =
        await ctx.shieldEscrowProgram.account.swapReceipt.fetch(receiptPda);
      console.log(serializeAccount(account, flags.json ?? false));
    });
}
