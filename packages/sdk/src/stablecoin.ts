import {
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { MeridianClient } from './client';
import { BN } from '@coral-xyz/anchor';

/**
 * Stablecoin SDK Module
 *
 * Handles minting, burning, and transferring stablecoin tokens
 * with KYC/AML compliance via transfer hooks.
 */

export interface MintConfig {
  authority: PublicKey;
  mint: PublicKey;
  transferHookProgram: PublicKey;
  totalSupply: BN;
  totalCollateral: BN;
  collateralRatioBps: BN;
  isPaused: boolean;
  freezeAuthority: PublicKey | null;
  priceOracle: PublicKey | null;
  lastAudit: BN;
  createdAt: BN;
  updatedAt: BN;
  bump: number;
}

export interface Issuer {
  authority: PublicKey;
  mintConfig: PublicKey;
  issuerType: IssuerType;
  dailyMintLimit: BN;
  dailyBurnLimit: BN;
  dailyMinted: BN;
  dailyBurned: BN;
  lastDailyReset: BN;
  totalMinted: BN;
  totalBurned: BN;
  isActive: boolean;
  registeredAt: BN;
  bump: number;
}

export enum IssuerType {
  TrustBank = 0,
  Distributor = 1,
  Exchange = 2,
  ApiPartner = 3,
}

export interface MintRequest {
  amount: BN;
  reference: Uint8Array;
}

export interface BurnRequest {
  amount: BN;
  redemptionInfo: Uint8Array;
}

export interface TransferRequest {
  amount: BN;
  memo?: Uint8Array;
}

/**
 * Stablecoin SDK
 */
export class StablecoinSdk {
  private client: MeridianClient;

  constructor(client: MeridianClient) {
    this.client = client;
  }

  /**
   * Get mint configuration
   */
  async getMintConfig(): Promise<MintConfig | null> {
    const [mintConfigPda] = this.client.deriveMintConfigPda();

    try {
      const accountInfo = await this.client.connection.getAccountInfo(mintConfigPda);
      if (!accountInfo) return null;

      return this.deserializeMintConfig(accountInfo.data as Buffer);
    } catch {
      return null;
    }
  }

  /**
   * Get issuer information
   */
  async getIssuer(authority: PublicKey): Promise<Issuer | null> {
    const [issuerPda] = this.client.deriveIssuerPda(authority);

    try {
      const accountInfo = await this.client.connection.getAccountInfo(issuerPda);
      if (!accountInfo) return null;

      return this.deserializeIssuer(accountInfo.data as Buffer);
    } catch {
      return null;
    }
  }

  /**
   * Get stablecoin token balance for an address
   */
  async getBalance(owner: PublicKey, mint: PublicKey): Promise<BN> {
    try {
      const ata = getAssociatedTokenAddressSync(
        mint,
        owner,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const accountInfo = await this.client.connection.getTokenAccountBalance(ata);
      return new BN(accountInfo.value.amount);
    } catch {
      return new BN(0);
    }
  }

  /**
   * Get total supply of stablecoin tokens
   */
  async getTotalSupply(mint: PublicKey): Promise<BN> {
    try {
      const mintInfo = await this.client.connection.getTokenSupply(mint);
      return new BN(mintInfo.value.amount);
    } catch {
      return new BN(0);
    }
  }

  /**
   * Create mint instruction
   */
  createMintInstruction(
    issuerAuthority: PublicKey,
    _recipient: PublicKey,
    _params: MintRequest
  ): TransactionInstruction {
    const [mintConfigPda] = this.client.deriveMintConfigPda();
    const [issuerPda] = this.client.deriveIssuerPda(issuerAuthority);

    // Build instruction data
    const data = Buffer.alloc(8 + 8 + 32);
    // discriminator + amount + reference
    // In production, use Anchor's instruction builder

    return new TransactionInstruction({
      keys: [
        { pubkey: issuerAuthority, isSigner: true, isWritable: true },
        { pubkey: mintConfigPda, isSigner: false, isWritable: true },
        { pubkey: issuerPda, isSigner: false, isWritable: true },
        // Additional accounts...
      ],
      programId: this.client.programIds.stablecoinMint,
      data,
    });
  }

  /**
   * Create burn instruction
   */
  createBurnInstruction(
    holder: PublicKey,
    _params: BurnRequest
  ): TransactionInstruction {
    const [mintConfigPda] = this.client.deriveMintConfigPda();

    const data = Buffer.alloc(8 + 8 + 64);

    return new TransactionInstruction({
      keys: [
        { pubkey: holder, isSigner: true, isWritable: true },
        { pubkey: mintConfigPda, isSigner: false, isWritable: true },
        // Additional accounts...
      ],
      programId: this.client.programIds.stablecoinMint,
      data,
    });
  }

  /**
   * Create transfer instruction with compliance check
   */
  createTransferInstruction(
    sender: PublicKey,
    recipient: PublicKey,
    _params: TransferRequest
  ): TransactionInstruction {
    const [mintConfigPda] = this.client.deriveMintConfigPda();

    // Get extra account metas for transfer hook
    // In production, fetch these from the extra_account_meta_list PDA

    const data = Buffer.alloc(8 + 8 + 33);

    return new TransactionInstruction({
      keys: [
        { pubkey: sender, isSigner: true, isWritable: true },
        { pubkey: mintConfigPda, isSigner: false, isWritable: false },
        { pubkey: recipient, isSigner: false, isWritable: true },
        // Transfer hook accounts...
      ],
      programId: this.client.programIds.stablecoinMint,
      data,
    });
  }

  private deserializeMintConfig(data: Buffer): MintConfig | null {
    try {
      let offset = 8; // skip discriminator

      const authority = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const mint = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const transferHookProgram = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const totalSupply = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const totalCollateral = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const collateralRatioBps = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const isPaused = data[offset] === 1;
      offset += 1;

      // Option<Pubkey>
      const hasFreezeAuthority = data[offset] === 1;
      offset += 1;
      const freezeAuthority = hasFreezeAuthority
        ? new PublicKey(data.subarray(offset, offset + 32))
        : null;
      offset += 32;

      const hasPriceOracle = data[offset] === 1;
      offset += 1;
      const priceOracle = hasPriceOracle
        ? new PublicKey(data.subarray(offset, offset + 32))
        : null;
      offset += 32;

      const lastAudit = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const createdAt = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const updatedAt = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const bump = data[offset];

      return {
        authority,
        mint,
        transferHookProgram,
        totalSupply,
        totalCollateral,
        collateralRatioBps,
        isPaused,
        freezeAuthority,
        priceOracle,
        lastAudit,
        createdAt,
        updatedAt,
        bump,
      };
    } catch {
      return null;
    }
  }

  private deserializeIssuer(data: Buffer): Issuer | null {
    try {
      let offset = 8; // skip discriminator

      const authority = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const mintConfig = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const issuerType = data[offset] as IssuerType;
      offset += 1;

      const dailyMintLimit = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const dailyBurnLimit = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const dailyMinted = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const dailyBurned = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const lastDailyReset = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const totalMinted = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const totalBurned = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const isActive = data[offset] === 1;
      offset += 1;

      const registeredAt = new BN(data.subarray(offset, offset + 8), 'le');
      offset += 8;

      const bump = data[offset];

      return {
        authority,
        mintConfig,
        issuerType,
        dailyMintLimit,
        dailyBurnLimit,
        dailyMinted,
        dailyBurned,
        lastDailyReset,
        totalMinted,
        totalBurned,
        isActive,
        registeredAt,
        bump,
      };
    } catch {
      return null;
    }
  }

  /**
   * Format stablecoin amount for display (2 decimals)
   */
  formatAmount(amount: BN): string {
    const str = amount.toString().padStart(3, '0');
    const intPart = str.slice(0, -2) || '0';
    const decPart = str.slice(-2);
    return `¥${parseInt(intPart).toLocaleString()}.${decPart}`;
  }

  /**
   * Parse stablecoin amount from string (e.g., "1234.56" -> 123456)
   */
  parseAmount(amountStr: string): BN {
    const parts = amountStr.replace(/[¥,]/g, '').split('.');
    const intPart = parts[0] || '0';
    const decPart = (parts[1] || '00').padEnd(2, '0').slice(0, 2);
    return new BN(intPart + decPart);
  }
}

/**
 * Create Stablecoin SDK instance
 */
export function createStablecoinSdk(client: MeridianClient): StablecoinSdk {
  return new StablecoinSdk(client);
}
