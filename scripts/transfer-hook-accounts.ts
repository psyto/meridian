/**
 * Resolve Token-2022 transfer-hook extra accounts for a transfer that a
 * program performs by CPI (shield-escrow deposit / withdraw / refund /
 * sweep_input). The program forwards its remaining accounts to the hook, so
 * the client must pass the same accounts a direct `transferChecked` would
 * need: the hook program, its extra-account-metas PDA and the accounts that
 * list resolves to. For mints without a transfer hook the result is empty.
 */
import { AccountMeta, Commitment, Connection, PublicKey } from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedWithTransferHookInstruction,
} from "@solana/spl-token";

/** A token account the CPI will create before transferring (not on chain yet). */
export interface PendingTokenAccount {
  address: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
}

/**
 * Wrap `connection` so getAccountInfo returns a minimal token-account image
 * for accounts that do not exist yet. Extra-account-meta seeds that read the
 * destination's owner (bytes 32..64) can then be resolved before the deposit
 * creates the escrow token account.
 */
function withPendingAccounts(
  connection: Connection,
  pending: PendingTokenAccount[],
  programId: PublicKey
): Connection {
  if (pending.length === 0) return connection;
  return new Proxy(connection, {
    get(target, prop, receiver) {
      if (prop === "getAccountInfo") {
        return async (address: PublicKey, commitment?: Commitment) => {
          const p = pending.find((x) => x.address.equals(address));
          if (p) {
            const data = Buffer.alloc(ACCOUNT_SIZE);
            p.mint.toBuffer().copy(data, 0);
            p.owner.toBuffer().copy(data, 32);
            data[108] = 1; // AccountState::Initialized
            return { data, owner: programId, lamports: 0, executable: false, rentEpoch: 0 };
          }
          return target.getAccountInfo(address, commitment);
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

/**
 * Extra accounts for one `transfer_checked(source -> destination)` signed by
 * `owner` (which may be a PDA: the returned metas are never signers).
 */
export async function resolveTransferHookAccounts(
  connection: Connection,
  source: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint,
  decimals: number,
  pending: PendingTokenAccount[] = [],
  programId: PublicKey = TOKEN_2022_PROGRAM_ID
): Promise<AccountMeta[]> {
  const ix = await createTransferCheckedWithTransferHookInstruction(
    withPendingAccounts(connection, pending, programId),
    source,
    mint,
    destination,
    owner,
    amount,
    decimals,
    [],
    "confirmed",
    programId
  );
  // keys[0..4] = source, mint, destination, owner; the rest are hook accounts
  return ix.keys.slice(4).map((k) => ({ ...k, isSigner: false }));
}

/** Merge several resolved lists (e.g. withdraw's trader + fee transfers). */
export function mergeAccountMetas(...lists: AccountMeta[][]): AccountMeta[] {
  const out: AccountMeta[] = [];
  for (const list of lists) {
    for (const m of list) {
      const i = out.findIndex((x) => x.pubkey.equals(m.pubkey));
      if (i === -1) out.push({ ...m });
      else out[i].isWritable = out[i].isWritable || m.isWritable;
    }
  }
  return out;
}
