/**
 * In-memory store for development
 * In production, replace with Prisma/database
 */

export interface MintRequest {
  id: string;
  type: 'mint' | 'burn';
  walletAddress: string;
  amount: string;
  reference: string;
  jurisdiction: string;
  status: 'PENDING' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'FAILED';
  bankReference?: string;
  bankAccount?: string;
  reviewedById?: string;
  reviewerNotes?: string;
  rejectionReason?: string;
  txSignature?: string;
  createdAt: string;
  reviewedAt?: string;
  processedAt?: string;
}

export interface WalletBalance {
  walletAddress: string;
  jpyBalance: bigint;
  usdcBalance: bigint;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  walletAddress: string;
  type: 'mint' | 'burn' | 'transfer' | 'swap';
  amount: string;
  token: string;
  txSignature?: string;
  status: 'pending' | 'confirmed' | 'failed';
  fromAddress?: string;
  toAddress?: string;
  createdAt: string;
  confirmedAt?: string;
}

export interface KycRecord {
  walletAddress: string;
  status: 'none' | 'pending' | 'verified' | 'rejected';
  level: 'basic' | 'standard' | 'enhanced' | 'institutional';
  submittedAt?: string;
  verifiedAt?: string;
  expiresAt?: string;
  rejectionReason?: string;
}

// Global in-memory store
const globalStore = globalThis as typeof globalThis & {
  mintRequests?: MintRequest[];
  walletBalances?: Map<string, WalletBalance>;
  transactions?: Transaction[];
  kycRecords?: Map<string, KycRecord>;
};

if (!globalStore.mintRequests) {
  globalStore.mintRequests = [];
}

if (!globalStore.walletBalances) {
  globalStore.walletBalances = new Map();
}

if (!globalStore.transactions) {
  globalStore.transactions = [];
}

if (!globalStore.kycRecords) {
  globalStore.kycRecords = new Map();
}

export const store = {
  // Get all requests
  getRequests: (filters?: { type?: string; status?: string; wallet?: string }): MintRequest[] => {
    let requests = [...(globalStore.mintRequests || [])];

    if (filters?.type && filters.type !== 'all') {
      requests = requests.filter(r => r.type === filters.type);
    }
    if (filters?.status) {
      requests = requests.filter(r => r.status === filters.status);
    }
    if (filters?.wallet) {
      requests = requests.filter(r => r.walletAddress === filters.wallet);
    }

    // Sort by createdAt descending
    requests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return requests;
  },

  // Get single request by ID
  getRequest: (id: string): MintRequest | undefined => {
    return globalStore.mintRequests?.find(r => r.id === id);
  },

  // Add new request
  addRequest: (request: Omit<MintRequest, 'id' | 'createdAt' | 'status'>): MintRequest => {
    const newRequest: MintRequest = {
      ...request,
      id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    globalStore.mintRequests = globalStore.mintRequests || [];
    globalStore.mintRequests.push(newRequest);
    return newRequest;
  },

  // Update request
  updateRequest: (id: string, updates: Partial<MintRequest>): MintRequest | null => {
    const index = globalStore.mintRequests?.findIndex(r => r.id === id) ?? -1;
    if (index === -1) return null;

    globalStore.mintRequests![index] = {
      ...globalStore.mintRequests![index],
      ...updates,
    };
    return globalStore.mintRequests![index];
  },

  // Get stats
  getStats: () => {
    const requests = globalStore.mintRequests || [];
    const pending = requests.filter(r => r.status === 'PENDING');

    return {
      pendingMint: pending.filter(r => r.type === 'mint').length,
      pendingBurn: pending.filter(r => r.type === 'burn').length,
      totalPendingAmount: pending
        .reduce((sum, r) => sum + BigInt(r.amount), BigInt(0))
        .toString(),
      totalRequests: requests.length,
    };
  },

  // Get wallet balance
  getBalance: (walletAddress: string): WalletBalance => {
    const existing = globalStore.walletBalances?.get(walletAddress);
    if (existing) {
      return existing;
    }
    return {
      walletAddress,
      jpyBalance: BigInt(0),
      usdcBalance: BigInt(0),
      updatedAt: new Date().toISOString(),
    };
  },

  // Update wallet balance (for mint/burn JPY)
  updateBalance: (walletAddress: string, amount: bigint, type: 'mint' | 'burn'): WalletBalance => {
    const current = globalStore.walletBalances?.get(walletAddress) || {
      walletAddress,
      jpyBalance: BigInt(0),
      usdcBalance: BigInt(0),
      updatedAt: new Date().toISOString(),
    };

    const newBalance: WalletBalance = {
      walletAddress,
      jpyBalance: type === 'mint'
        ? current.jpyBalance + amount
        : current.jpyBalance - amount,
      usdcBalance: current.usdcBalance,
      updatedAt: new Date().toISOString(),
    };

    globalStore.walletBalances?.set(walletAddress, newBalance);
    return newBalance;
  },

  // Update token balance (generic)
  updateTokenBalance: (walletAddress: string, token: 'JPY' | 'USDC', amount: bigint, type: 'add' | 'subtract'): WalletBalance => {
    const current = globalStore.walletBalances?.get(walletAddress) || {
      walletAddress,
      jpyBalance: BigInt(0),
      usdcBalance: BigInt(0),
      updatedAt: new Date().toISOString(),
    };

    const newBalance: WalletBalance = {
      walletAddress,
      jpyBalance: token === 'JPY'
        ? (type === 'add' ? current.jpyBalance + amount : current.jpyBalance - amount)
        : current.jpyBalance,
      usdcBalance: token === 'USDC'
        ? (type === 'add' ? current.usdcBalance + amount : current.usdcBalance - amount)
        : current.usdcBalance,
      updatedAt: new Date().toISOString(),
    };

    globalStore.walletBalances?.set(walletAddress, newBalance);
    return newBalance;
  },

  // Get total supply
  getTotalSupply: (): bigint => {
    let total = BigInt(0);
    globalStore.walletBalances?.forEach((balance) => {
      total += balance.jpyBalance;
    });
    return total;
  },

  // Add transaction
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>): Transaction => {
    const newTx: Transaction = {
      ...tx,
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      createdAt: new Date().toISOString(),
    };
    globalStore.transactions = globalStore.transactions || [];
    globalStore.transactions.push(newTx);
    return newTx;
  },

  // Get transactions for wallet
  getTransactions: (walletAddress?: string): Transaction[] => {
    let txs = [...(globalStore.transactions || [])];
    if (walletAddress) {
      txs = txs.filter(tx => tx.walletAddress === walletAddress);
    }
    txs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return txs;
  },

  // Get KYC record
  getKyc: (walletAddress: string): KycRecord => {
    const existing = globalStore.kycRecords?.get(walletAddress);
    if (existing) return existing;
    return {
      walletAddress,
      status: 'none',
      level: 'basic',
    };
  },

  // Update KYC record
  updateKyc: (walletAddress: string, updates: Partial<KycRecord>): KycRecord => {
    const current = globalStore.kycRecords?.get(walletAddress) || {
      walletAddress,
      status: 'none' as const,
      level: 'basic' as const,
    };
    const updated: KycRecord = { ...current, ...updates };
    globalStore.kycRecords?.set(walletAddress, updated);
    return updated;
  },

  // Submit KYC
  submitKyc: (walletAddress: string, level: KycRecord['level'] = 'standard'): KycRecord => {
    const record: KycRecord = {
      walletAddress,
      status: 'pending',
      level,
      submittedAt: new Date().toISOString(),
    };
    globalStore.kycRecords?.set(walletAddress, record);
    return record;
  },

  // Approve KYC (admin)
  approveKyc: (walletAddress: string): KycRecord | null => {
    const current = globalStore.kycRecords?.get(walletAddress);
    if (!current) return null;
    const updated: KycRecord = {
      ...current,
      status: 'verified',
      verifiedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
    };
    globalStore.kycRecords?.set(walletAddress, updated);
    return updated;
  },

  // Reject KYC (admin)
  rejectKyc: (walletAddress: string, reason?: string): KycRecord | null => {
    const current = globalStore.kycRecords?.get(walletAddress);
    if (!current) return null;
    const updated: KycRecord = {
      ...current,
      status: 'rejected',
      rejectionReason: reason,
    };
    globalStore.kycRecords?.set(walletAddress, updated);
    return updated;
  },

  // Get all KYC records (admin)
  getAllKycRecords: (status?: string): KycRecord[] => {
    const records: KycRecord[] = [];
    globalStore.kycRecords?.forEach((record) => {
      if (!status || record.status === status) {
        records.push(record);
      }
    });
    return records;
  },
};
