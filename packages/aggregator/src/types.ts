import { PublicKey } from '@solana/web3.js';

export interface AggregatorConfig {
  /** Jupiter API base URL */
  apiBaseUrl?: string;
  /** Default slippage in basis points (e.g., 50 = 0.5%) */
  defaultSlippageBps?: number;
  /** Maximum number of routes to consider */
  maxRoutes?: number;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

export interface QuoteRequest {
  inputMint: PublicKey | string;
  outputMint: PublicKey | string;
  amount: string;
  slippageBps?: number;
  onlyDirectRoutes?: boolean;
  maxAccounts?: number;
}

export interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: RoutePlanStep[];
  contextSlot: number;
  timeTaken: number;
}

export interface RoutePlanStep {
  swapInfo: SwapInfo;
  percent: number;
}

export interface SwapInfo {
  ammKey: string;
  label: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
}

export interface SwapRoute {
  quote: QuoteResponse;
  steps: RouteStep[];
  totalFee: string;
  priceImpact: number;
  effectivePrice: number;
}

export interface RouteStep {
  dex: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  fee: string;
}

export interface SwapParams {
  quoteResponse: QuoteResponse;
  userPublicKey: PublicKey | string;
  wrapAndUnwrapSol?: boolean;
  dynamicComputeUnitLimit?: boolean;
  prioritizationFeeLamports?: number | 'auto';
}

export interface SwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}
