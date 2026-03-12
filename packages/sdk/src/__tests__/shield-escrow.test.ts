import { describe, it, expect, vi } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { MeridianClient, DEFAULT_PROGRAM_IDS } from '../client';
import { ShieldEscrowSdk, SwapStatus } from '../shield-escrow';

function makeSdk(getAccountInfoMock?: ReturnType<typeof vi.fn>) {
  const connection = {
    commitment: 'confirmed',
    getAccountInfo: getAccountInfoMock ?? vi.fn().mockResolvedValue(null),
  } as unknown as Connection;
  const client = new MeridianClient({ connection });
  return new ShieldEscrowSdk(client);
}

function serializeShieldConfig(fields: {
  authority: PublicKey;
  transferHookProgram: PublicKey;
  kycRegistry: PublicKey;
  feeBps: number;
  feeRecipient: PublicKey;
  totalSwaps: BN;
  totalVolume: BN;
  totalFees: BN;
  isActive: boolean;
  createdAt: BN;
  updatedAt: BN;
  bump: number;
}): Buffer {
  // 8 disc + 32*4 pubkeys + 2 feeBps + 8*3 u64 + 1 bool + 8*2 i64 + 1 bump
  const buf = Buffer.alloc(8 + 32 * 4 + 2 + 8 * 3 + 1 + 8 * 2 + 1);
  let offset = 8;

  fields.authority.toBuffer().copy(buf, offset); offset += 32;
  fields.transferHookProgram.toBuffer().copy(buf, offset); offset += 32;
  fields.kycRegistry.toBuffer().copy(buf, offset); offset += 32;
  buf.writeUInt16LE(fields.feeBps, offset); offset += 2;
  fields.feeRecipient.toBuffer().copy(buf, offset); offset += 32;
  buf.set(fields.totalSwaps.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.totalVolume.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.totalFees.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf[offset] = fields.isActive ? 1 : 0; offset += 1;
  buf.set(fields.createdAt.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.updatedAt.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf[offset] = fields.bump;

  return buf;
}

function serializeSwapReceipt(fields: {
  trader: PublicKey;
  nonce: number;
  inputMint: PublicKey;
  outputMint: PublicKey;
  inputAmount: BN;
  outputAmount: BN;
  fee: BN;
  status: SwapStatus;
  createdAt: BN;
  completedAt: BN;
  bump: number;
}): Buffer {
  // 8 disc + 32 trader + 4 nonce + 32*2 mints + 8*3 amounts + 1 status + 8*2 timestamps + 1 bump
  const buf = Buffer.alloc(8 + 32 + 4 + 32 * 2 + 8 * 3 + 1 + 8 * 2 + 1);
  let offset = 8;

  fields.trader.toBuffer().copy(buf, offset); offset += 32;
  buf.writeUInt32LE(fields.nonce, offset); offset += 4;
  fields.inputMint.toBuffer().copy(buf, offset); offset += 32;
  fields.outputMint.toBuffer().copy(buf, offset); offset += 32;
  buf.set(fields.inputAmount.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.outputAmount.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.fee.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf[offset] = fields.status; offset += 1;
  buf.set(fields.createdAt.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf.set(fields.completedAt.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
  buf[offset] = fields.bump;

  return buf;
}

describe('ShieldEscrowSdk', () => {
  describe('PDA derivation', () => {
    it('derives shield config PDA deterministically', () => {
      const sdk = makeSdk();
      const [pda1, bump1] = sdk.deriveShieldConfigPda();
      const [pda2, bump2] = sdk.deriveShieldConfigPda();

      expect(pda1.equals(pda2)).toBe(true);
      expect(bump1).toBe(bump2);
    });

    it('derives escrow authority PDA deterministically', () => {
      const sdk = makeSdk();
      const [pda1, bump1] = sdk.deriveEscrowAuthorityPda();
      const [pda2, bump2] = sdk.deriveEscrowAuthorityPda();

      expect(pda1.equals(pda2)).toBe(true);
      expect(bump1).toBe(bump2);
    });

    it('derives swap receipt PDA from trader and nonce', () => {
      const sdk = makeSdk();
      const trader = PublicKey.unique();

      const [pda1] = sdk.deriveSwapReceiptPda(trader, 0);
      const [pda2] = sdk.deriveSwapReceiptPda(trader, 1);
      const [pda3] = sdk.deriveSwapReceiptPda(trader, 0);

      // Different nonces yield different PDAs
      expect(pda1.equals(pda2)).toBe(false);
      // Same inputs yield same PDA
      expect(pda1.equals(pda3)).toBe(true);
    });

    it('derives different swap receipt PDAs for different traders', () => {
      const sdk = makeSdk();
      const trader1 = PublicKey.unique();
      const trader2 = PublicKey.unique();

      const [pda1] = sdk.deriveSwapReceiptPda(trader1, 0);
      const [pda2] = sdk.deriveSwapReceiptPda(trader2, 0);

      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('getShieldConfig', () => {
    it('deserializes a ShieldConfig buffer', async () => {
      const fields = {
        authority: PublicKey.unique(),
        transferHookProgram: PublicKey.unique(),
        kycRegistry: PublicKey.unique(),
        feeBps: 30,
        feeRecipient: PublicKey.unique(),
        totalSwaps: new BN(1500),
        totalVolume: new BN(75_000_000),
        totalFees: new BN(225_000),
        isActive: true,
        createdAt: new BN(1700000000),
        updatedAt: new BN(1700500000),
        bump: 252,
      };

      const data = serializeShieldConfig(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.getShieldConfig();

      expect(result).not.toBeNull();
      expect(result!.authority.equals(fields.authority)).toBe(true);
      expect(result!.transferHookProgram.equals(fields.transferHookProgram)).toBe(true);
      expect(result!.kycRegistry.equals(fields.kycRegistry)).toBe(true);
      expect(result!.feeBps).toBe(30);
      expect(result!.feeRecipient.equals(fields.feeRecipient)).toBe(true);
      expect(result!.totalSwaps.eq(fields.totalSwaps)).toBe(true);
      expect(result!.totalVolume.eq(fields.totalVolume)).toBe(true);
      expect(result!.totalFees.eq(fields.totalFees)).toBe(true);
      expect(result!.isActive).toBe(true);
      expect(result!.createdAt.eq(fields.createdAt)).toBe(true);
      expect(result!.updatedAt.eq(fields.updatedAt)).toBe(true);
      expect(result!.bump).toBe(252);
    });

    it('returns null when account does not exist', async () => {
      const mock = vi.fn().mockResolvedValue(null);
      const sdk = makeSdk(mock);

      const result = await sdk.getShieldConfig();
      expect(result).toBeNull();
    });
  });

  describe('getSwapReceipt', () => {
    it('deserializes a SwapReceipt buffer', async () => {
      const fields = {
        trader: PublicKey.unique(),
        nonce: 42,
        inputMint: PublicKey.unique(),
        outputMint: PublicKey.unique(),
        inputAmount: new BN(1_000_000),
        outputAmount: new BN(950_000),
        fee: new BN(3_000),
        status: SwapStatus.Completed,
        createdAt: new BN(1700000000),
        completedAt: new BN(1700000060),
        bump: 250,
      };

      const data = serializeSwapReceipt(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.getSwapReceipt(fields.trader, fields.nonce);

      expect(result).not.toBeNull();
      expect(result!.trader.equals(fields.trader)).toBe(true);
      expect(result!.nonce).toBe(42);
      expect(result!.inputMint.equals(fields.inputMint)).toBe(true);
      expect(result!.outputMint.equals(fields.outputMint)).toBe(true);
      expect(result!.inputAmount.eq(fields.inputAmount)).toBe(true);
      expect(result!.outputAmount.eq(fields.outputAmount)).toBe(true);
      expect(result!.fee.eq(fields.fee)).toBe(true);
      expect(result!.status).toBe(SwapStatus.Completed);
      expect(result!.createdAt.eq(fields.createdAt)).toBe(true);
      expect(result!.completedAt.eq(fields.completedAt)).toBe(true);
      expect(result!.bump).toBe(250);
    });

    it('deserializes a pending swap receipt', async () => {
      const fields = {
        trader: PublicKey.unique(),
        nonce: 0,
        inputMint: PublicKey.unique(),
        outputMint: PublicKey.unique(),
        inputAmount: new BN(500_000),
        outputAmount: new BN(0),
        fee: new BN(0),
        status: SwapStatus.Pending,
        createdAt: new BN(1700000000),
        completedAt: new BN(0),
        bump: 251,
      };

      const data = serializeSwapReceipt(fields);
      const mock = vi.fn().mockResolvedValue({ data });
      const sdk = makeSdk(mock);

      const result = await sdk.getSwapReceipt(fields.trader, fields.nonce);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(SwapStatus.Pending);
      expect(result!.outputAmount.isZero()).toBe(true);
    });

    it('returns null when account does not exist', async () => {
      const mock = vi.fn().mockResolvedValue(null);
      const sdk = makeSdk(mock);

      const result = await sdk.getSwapReceipt(PublicKey.unique(), 0);
      expect(result).toBeNull();
    });
  });

  describe('createInitializeInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createInitializeInstruction(authority, {
        transferHookProgram: PublicKey.unique(),
        kycRegistry: PublicKey.unique(),
        feeBps: 30,
        feeRecipient: PublicKey.unique(),
      });

      expect(ix.programId.equals(DEFAULT_PROGRAM_IDS.shieldEscrow)).toBe(true);
    });

    it('includes authority as a signer', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createInitializeInstruction(authority, {
        transferHookProgram: PublicKey.unique(),
        kycRegistry: PublicKey.unique(),
        feeBps: 30,
        feeRecipient: PublicKey.unique(),
      });

      const authorityKey = ix.keys.find((k) => k.pubkey.equals(authority));
      expect(authorityKey).toBeDefined();
      expect(authorityKey!.isSigner).toBe(true);
    });

    it('includes shield config PDA as writable', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createInitializeInstruction(authority, {
        transferHookProgram: PublicKey.unique(),
        kycRegistry: PublicKey.unique(),
        feeBps: 30,
        feeRecipient: PublicKey.unique(),
      });

      const [expectedConfigPda] = sdk.deriveShieldConfigPda();
      const configKey = ix.keys.find((k) => k.pubkey.equals(expectedConfigPda));
      expect(configKey).toBeDefined();
      expect(configKey!.isWritable).toBe(true);
    });
  });

  describe('createDepositInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const trader = PublicKey.unique();

      const ix = sdk.createDepositInstruction(trader, {
        amount: new BN(1_000_000),
        nonce: 0,
        inputMint: PublicKey.unique(),
        outputMint: PublicKey.unique(),
      });

      expect(ix.programId.equals(DEFAULT_PROGRAM_IDS.shieldEscrow)).toBe(true);
    });

    it('includes trader as a signer', () => {
      const sdk = makeSdk();
      const trader = PublicKey.unique();

      const ix = sdk.createDepositInstruction(trader, {
        amount: new BN(1_000_000),
        nonce: 0,
        inputMint: PublicKey.unique(),
        outputMint: PublicKey.unique(),
      });

      const traderKey = ix.keys.find((k) => k.pubkey.equals(trader));
      expect(traderKey).toBeDefined();
      expect(traderKey!.isSigner).toBe(true);
    });

    it('includes swap receipt PDA as writable', () => {
      const sdk = makeSdk();
      const trader = PublicKey.unique();
      const nonce = 5;

      const ix = sdk.createDepositInstruction(trader, {
        amount: new BN(1_000_000),
        nonce,
        inputMint: PublicKey.unique(),
        outputMint: PublicKey.unique(),
      });

      const [expectedReceiptPda] = sdk.deriveSwapReceiptPda(trader, nonce);
      const receiptKey = ix.keys.find((k) => k.pubkey.equals(expectedReceiptPda));
      expect(receiptKey).toBeDefined();
      expect(receiptKey!.isWritable).toBe(true);
    });
  });

  describe('createExecuteSwapInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createExecuteSwapInstruction(authority, {
        trader: PublicKey.unique(),
        nonce: 0,
        outputAmount: new BN(950_000),
        minOutputAmount: new BN(900_000),
      });

      expect(ix.programId.equals(DEFAULT_PROGRAM_IDS.shieldEscrow)).toBe(true);
    });

    it('includes authority as a signer and trader as writable', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();
      const trader = PublicKey.unique();

      const ix = sdk.createExecuteSwapInstruction(authority, {
        trader,
        nonce: 0,
        outputAmount: new BN(950_000),
        minOutputAmount: new BN(900_000),
      });

      const authorityKey = ix.keys.find((k) => k.pubkey.equals(authority));
      expect(authorityKey).toBeDefined();
      expect(authorityKey!.isSigner).toBe(true);

      const traderKey = ix.keys.find((k) => k.pubkey.equals(trader));
      expect(traderKey).toBeDefined();
      expect(traderKey!.isWritable).toBe(true);
    });
  });

  describe('createWithdrawInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const trader = PublicKey.unique();

      const ix = sdk.createWithdrawInstruction(trader, { nonce: 0 });

      expect(ix.programId.equals(DEFAULT_PROGRAM_IDS.shieldEscrow)).toBe(true);
    });

    it('includes trader as a signer', () => {
      const sdk = makeSdk();
      const trader = PublicKey.unique();

      const ix = sdk.createWithdrawInstruction(trader, { nonce: 0 });

      const traderKey = ix.keys.find((k) => k.pubkey.equals(trader));
      expect(traderKey).toBeDefined();
      expect(traderKey!.isSigner).toBe(true);
    });
  });

  describe('createRefundInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createRefundInstruction(authority, {
        trader: PublicKey.unique(),
        nonce: 0,
      });

      expect(ix.programId.equals(DEFAULT_PROGRAM_IDS.shieldEscrow)).toBe(true);
    });

    it('includes authority as a signer and trader as writable', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();
      const trader = PublicKey.unique();

      const ix = sdk.createRefundInstruction(authority, { trader, nonce: 0 });

      const authorityKey = ix.keys.find((k) => k.pubkey.equals(authority));
      expect(authorityKey).toBeDefined();
      expect(authorityKey!.isSigner).toBe(true);

      const traderKey = ix.keys.find((k) => k.pubkey.equals(trader));
      expect(traderKey).toBeDefined();
      expect(traderKey!.isWritable).toBe(true);
    });
  });

  describe('createUpdateConfigInstruction', () => {
    it('returns a TransactionInstruction with correct programId', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createUpdateConfigInstruction(authority, { feeBps: 50 });

      expect(ix.programId.equals(DEFAULT_PROGRAM_IDS.shieldEscrow)).toBe(true);
    });

    it('includes authority as a signer', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createUpdateConfigInstruction(authority, { isActive: false });

      const authorityKey = ix.keys.find((k) => k.pubkey.equals(authority));
      expect(authorityKey).toBeDefined();
      expect(authorityKey!.isSigner).toBe(true);
    });

    it('includes config PDA as writable', () => {
      const sdk = makeSdk();
      const authority = PublicKey.unique();

      const ix = sdk.createUpdateConfigInstruction(authority, { feeBps: 25 });

      const [expectedConfigPda] = sdk.deriveShieldConfigPda();
      const configKey = ix.keys.find((k) => k.pubkey.equals(expectedConfigPda));
      expect(configKey).toBeDefined();
      expect(configKey!.isWritable).toBe(true);
    });
  });
});
