import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import { MeridianClient } from './client';
import { BN } from '@coral-xyz/anchor';

/**
 * Shield Escrow SDK Module
 *
 * Handles escrow-based swaps with KYC compliance enforcement,
 * fee collection, and refund mechanisms for the Meridian platform.
 */

export enum SwapStatus {
  Pending = 0,
  Completed = 1,
  Refunded = 2,
}

export interface ShieldConfig {
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
}

export interface SwapReceipt {
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
}

/**
 * Shield Escrow SDK
 */
export class ShieldEscrowSdk {
  private client: MeridianClient;

  constructor(client: MeridianClient) {
    this.client = client;
  }

  // ---------------------------------------------------------------------------
  // PDA helpers
  // ---------------------------------------------------------------------------

  deriveShieldConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('shield_config')],
      this.client.programIds.shieldEscrow
    );
  }

  deriveEscrowAuthorityPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('escrow_authority')],
      this.client.programIds.shieldEscrow
    );
  }

  deriveSwapReceiptPda(trader: PublicKey, nonce: number): [PublicKey, number] {
    const nonceBuf = Buffer.alloc(4);
    nonceBuf.writeUInt32LE(nonce);
    return PublicKey.findProgramAddressSync(
      [Buffer.from('swap_receipt'), trader.toBuffer(), nonceBuf],
      this.client.programIds.shieldEscrow
    );
  }

  // ---------------------------------------------------------------------------
  // Query methods
  // ---------------------------------------------------------------------------

  /**
   * Get shield escrow configuration
   */
  async getShieldConfig(): Promise<ShieldConfig | null> {
    const [configPda] = this.deriveShieldConfigPda();

    try {
      const accountInfo = await this.client.connection.getAccountInfo(configPda);
      if (!accountInfo) return null;

      return this.deserializeShieldConfig(accountInfo.data as Buffer);
    } catch {
      return null;
    }
  }

  /**
   * Get swap receipt for a trader and nonce
   */
  async getSwapReceipt(trader: PublicKey, nonce: number): Promise<SwapReceipt | null> {
    const [receiptPda] = this.deriveSwapReceiptPda(trader, nonce);

    try {
      const accountInfo = await this.client.connection.getAccountInfo(receiptPda);
      if (!accountInfo) return null;

      return this.deserializeSwapReceipt(accountInfo.data as Buffer);
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Instruction builders
  // ---------------------------------------------------------------------------

  /**
   * Create initialize instruction
   */
  createInitializeInstruction(
    authority: PublicKey,
    params: {
      transferHookProgram: PublicKey;
      kycRegistry: PublicKey;
      feeBps: number;
      feeRecipient: PublicKey;
    }
  ): TransactionInstruction {
    const [configPda] = this.deriveShieldConfigPda();
    const [escrowAuthority] = this.deriveEscrowAuthorityPda();

    // 8 disc + 32 transferHookProgram + 32 kycRegistry + 2 feeBps + 32 feeRecipient
    const data = Buffer.alloc(8 + 32 + 32 + 2 + 32);
    let offset = 8;
    params.transferHookProgram.toBuffer().copy(data, offset); offset += 32;
    params.kycRegistry.toBuffer().copy(data, offset); offset += 32;
    data.writeUInt16LE(params.feeBps, offset); offset += 2;
    params.feeRecipient.toBuffer().copy(data, offset);

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: escrowAuthority, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.client.programIds.shieldEscrow,
      data,
    });
  }

  /**
   * Create deposit instruction
   */
  createDepositInstruction(
    trader: PublicKey,
    params: {
      amount: BN;
      nonce: number;
      inputMint: PublicKey;
      outputMint: PublicKey;
    }
  ): TransactionInstruction {
    const [configPda] = this.deriveShieldConfigPda();
    const [escrowAuthority] = this.deriveEscrowAuthorityPda();
    const [receiptPda] = this.deriveSwapReceiptPda(trader, params.nonce);

    // 8 disc + 8 amount + 4 nonce + 32 inputMint + 32 outputMint
    const data = Buffer.alloc(8 + 8 + 4 + 32 + 32);
    let offset = 8;
    data.set(params.amount.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
    data.writeUInt32LE(params.nonce, offset); offset += 4;
    params.inputMint.toBuffer().copy(data, offset); offset += 32;
    params.outputMint.toBuffer().copy(data, offset);

    return new TransactionInstruction({
      keys: [
        { pubkey: trader, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: escrowAuthority, isSigner: false, isWritable: false },
        { pubkey: receiptPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.client.programIds.shieldEscrow,
      data,
    });
  }

  /**
   * Create execute swap instruction
   */
  createExecuteSwapInstruction(
    authority: PublicKey,
    params: {
      trader: PublicKey;
      nonce: number;
      outputAmount: BN;
      minOutputAmount: BN;
    }
  ): TransactionInstruction {
    const [configPda] = this.deriveShieldConfigPda();
    const [escrowAuthority] = this.deriveEscrowAuthorityPda();
    const [receiptPda] = this.deriveSwapReceiptPda(params.trader, params.nonce);

    // 8 disc + 8 outputAmount + 8 minOutputAmount
    const data = Buffer.alloc(8 + 8 + 8);
    let offset = 8;
    data.set(params.outputAmount.toArrayLike(Buffer, 'le', 8), offset); offset += 8;
    data.set(params.minOutputAmount.toArrayLike(Buffer, 'le', 8), offset);

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: escrowAuthority, isSigner: false, isWritable: false },
        { pubkey: receiptPda, isSigner: false, isWritable: true },
        { pubkey: params.trader, isSigner: false, isWritable: true },
      ],
      programId: this.client.programIds.shieldEscrow,
      data,
    });
  }

  /**
   * Create withdraw instruction
   */
  createWithdrawInstruction(
    trader: PublicKey,
    params: { nonce: number }
  ): TransactionInstruction {
    const [configPda] = this.deriveShieldConfigPda();
    const [escrowAuthority] = this.deriveEscrowAuthorityPda();
    const [receiptPda] = this.deriveSwapReceiptPda(trader, params.nonce);

    // 8 disc + 4 nonce
    const data = Buffer.alloc(8 + 4);
    data.writeUInt32LE(params.nonce, 8);

    return new TransactionInstruction({
      keys: [
        { pubkey: trader, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: escrowAuthority, isSigner: false, isWritable: false },
        { pubkey: receiptPda, isSigner: false, isWritable: true },
      ],
      programId: this.client.programIds.shieldEscrow,
      data,
    });
  }

  /**
   * Create refund instruction
   */
  createRefundInstruction(
    authority: PublicKey,
    params: { trader: PublicKey; nonce: number }
  ): TransactionInstruction {
    const [configPda] = this.deriveShieldConfigPda();
    const [escrowAuthority] = this.deriveEscrowAuthorityPda();
    const [receiptPda] = this.deriveSwapReceiptPda(params.trader, params.nonce);

    const data = Buffer.alloc(8);

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: escrowAuthority, isSigner: false, isWritable: false },
        { pubkey: receiptPda, isSigner: false, isWritable: true },
        { pubkey: params.trader, isSigner: false, isWritable: true },
      ],
      programId: this.client.programIds.shieldEscrow,
      data,
    });
  }

  /**
   * Create update config instruction
   */
  createUpdateConfigInstruction(
    authority: PublicKey,
    params: {
      feeBps?: number;
      feeRecipient?: PublicKey;
      isActive?: boolean;
    }
  ): TransactionInstruction {
    const [configPda] = this.deriveShieldConfigPda();

    // 8 disc + Option<u16> (1+2) + Option<Pubkey> (1+32) + Option<bool> (1+1)
    const data = Buffer.alloc(8 + 3 + 33 + 2);
    let offset = 8;

    if (params.feeBps !== undefined) {
      data[offset] = 1; offset += 1;
      data.writeUInt16LE(params.feeBps, offset); offset += 2;
    } else {
      data[offset] = 0; offset += 3;
    }

    if (params.feeRecipient !== undefined) {
      data[offset] = 1; offset += 1;
      params.feeRecipient.toBuffer().copy(data, offset); offset += 32;
    } else {
      data[offset] = 0; offset += 33;
    }

    if (params.isActive !== undefined) {
      data[offset] = 1; offset += 1;
      data[offset] = params.isActive ? 1 : 0;
    } else {
      data[offset] = 0;
    }

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: true },
      ],
      programId: this.client.programIds.shieldEscrow,
      data,
    });
  }

  // ---------------------------------------------------------------------------
  // Deserialization
  // ---------------------------------------------------------------------------

  private deserializeShieldConfig(data: Buffer): ShieldConfig | null {
    try {
      let offset = 8; // skip discriminator

      const authority = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const transferHookProgram = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const kycRegistry = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const feeBps = data.readUInt16LE(offset);
      offset += 2;

      const feeRecipient = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const totalSwaps = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const totalVolume = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const totalFees = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const isActive = data[offset] === 1;
      offset += 1;

      const createdAt = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const updatedAt = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const bump = data[offset];

      return {
        authority,
        transferHookProgram,
        kycRegistry,
        feeBps,
        feeRecipient,
        totalSwaps,
        totalVolume,
        totalFees,
        isActive,
        createdAt,
        updatedAt,
        bump,
      };
    } catch {
      return null;
    }
  }

  private deserializeSwapReceipt(data: Buffer): SwapReceipt | null {
    try {
      let offset = 8; // skip discriminator

      const trader = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const nonce = data.readUInt32LE(offset);
      offset += 4;

      const inputMint = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const outputMint = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const inputAmount = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const outputAmount = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const fee = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const status = data[offset] as SwapStatus;
      offset += 1;

      const createdAt = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const completedAt = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const bump = data[offset];

      return {
        trader,
        nonce,
        inputMint,
        outputMint,
        inputAmount,
        outputAmount,
        fee,
        status,
        createdAt,
        completedAt,
        bump,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Create Shield Escrow SDK instance
 */
export function createShieldEscrowSdk(client: MeridianClient): ShieldEscrowSdk {
  return new ShieldEscrowSdk(client);
}
