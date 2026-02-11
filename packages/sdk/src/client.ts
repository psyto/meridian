import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';

export interface MeridianConfig {
  connection: Connection;
  wallet?: Wallet;
  programIds?: {
    stablecoinMint?: PublicKey;
    transferHook?: PublicKey;
    securitiesEngine?: PublicKey;
    rwaRegistry?: PublicKey;
    oracle?: PublicKey;
  };
}

export const DEFAULT_PROGRAM_IDS = {
  stablecoinMint: new PublicKey('EjzAJTrJMjJKUeC13GwXWbfQJGUdKDAyJkwVdyhmgUEH'),
  transferHook: new PublicKey('AEDwQMQbLnpwQzkwCfNCkMn3zTAyTvqT23S7jy6Ft3r9'),
  securitiesEngine: new PublicKey('3iA5QKAovwfLENEiSCQJc1HNmCGGKAQg7ruMb428jNB7'),
  rwaRegistry: new PublicKey('GotJsPzK1B7Q95G1fpL4CX9L3aE1gnqbCSG8D4qJm7ax'),
  oracle: new PublicKey('E5df5JndQUdp34zJWnAwaj7YQTJeZYErtLuyZonLKzH7'),
};

/**
 * Main Meridian SDK Client
 */
export class MeridianClient {
  public readonly connection: Connection;
  public readonly wallet?: Wallet;
  public readonly programIds: typeof DEFAULT_PROGRAM_IDS;
  private provider?: AnchorProvider;

  constructor(config: MeridianConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.programIds = {
      ...DEFAULT_PROGRAM_IDS,
      ...config.programIds,
    };

    if (this.wallet) {
      this.provider = new AnchorProvider(
        this.connection,
        this.wallet,
        { commitment: 'confirmed' }
      );
    }
  }

  /**
   * Get the Anchor provider
   */
  getProvider(): AnchorProvider | undefined {
    return this.provider;
  }

  /**
   * Get the current slot
   */
  async getSlot(): Promise<number> {
    return this.connection.getSlot();
  }

  /**
   * Get account balance in SOL
   */
  async getBalance(address: PublicKey): Promise<number> {
    const balance = await this.connection.getBalance(address);
    return balance / 1e9;
  }

  /**
   * Derive PDA for mint config
   */
  deriveMintConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('mint_config')],
      this.programIds.stablecoinMint
    );
  }

  /**
   * Derive PDA for issuer
   */
  deriveIssuerPda(authority: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('issuer'), authority.toBuffer()],
      this.programIds.stablecoinMint
    );
  }

  /**
   * Derive PDA for collateral vault
   */
  deriveCollateralVaultPda(mintConfig: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('collateral_vault'), mintConfig.toBuffer()],
      this.programIds.stablecoinMint
    );
  }

  /**
   * Derive PDA for KYC registry
   */
  deriveKycRegistryPda(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('kyc_registry'), mint.toBuffer()],
      this.programIds.transferHook
    );
  }

  /**
   * Derive PDA for whitelist entry
   */
  deriveWhitelistEntryPda(wallet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('whitelist'), wallet.toBuffer()],
      this.programIds.transferHook
    );
  }

  /**
   * Derive PDA for market
   */
  deriveMarketPda(securityMint: PublicKey, quoteMint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('market'), securityMint.toBuffer(), quoteMint.toBuffer()],
      this.programIds.securitiesEngine
    );
  }

  /**
   * Derive PDA for pool
   */
  derivePoolPda(market: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), market.toBuffer()],
      this.programIds.securitiesEngine
    );
  }

  /**
   * Derive PDA for RWA asset
   */
  deriveRwaAssetPda(symbol: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('asset'), Buffer.from(symbol)],
      this.programIds.rwaRegistry
    );
  }

  /**
   * Derive PDA for price feed
   */
  derivePriceFeedPda(assetSymbol: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('price_feed'), Buffer.from(assetSymbol)],
      this.programIds.oracle
    );
  }
}

/**
 * Create a new Meridian client
 */
export function createMeridianClient(config: MeridianConfig): MeridianClient {
  return new MeridianClient(config);
}
