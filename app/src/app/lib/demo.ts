/**
 * Demo mode utilities.
 * When NEXT_PUBLIC_DEMO_MODE=true, pages render with mock data
 * so the app can be demonstrated without a wallet connection.
 */

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export const DEMO_WALLET_ADDRESS = 'DeMo1111111111111111111111111111111111111111';

export const DEMO_BALANCE = {
  stablecoinBalance: '7500000',  // 7,500,000 JPY
  usdcBalance: '50000000000',    // 50,000 USDC (6 decimals)
  totalSupply: '125000000',
};

export const DEMO_TRANSACTIONS = [
  {
    id: 'tx_demo_001',
    type: 'mint' as const,
    amount: '5000000',
    token: 'STABLECOIN',
    status: 'confirmed',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    txSignature: '5KtPn1...demo1',
  },
  {
    id: 'tx_demo_002',
    type: 'swap' as const,
    amount: '1000000',
    token: '1,000,000 STBL -> 6,666.67 USDC',
    status: 'confirmed',
    createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    txSignature: '3AbQm2...demo2',
  },
  {
    id: 'tx_demo_003',
    type: 'transfer' as const,
    amount: '250000',
    token: 'STABLECOIN',
    status: 'confirmed',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    txSignature: '7RzWk3...demo3',
  },
  {
    id: 'tx_demo_004',
    type: 'mint' as const,
    amount: '3000000',
    token: 'STABLECOIN',
    status: 'confirmed',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    txSignature: '9PqLx4...demo4',
  },
  {
    id: 'tx_demo_005',
    type: 'burn' as const,
    amount: '500000',
    token: 'STABLECOIN',
    status: 'confirmed',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    txSignature: '2MnYk5...demo5',
  },
];

export const DEMO_KYC = {
  walletAddress: DEMO_WALLET_ADDRESS,
  status: 'verified' as const,
  level: 'standard' as const,
  submittedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  verifiedAt: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString(),
  expiresAt: new Date(Date.now() + 335 * 24 * 60 * 60 * 1000).toISOString(),
};

export const DEMO_MINT_REQUESTS = [
  {
    id: 'req_demo_001',
    type: 'mint' as const,
    amount: '5000000',
    reference: 'MTB-2026-001234',
    status: 'completed',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'req_demo_002',
    type: 'mint' as const,
    amount: '3000000',
    reference: 'MTB-2026-001189',
    status: 'completed',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'req_demo_003',
    type: 'burn' as const,
    amount: '500000',
    reference: 'BURN-1710400000000',
    status: 'completed',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
];
