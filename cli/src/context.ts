import {
  Connection,
  Keypair,
  Commitment,
  PublicKey,
} from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { readFileSync } from "node:fs";
import { Config, expandPath } from "./config.js";

import stablecoinIdl from "./idl/meridian_stablecoin.json" with { type: "json" };
import transferHookIdl from "./idl/transfer_hook.json" with { type: "json" };

export interface MeridianContext {
  connection: Connection;
  provider: AnchorProvider;
  payer: Keypair;
  stablecoinProgram: Program;
  transferHookProgram: Program;
  commitment: Commitment;
}

function loadKeypair(walletPath: string): Keypair {
  const resolved = expandPath(walletPath);
  const raw = readFileSync(resolved, "utf-8");
  const secretKey = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secretKey);
}

export function createContext(config: Config): MeridianContext {
  const connection = new Connection(config.rpcUrl, config.commitment);
  const payer = loadKeypair(config.wallet);
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: config.commitment,
  });

  const stablecoinProgram = new Program(
    stablecoinIdl as any,
    provider,
  );

  const transferHookProgram = new Program(
    transferHookIdl as any,
    provider,
  );

  return {
    connection,
    provider,
    payer,
    stablecoinProgram,
    transferHookProgram,
    commitment: config.commitment,
  };
}
