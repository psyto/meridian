import { describe, it, expect } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { MeridianClient, DEFAULT_PROGRAM_IDS } from '../client';

function makeClient(overrides?: { programIds?: Partial<typeof DEFAULT_PROGRAM_IDS>; wallet?: any }) {
  return new MeridianClient({
    connection: { commitment: 'confirmed' } as unknown as Connection,
    ...overrides,
  });
}

describe('MeridianClient', () => {
  describe('constructor', () => {
    it('uses default program IDs when none provided', () => {
      const client = makeClient();
      expect(client.programIds.stablecoinMint.equals(DEFAULT_PROGRAM_IDS.stablecoinMint)).toBe(true);
      expect(client.programIds.securitiesEngine.equals(DEFAULT_PROGRAM_IDS.securitiesEngine)).toBe(true);
      expect(client.programIds.rwaRegistry.equals(DEFAULT_PROGRAM_IDS.rwaRegistry)).toBe(true);
      expect(client.programIds.oracle.equals(DEFAULT_PROGRAM_IDS.oracle)).toBe(true);
      expect(client.programIds.transferHook.equals(DEFAULT_PROGRAM_IDS.transferHook)).toBe(true);
    });

    it('merges custom program IDs with defaults', () => {
      const customMint = PublicKey.unique();
      const client = makeClient({ programIds: { stablecoinMint: customMint } });

      expect(client.programIds.stablecoinMint.equals(customMint)).toBe(true);
      // Others remain default
      expect(client.programIds.securitiesEngine.equals(DEFAULT_PROGRAM_IDS.securitiesEngine)).toBe(true);
    });
  });

  describe('getProvider', () => {
    it('returns undefined when no wallet provided', () => {
      const client = makeClient();
      expect(client.getProvider()).toBeUndefined();
    });
  });

  describe('deriveMintConfigPda', () => {
    it('returns a [PublicKey, number] tuple', () => {
      const client = makeClient();
      const [pda, bump] = client.deriveMintConfigPda();

      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    it('is deterministic', () => {
      const client = makeClient();
      const [pda1, bump1] = client.deriveMintConfigPda();
      const [pda2, bump2] = client.deriveMintConfigPda();

      expect(pda1.equals(pda2)).toBe(true);
      expect(bump1).toBe(bump2);
    });
  });

  describe('deriveIssuerPda', () => {
    it('returns a deterministic PDA for a given authority', () => {
      const client = makeClient();
      const authority = PublicKey.unique();
      const [pda1, bump1] = client.deriveIssuerPda(authority);
      const [pda2, bump2] = client.deriveIssuerPda(authority);

      expect(pda1.equals(pda2)).toBe(true);
      expect(bump1).toBe(bump2);
    });

    it('produces different PDAs for different authorities', () => {
      const client = makeClient();
      const [pda1] = client.deriveIssuerPda(PublicKey.unique());
      const [pda2] = client.deriveIssuerPda(PublicKey.unique());

      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('deriveCollateralVaultPda', () => {
    it('returns a deterministic PDA', () => {
      const client = makeClient();
      const mintConfig = PublicKey.unique();
      const [pda1] = client.deriveCollateralVaultPda(mintConfig);
      const [pda2] = client.deriveCollateralVaultPda(mintConfig);

      expect(pda1.equals(pda2)).toBe(true);
    });

    it('produces different PDAs for different mint configs', () => {
      const client = makeClient();
      const [pda1] = client.deriveCollateralVaultPda(PublicKey.unique());
      const [pda2] = client.deriveCollateralVaultPda(PublicKey.unique());

      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('deriveKycRegistryPda', () => {
    it('returns a deterministic PDA', () => {
      const client = makeClient();
      const mint = PublicKey.unique();
      const [pda1] = client.deriveKycRegistryPda(mint);
      const [pda2] = client.deriveKycRegistryPda(mint);

      expect(pda1.equals(pda2)).toBe(true);
    });

    it('uses the transferHook program ID', () => {
      const customHook = PublicKey.unique();
      const client = makeClient({ programIds: { transferHook: customHook } });
      const mint = PublicKey.unique();

      // PDA derived with custom hook should differ from default
      const defaultClient = makeClient();
      const [pda1] = client.deriveKycRegistryPda(mint);
      const [pda2] = defaultClient.deriveKycRegistryPda(mint);

      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('deriveWhitelistEntryPda', () => {
    it('returns a deterministic PDA', () => {
      const client = makeClient();
      const wallet = PublicKey.unique();
      const [pda1] = client.deriveWhitelistEntryPda(wallet);
      const [pda2] = client.deriveWhitelistEntryPda(wallet);

      expect(pda1.equals(pda2)).toBe(true);
    });

    it('produces different PDAs for different wallets', () => {
      const client = makeClient();
      const [pda1] = client.deriveWhitelistEntryPda(PublicKey.unique());
      const [pda2] = client.deriveWhitelistEntryPda(PublicKey.unique());

      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('deriveMarketPda', () => {
    it('returns a deterministic PDA for given mints', () => {
      const client = makeClient();
      const securityMint = PublicKey.unique();
      const quoteMint = PublicKey.unique();

      const [pda1] = client.deriveMarketPda(securityMint, quoteMint);
      const [pda2] = client.deriveMarketPda(securityMint, quoteMint);

      expect(pda1.equals(pda2)).toBe(true);
    });

    it('produces different PDAs for different mint pairs', () => {
      const client = makeClient();
      const [pda1] = client.deriveMarketPda(PublicKey.unique(), PublicKey.unique());
      const [pda2] = client.deriveMarketPda(PublicKey.unique(), PublicKey.unique());

      expect(pda1.equals(pda2)).toBe(false);
    });

    it('is sensitive to mint ordering', () => {
      const client = makeClient();
      const mintA = PublicKey.unique();
      const mintB = PublicKey.unique();

      const [pda1] = client.deriveMarketPda(mintA, mintB);
      const [pda2] = client.deriveMarketPda(mintB, mintA);

      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('derivePoolPda', () => {
    it('returns a deterministic PDA', () => {
      const client = makeClient();
      const market = PublicKey.unique();
      const [pda1] = client.derivePoolPda(market);
      const [pda2] = client.derivePoolPda(market);

      expect(pda1.equals(pda2)).toBe(true);
    });

    it('produces different PDAs for different markets', () => {
      const client = makeClient();
      const [pda1] = client.derivePoolPda(PublicKey.unique());
      const [pda2] = client.derivePoolPda(PublicKey.unique());

      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('deriveRwaAssetPda', () => {
    it('returns a deterministic PDA for a given symbol', () => {
      const client = makeClient();
      const [pda1] = client.deriveRwaAssetPda('TOKYU');
      const [pda2] = client.deriveRwaAssetPda('TOKYU');

      expect(pda1.equals(pda2)).toBe(true);
    });

    it('produces different PDAs for different symbols', () => {
      const client = makeClient();
      const [pda1] = client.deriveRwaAssetPda('TOKYU');
      const [pda2] = client.deriveRwaAssetPda('MITSUI');

      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('derivePriceFeedPda', () => {
    it('returns a deterministic PDA for a given symbol', () => {
      const client = makeClient();
      const [pda1] = client.derivePriceFeedPda('BTC/JPY');
      const [pda2] = client.derivePriceFeedPda('BTC/JPY');

      expect(pda1.equals(pda2)).toBe(true);
    });

    it('produces different PDAs for different symbols', () => {
      const client = makeClient();
      const [pda1] = client.derivePriceFeedPda('BTC/JPY');
      const [pda2] = client.derivePriceFeedPda('ETH/JPY');

      expect(pda1.equals(pda2)).toBe(false);
    });

    it('uses the oracle program ID', () => {
      const customOracle = PublicKey.unique();
      const client = makeClient({ programIds: { oracle: customOracle } });
      const defaultClient = makeClient();

      const [pda1] = client.derivePriceFeedPda('BTC/JPY');
      const [pda2] = defaultClient.derivePriceFeedPda('BTC/JPY');

      expect(pda1.equals(pda2)).toBe(false);
    });
  });
});
