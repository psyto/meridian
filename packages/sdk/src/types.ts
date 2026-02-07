import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

/**
 * Common types used across the Meridian SDK
 */

// KYC/AML Types
export enum KycLevel {
  Basic = 0,
  Standard = 1,
  Enhanced = 2,
  Institutional = 3,
}

export enum Jurisdiction {
  Japan = 0,
  Singapore = 1,
  HongKong = 2,
  Eu = 3,
  Usa = 4,
  Other = 5,
}

export interface WhitelistEntry {
  wallet: PublicKey;
  registry: PublicKey;
  kycLevel: KycLevel;
  jurisdiction: Jurisdiction;
  kycHash: Uint8Array;
  isActive: boolean;
  dailyLimit: BN;
  dailyVolume: BN;
  volumeResetTime: BN;
  verifiedAt: BN;
  expiryTimestamp: BN;
  lastActivity: BN;
}

// Oracle Types
export enum AssetType {
  Fiat = 0,
  Equity = 1,
  Rwa = 2,
  Crypto = 3,
  Index = 4,
}

export enum VolatilityRegime {
  VeryLow = 0,
  Low = 1,
  Normal = 2,
  High = 3,
  Extreme = 4,
}

export interface PriceFeed {
  authority: PublicKey;
  assetSymbol: string;
  assetType: AssetType;
  currentPrice: BN;
  confidence: BN;
  twapValue: BN;
  emaValue: BN;
  lastUpdateTime: BN;
  isActive: boolean;
}

export interface VolatilityIndex {
  authority: PublicKey;
  priceFeed: PublicKey;
  assetSymbol: string;
  realizedVolatility: BN;
  impliedVolatility: BN;
  regime: VolatilityRegime;
  meanReversionSignal: BN;
}

// Transaction Types
export interface TransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  timestamp: number;
}

// Market Data Types
export interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  midPrice: number;
  timestamp: number;
}

export interface Trade {
  id: string;
  market: PublicKey;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  timestamp: number;
  signature: string;
}

// Portfolio Types
export interface PortfolioPosition {
  asset: PublicKey;
  symbol: string;
  amount: BN;
  value: BN;
  costBasis: BN;
  unrealizedPnl: BN;
  unrealizedPnlPercent: number;
}

export interface PortfolioSummary {
  totalValue: BN;
  totalCost: BN;
  totalPnl: BN;
  totalPnlPercent: number;
  positions: PortfolioPosition[];
}
