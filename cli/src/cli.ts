import { Command } from "commander";
import { GlobalFlags } from "./config.js";

// Stablecoin commands
import { registerInit } from "./commands/stablecoin/init.js";
import { registerInitRoles } from "./commands/stablecoin/init-roles.js";
import { registerInitVault } from "./commands/stablecoin/init-vault.js";
import { registerRegisterIssuer } from "./commands/stablecoin/register-issuer.js";
import { registerMint } from "./commands/stablecoin/mint.js";
import { registerBurn } from "./commands/stablecoin/burn.js";
import { registerSeize } from "./commands/stablecoin/seize.js";
import { registerPause } from "./commands/stablecoin/pause.js";
import { registerShowConfig } from "./commands/stablecoin/show-config.js";
import { registerShowIssuer } from "./commands/stablecoin/show-issuer.js";
import { registerShowVault } from "./commands/stablecoin/show-vault.js";

// KYC commands
import { registerInitRegistry } from "./commands/kyc/init-registry.js";
import { registerWhitelistAdd } from "./commands/kyc/whitelist-add.js";
import { registerWhitelistRemove } from "./commands/kyc/whitelist-remove.js";
import { registerBlacklistAdd } from "./commands/kyc/blacklist-add.js";
import { registerBlacklistRemove } from "./commands/kyc/blacklist-remove.js";
import { registerShowRegistry } from "./commands/kyc/show-registry.js";
import { registerShowWhitelist } from "./commands/kyc/show-whitelist.js";
import { registerShowBlacklist } from "./commands/kyc/show-blacklist.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("meridian")
    .description("CLI for Meridian Stablecoin Standard (SSS-1/SSS-2)")
    .version("0.1.0");

  // Global options
  program
    .option("--config <path>", "Path to config file")
    .option("--rpc <url>", "RPC URL override")
    .option("--stablecoin-program <pubkey>", "Stablecoin program ID override")
    .option("--transfer-hook-program <pubkey>", "Transfer hook program ID override")
    .option("--wallet <path>", "Wallet keypair path override")
    .option(
      "--commitment <level>",
      "Commitment level: processed, confirmed, finalized"
    )
    .option("--json", "Output in JSON format")
    .option("--simulate", "Simulate transaction without sending");

  // Stablecoin subcommand group
  const stablecoin = program
    .command("stablecoin")
    .description("Stablecoin operations (SSS-1/SSS-2)");

  registerInit(stablecoin);
  registerInitRoles(stablecoin);
  registerInitVault(stablecoin);
  registerRegisterIssuer(stablecoin);
  registerMint(stablecoin);
  registerBurn(stablecoin);
  registerSeize(stablecoin);
  registerPause(stablecoin);
  registerShowConfig(stablecoin);
  registerShowIssuer(stablecoin);
  registerShowVault(stablecoin);

  // KYC subcommand group
  const kyc = program
    .command("kyc")
    .description("KYC/AML compliance operations");

  registerInitRegistry(kyc);
  registerWhitelistAdd(kyc);
  registerWhitelistRemove(kyc);
  registerBlacklistAdd(kyc);
  registerBlacklistRemove(kyc);
  registerShowRegistry(kyc);
  registerShowWhitelist(kyc);
  registerShowBlacklist(kyc);

  return program;
}

export function getGlobalFlags(cmd: Command): GlobalFlags {
  const opts = cmd.optsWithGlobals();
  return {
    config: opts.config,
    rpc: opts.rpc,
    stablecoinProgram: opts.stablecoinProgram,
    transferHookProgram: opts.transferHookProgram,
    wallet: opts.wallet,
    commitment: opts.commitment,
    json: opts.json ?? false,
    simulate: opts.simulate ?? false,
  };
}
