'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import dynamic from 'next/dynamic';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

interface BalanceData {
  stablecoinBalance: string;
  usdcBalance: string;
  totalSupply: string;
}

interface Transaction {
  id: string;
  type: 'mint' | 'burn' | 'transfer' | 'swap';
  amount: string;
  token: string;
  status: string;
  createdAt: string;
  txSignature?: string;
}

export default function Dashboard() {
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (connected && publicKey) {
      fetchBalance();
      fetchTransactions();
    } else {
      setBalance(null);
      setTransactions([]);
    }
  }, [connected, publicKey]);

  const fetchBalance = async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/stablecoin/balance?wallet=${publicKey.toBase58()}`);
      const data = await response.json();
      if (data.success) {
        setBalance(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    if (!publicKey) return;
    try {
      const response = await fetch(`/api/v1/transactions?wallet=${publicKey.toBase58()}`);
      const data = await response.json();
      if (data.success) {
        setTransactions(data.data.transactions.slice(0, 5)); // Last 5
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    }
  };

  const shortenAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatStablecoin = (amount: string) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      maximumFractionDigits: 0,
    }).format(BigInt(amount));
  };

  const formatUSDC = (amount: string) => {
    // USDC is stored with 6 decimals
    const value = Number(amount) / 1000000;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatUSD = (amount: string) => {
    const usd = Number(amount) / 150;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(usd);
  };

  // Calculate total portfolio value
  const getTotalPortfolioValue = () => {
    if (!balance) return BigInt(0);
    const stablecoinValue = BigInt(balance.stablecoinBalance);
    // Convert USDC to stablecoin value (USDC has 6 decimals, multiply by 150)
    const usdcInStablecoin = (BigInt(balance.usdcBalance) * BigInt(150)) / BigInt(1000000);
    return stablecoinValue + usdcInStablecoin;
  };

  const getAssetCount = () => {
    if (!balance) return 0;
    let count = 0;
    if (BigInt(balance.stablecoinBalance) > 0) count++;
    if (BigInt(balance.usdcBalance) > 0) count++;
    return count;
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'mint':
        return (
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-100">
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
        );
      case 'burn':
        return (
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-100">
            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </div>
        );
      case 'swap':
        return (
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-100">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        );
    }
  };

  const getTransactionLabel = (type: string) => {
    switch (type) {
      case 'mint': return '発行';
      case 'burn': return '償還';
      case 'swap': return 'スワップ';
      case 'transfer': return '送金';
      default: return type;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">
        ダッシュボード
      </h1>

      {/* Wallet Status */}
      <div className="card mb-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">ウォレット接続状況</p>
            {connected && publicKey ? (
              <p className="text-lg font-medium text-gray-900 dark:text-white font-mono">
                {shortenAddress(publicKey.toBase58())}
              </p>
            ) : (
              <p className="text-lg font-medium text-gray-900 dark:text-white">
                未接続
              </p>
            )}
          </div>
          <WalletMultiButton />
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid md:grid-cols-4 gap-6 mb-8">
        {/* Stablecoin Balance */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-500">ステーブルコイン残高</h3>
            <span className="text-xs bg-accent-100 text-accent-700 px-2 py-1 rounded">
              ステーブルコイン
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white number-display">
            {loading ? '...' : balance ? formatStablecoin(balance.stablecoinBalance) : '¥0'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            ≈ {balance ? formatUSD(balance.stablecoinBalance) : '$0.00'}
          </p>
        </div>

        {/* USDC Balance */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-500">USDC残高</h3>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
              ステーブルコイン
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white number-display">
            {loading ? '...' : balance ? formatUSDC(balance.usdcBalance) : '$0.00'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            ≈ {balance ? formatStablecoin(String((BigInt(balance.usdcBalance) * BigInt(150)) / BigInt(1000000))) : '¥0'}
          </p>
        </div>

        {/* Total Portfolio Value */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-500">ポートフォリオ総額</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white number-display">
            {loading ? '...' : formatStablecoin(getTotalPortfolioValue().toString())}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {getAssetCount()} 資産
          </p>
        </div>

        {/* Refresh */}
        <div className="card flex flex-col justify-center items-center">
          {connected && (
            <button
              onClick={() => { fetchBalance(); fetchTransactions(); }}
              className="btn-secondary text-sm"
            >
              残高を更新
            </button>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          クイックアクション
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/dashboard/mint" className="card hover:shadow-md transition-shadow">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">発行</p>
                <p className="text-sm text-gray-500">ステーブルコインを発行</p>
              </div>
            </div>
          </Link>

          <Link href="/dashboard/mint" className="card hover:shadow-md transition-shadow">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">償還</p>
                <p className="text-sm text-gray-500">ステーブルコインを償還</p>
              </div>
            </div>
          </Link>

          <Link href="/dashboard/trade" className="card hover:shadow-md transition-shadow">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">スワップ</p>
                <p className="text-sm text-gray-500">トークン交換</p>
              </div>
            </div>
          </Link>

          <Link href="/dashboard/compliance" className="card hover:shadow-md transition-shadow">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">KYC認証</p>
                <p className="text-sm text-gray-500">本人確認</p>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            最近の取引
          </h2>
          <Link href="/dashboard/portfolio" className="text-sm text-primary-600 hover:text-primary-700">
            すべて表示 →
          </Link>
        </div>
        {transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p>取引履歴がありません</p>
            <p className="text-sm mt-1">
              {connected ? 'トランザクションを作成してください' : 'ウォレットを接続して取引を開始してください'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {getTransactionIcon(tx.type)}
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {getTransactionLabel(tx.type)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(tx.createdAt).toLocaleString('ja-JP')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-medium ${
                    tx.type === 'mint' ? 'text-green-600' :
                    tx.type === 'burn' || tx.type === 'swap' ? 'text-red-600' :
                    'text-gray-600'
                  }`}>
                    {tx.type === 'swap' ? (
                      <span>{tx.token}</span>
                    ) : (
                      <span>{tx.type === 'mint' ? '+' : '-'}¥{parseInt(tx.amount).toLocaleString()}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {tx.status === 'confirmed' ? '完了' : '処理中'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
