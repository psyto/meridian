import {
  Connection,
  Keypair,
  Commitment,
  PublicKey,
} from "@solana/web3.js";
import anchor from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet } = anchor;
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
  shieldEscrowProgram: Program;
  shieldEscrowProgramId: PublicKey;
  zkVerifierProgram: Program;
  zkVerifierProgramId: PublicKey;
  commitment: Commitment;
}

function loadKeypair(walletPath: string): Keypair {
  const resolved = expandPath(walletPath);
  const raw = readFileSync(resolved, "utf-8");
  const secretKey = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Build a minimal IDL stub so Anchor can construct a Program instance
 * even when the real IDL JSON has not been generated yet.
 */
function makeStubIdl(name: string, programId: string) {
  return {
    address: programId,
    metadata: { name, version: "0.1.0", spec: "0.1.0" },
    instructions: [],
    accounts: [],
    types: [],
  };
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

  const shieldEscrowProgramId = new PublicKey(config.shieldEscrowProgramId);
  const shieldEscrowProgram = new Program(
    makeStubIdl("shield_escrow", config.shieldEscrowProgramId) as any,
    provider,
  );

  const zkVerifierProgramId = new PublicKey(config.zkVerifierProgramId);
  const zkVerifierProgram = new Program(
    makeStubIdl("zk_verifier", config.zkVerifierProgramId) as any,
    provider,
  );

  return {
    connection,
    provider,
    payer,
    stablecoinProgram,
    transferHookProgram,
    shieldEscrowProgram,
    shieldEscrowProgramId,
    zkVerifierProgram,
    zkVerifierProgramId,
    commitment: config.commitment,
  };
}
