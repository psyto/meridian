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

      // Deserialize account data (simplified - would use Anchor's coder in production)
      // This is a placeholder for actual deserialization
      return null;
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

      // Deserialize account data
      return null;
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
