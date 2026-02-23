import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { Commitment } from "@solana/web3.js";

const CommitmentSchema = z.enum(["processed", "confirmed", "finalized"]);

const ConfigSchema = z.object({
  rpcUrl: z.string().url(),
  stablecoinProgramId: z.string(),
  transferHookProgramId: z.string(),
  wallet: z.string(),
  commitment: CommitmentSchema.default("confirmed"),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface GlobalFlags {
  config?: string;
  rpc?: string;
  stablecoinProgram?: string;
  transferHookProgram?: string;
  wallet?: string;
  commitment?: Commitment;
  json?: boolean;
  simulate?: boolean;
}

const DEFAULT_CONFIG_NAME = "meridian.config.json";

export function loadConfig(flags: GlobalFlags): Config {
  const configPath = flags.config ?? findConfig();

  let fileConfig: Partial<Config> = {};
  if (configPath && existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      fileConfig = JSON.parse(raw);
    } catch (e) {
      throw new Error(`Failed to parse config file ${configPath}: ${e}`);
    }
  }

  const merged = {
    rpcUrl:
      flags.rpc ??
      fileConfig.rpcUrl ??
      process.env.SOLANA_RPC_URL ??
      "https://api.devnet.solana.com",
    stablecoinProgramId:
      flags.stablecoinProgram ??
      fileConfig.stablecoinProgramId ??
      process.env.MERIDIAN_STABLECOIN_PROGRAM_ID ??
      "HdaUf9PL9ncd1AgXbA13P9ss6mLtCVdGZfroZB4q6CwP",
    transferHookProgramId:
      flags.transferHookProgram ??
      fileConfig.transferHookProgramId ??
      process.env.MERIDIAN_TRANSFER_HOOK_PROGRAM_ID ??
      "5DLH2UrDD5bJFadn1gV1rof6sJ7MzJbVNnUfVMtGJgSL",
    wallet:
      flags.wallet ??
      fileConfig.wallet ??
      "~/.config/solana/id.json",
    commitment: flags.commitment ?? fileConfig.commitment ?? "confirmed",
  };

  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    );
    throw new Error(`Invalid config:\n${issues.join("\n")}`);
  }

  return result.data;
}

function findConfig(): string | undefined {
  const path = resolve(process.cwd(), DEFAULT_CONFIG_NAME);
  return existsSync(path) ? path : undefined;
}

export function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return resolve(home, p.slice(2));
  }
  return resolve(p);
}
