'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

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

interface Asset {
  symbol: string;
  name: string;
  balance: number;
  value: number;
  change: number;
}

export default function PortfolioPage() {
  const { publicKey, connected } = useWallet();
  const [activeTab, setActiveTab] = useState<'assets' | 'history'>('assets');
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');

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
        setTransactions(data.data.transactions);
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    }
  };

  const formatStablecoin = (amount: string | number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      maximumFractionDigits: 0,
    }).format(typeof amount === 'string' ? BigInt(amount) : amount);
  };

  const formatUSD = (amount: string | number) => {
    const usd = (typeof amount === 'string' ? Number(amount) : amount) / 150;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(usd);
  };

  // Build assets from balance
  const assets: Asset[] = [];
  if (balance) {
    if (BigInt(balance.stablecoinBalance) > 0) {
      assets.push({
        symbol: 'STABLECOIN',
        name: 'ステーブルコイン',
        balance: Number(balance.stablecoinBalance),
        value: Number(balance.stablecoinBalance),
        change: 0
      });
    }
    if (BigInt(balance.usdcBalance) > 0) {
      // USDC has 6 decimals, convert to stablecoin value
      const usdcAmount = Number(balance.usdcBalance) / 1000000;
      const usdcValueInJpy = usdcAmount * 150;
      assets.push({
        symbol: 'USDC',
        name: 'USD Coin',
        balance: usdcAmount,
        value: usdcValueInJpy,
        change: 0
      });
    }
  }

  const totalValue = assets.reduce((sum, a) => sum + a.value, 0);

  // Filter transactions
  const filteredTransactions = typeFilter === 'all'
    ? transactions
    : transactions.filter(tx => tx.type === typeFilter);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'mint': return '発行';
      case 'burn': return '償還';
      case 'transfer': return '送金';
      case 'swap': return 'スワップ';
      default: return type;
    }
  };

  if (!connected) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">
          ポートフォリオ
        </h1>
        <div className="card text-center py-12">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-gray-500 mb-4">ウォレットを接続してポートフォリオを表示</p>
          <WalletMultiButton />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">
        ポートフォリオ
      </h1>

      {/* Portfolio Summary */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <p className="text-sm text-gray-500 mb-1">総資産額</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white number-display">
            {loading ? '...' : formatStablecoin(totalValue)}
          </p>
          <p className="text-sm text-gray-500 mt-1">≈ {formatUSD(totalValue)}</p>
        </div>

        <div className="card">
          <p className="text-sm text-gray-500 mb-1">24時間損益</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white number-display">
            ¥0
          </p>
          <p className="text-sm text-gray-500 mt-1">0.00%</p>
        </div>

        <div className="card">
          <p className="text-sm text-gray-500 mb-1">保有資産数</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white number-display">
            {assets.length}
          </p>
          <p className="text-sm text-gray-500 mt-1">種類</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg mb-8 w-fit">
        <button
          onClick={() => setActiveTab('assets')}
          className={`py-2 px-6 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'assets'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          資産一覧
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`py-2 px-6 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          取引履歴
        </button>
      </div>

      {activeTab === 'assets' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            保有資産
          </h2>

          {assets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-3 font-medium">資産</th>
                    <th className="pb-3 font-medium text-right">保有量</th>
                    <th className="pb-3 font-medium text-right">評価額</th>
                    <th className="pb-3 font-medium text-right">24時間変動</th>
                    <th className="pb-3 font-medium text-right">アクション</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((asset) => (
                    <tr key={asset.symbol} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-primary-700">
                              {asset.symbol[0]}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{asset.symbol}</p>
                            <p className="text-sm text-gray-500">{asset.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 text-right font-medium text-gray-900 dark:text-white">
                        {asset.balance.toLocaleString()}
                      </td>
                      <td className="py-4 text-right font-medium text-gray-900 dark:text-white">
                        {formatStablecoin(asset.value)}
                      </td>
                      <td className={`py-4 text-right font-medium ${
                        asset.change >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {asset.change >= 0 ? '+' : ''}{asset.change}%
                      </td>
                      <td className="py-4 text-right">
                        <Link href="/dashboard/trade" className="px-3 py-1 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                          取引
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p>資産がありません</p>
              <p className="text-sm mt-1">ステーブルコインを発行して取引を開始してください</p>
              <Link href="/dashboard/mint" className="btn-primary mt-4 inline-block">
                ステーブルコインを発行
              </Link>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              取引履歴
            </h2>
            <div className="flex gap-2">
              <select
                className="input w-32 text-sm"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">すべて</option>
                <option value="mint">発行</option>
                <option value="burn">償還</option>
                <option value="swap">スワップ</option>
                <option value="transfer">送金</option>
              </select>
            </div>
          </div>

          {filteredTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-3 font-medium">日時</th>
                    <th className="pb-3 font-medium">種類</th>
                    <th className="pb-3 font-medium">詳細</th>
                    <th className="pb-3 font-medium text-right">金額</th>
                    <th className="pb-3 font-medium text-right">ステータス</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-4 text-gray-900 dark:text-white">
                        {new Date(tx.createdAt).toLocaleString('ja-JP')}
                      </td>
                      <td className="py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          tx.type === 'mint' ? 'bg-green-100 text-green-700' :
                          tx.type === 'burn' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {getTypeLabel(tx.type)}
                        </span>
                      </td>
                      <td className="py-4 text-gray-500 text-sm">
                        {tx.txSignature ? (
                          <a
                            href={`https://explorer.solana.com/tx/${tx.txSignature}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-600 hover:underline font-mono"
                          >
                            {tx.txSignature.slice(0, 8)}...
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className={`py-4 text-right font-medium ${
                        tx.type === 'mint' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {tx.type === 'mint' ? '+' : '-'}{formatStablecoin(tx.amount)}
                      </td>
                      <td className="py-4 text-right">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          tx.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                          tx.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {tx.status === 'confirmed' ? '完了' : tx.status === 'pending' ? '処理中' : '失敗'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p>取引履歴がありません</p>
              <p className="text-sm mt-1">取引を開始すると履歴がここに表示されます</p>
            </div>
          )}
        </div>
      )}

      {/* Portfolio Allocation Chart Placeholder */}
      {assets.length > 0 && (
        <div className="card mt-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            資産配分
          </h2>
          <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-6">
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-full bg-primary-500 flex items-center justify-center">
                <span className="text-white font-bold">100%</span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 bg-primary-500 rounded"></div>
                  <span className="text-gray-900 dark:text-white font-medium">STABLECOIN</span>
                  <span className="text-gray-500">100%</span>
                </div>
                <p className="text-sm text-gray-500">{formatStablecoin(totalValue)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
