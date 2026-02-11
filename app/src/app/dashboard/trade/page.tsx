'use client';

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

const mockMarkets = [
  { symbol: 'ALPHA', name: 'Alpha Token', price: 3250, change: 2.5, volume: '¥1.2B', type: 'rwa' },
  { symbol: 'BETA', name: 'Beta Index', price: 15800, change: -1.2, volume: '¥890M', type: 'rwa' },
  { symbol: 'GAMMA', name: 'Gamma Fund', price: 2890, change: 0.8, volume: '¥2.1B', type: 'rwa' },
  { symbol: 'STBL-USDC', name: 'STBL/USDC', price: 0.0067, change: 0.01, volume: '¥5.6B', type: 'swap' },
];

export default function TradePage() {
  const { publicKey, connected } = useWallet();
  const [activeTab, setActiveTab] = useState<'swap' | 'markets' | 'positions'>('swap');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [swapping, setSwapping] = useState(false);

  useEffect(() => {
    if (connected && publicKey) {
      fetchBalance();
    } else {
      setBalance(null);
    }
  }, [connected, publicKey]);

  const fetchBalance = async () => {
    if (!publicKey) return;
    try {
      const response = await fetch(`/api/v1/stablecoin/balance?wallet=${publicKey.toBase58()}`);
      const data = await response.json();
      if (data.success) {
        setBalance(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    }
  };

  const formatStablecoin = (amount: string | number) => {
    const value = typeof amount === 'string' ? Number(amount) : amount;
    return new Intl.NumberFormat('ja-JP').format(value);
  };

  // Calculate USDC amount based on stablecoin input
  useEffect(() => {
    if (fromAmount) {
      const stablecoinValue = parseFloat(fromAmount.replace(/,/g, ''));
      if (!isNaN(stablecoinValue)) {
        const usdcValue = stablecoinValue / 150;
        setToAmount(usdcValue.toFixed(2));
      }
    } else {
      setToAmount('');
    }
  }, [fromAmount]);

  const handleSwap = async () => {
    if (!connected || !publicKey) {
      alert('ウォレットを接続してください');
      return;
    }

    const amount = parseFloat(fromAmount.replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) {
      alert('有効な金額を入力してください');
      return;
    }

    const stablecoinBalance = balance ? Number(balance.stablecoinBalance) : 0;
    if (amount > stablecoinBalance) {
      alert('残高が不足しています');
      return;
    }

    setSwapping(true);
    try {
      const response = await fetch('/api/v1/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          fromToken: 'STABLECOIN',
          toToken: 'USDC',
          fromAmount: Math.floor(amount).toString(),
          toAmount: toAmount,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert(`${formatStablecoin(amount)} STABLECOIN → ${toAmount} USDC のスワップが完了しました`);
        setFromAmount('');
        setToAmount('');
        fetchBalance();
      } else {
        alert(data.error?.message || 'スワップに失敗しました');
      }
    } catch (error) {
      console.error('Swap failed:', error);
      alert('スワップに失敗しました');
    } finally {
      setSwapping(false);
    }
  };

  const stablecoinBalance = balance ? formatStablecoin(balance.stablecoinBalance) : '0';

  if (!connected) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">
          取引
        </h1>
        <div className="card text-center py-12">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <p className="text-gray-500 mb-4">ウォレットを接続して取引を開始</p>
          <WalletMultiButton />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">
        取引
      </h1>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg mb-8 w-fit">
        <button
          onClick={() => setActiveTab('swap')}
          className={`py-2 px-6 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'swap'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          スワップ
        </button>
        <button
          onClick={() => setActiveTab('markets')}
          className={`py-2 px-6 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'markets'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          マーケット
        </button>
        <button
          onClick={() => setActiveTab('positions')}
          className={`py-2 px-6 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'positions'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ポジション
        </button>
      </div>

      {activeTab === 'swap' && (
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Swap Form */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
              トークンスワップ
            </h2>

            {/* From */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-2">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-500">支払い</span>
                <span className="text-sm text-gray-500">残高: ¥{stablecoinBalance}</span>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  placeholder="0"
                  className="flex-1 bg-transparent text-2xl font-medium outline-none text-gray-900 dark:text-white"
                />
                <button className="flex items-center gap-2 bg-white dark:bg-gray-600 px-3 py-2 rounded-lg">
                  <span className="font-medium">STABLECOIN</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {balance && Number(balance.stablecoinBalance) > 0 && (
                <button
                  className="text-xs text-primary-600 mt-2"
                  onClick={() => setFromAmount(balance.stablecoinBalance)}
                >
                  最大
                </button>
              )}
            </div>

            {/* Swap Arrow */}
            <div className="flex justify-center -my-2 relative z-10">
              <button className="bg-white dark:bg-gray-700 border-4 border-gray-50 dark:border-gray-800 rounded-full p-2">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
            </div>

            {/* To */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-500">受取り</span>
                <span className="text-sm text-gray-500">
                  残高: ${balance ? (Number(balance.usdcBalance) / 1000000).toFixed(2) : '0.00'}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  value={toAmount}
                  readOnly
                  placeholder="0"
                  className="flex-1 bg-transparent text-2xl font-medium outline-none text-gray-900 dark:text-white"
                />
                <button className="flex items-center gap-2 bg-white dark:bg-gray-600 px-3 py-2 rounded-lg">
                  <span className="font-medium">USDC</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Swap Details */}
            <div className="space-y-2 mb-6 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>レート</span>
                <span>1 STABLECOIN = 0.0067 USDC</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>価格影響</span>
                <span className="text-green-500">&lt;0.01%</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>手数料</span>
                <span>0.3%</span>
              </div>
            </div>

            {/* Swap Button */}
            <button
              className="w-full btn-primary py-3 disabled:opacity-50"
              onClick={handleSwap}
              disabled={swapping || !fromAmount}
            >
              {swapping ? 'スワップ中...' : 'スワップ'}
            </button>
          </div>

          {/* Chart / Info */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              STABLECOIN / USDC
            </h3>
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg h-64 flex items-center justify-center text-gray-500">
              チャートエリア
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div>
                <p className="text-sm text-gray-500">24時間出来高</p>
                <p className="font-semibold text-gray-900 dark:text-white">¥5.6B</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">流動性</p>
                <p className="font-semibold text-gray-900 dark:text-white">¥12.3B</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">24時間変動</p>
                <p className="font-semibold text-green-500">+0.01%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'markets' && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              マーケット一覧
            </h2>
            <div className="flex gap-2">
              <button className="px-3 py-1 text-sm bg-primary-100 text-primary-700 rounded-lg">
                すべて
              </button>
              <button className="px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">
                スワップ
              </button>
              <button className="px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">
                RWA
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-3 font-medium">銘柄</th>
                  <th className="pb-3 font-medium text-right">価格</th>
                  <th className="pb-3 font-medium text-right">24時間変動</th>
                  <th className="pb-3 font-medium text-right">出来高</th>
                  <th className="pb-3 font-medium text-right">アクション</th>
                </tr>
              </thead>
              <tbody>
                {mockMarkets.map((market) => (
                  <tr key={market.symbol} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-4">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{market.symbol}</p>
                        <p className="text-sm text-gray-500">{market.name}</p>
                      </div>
                    </td>
                    <td className="py-4 text-right font-medium text-gray-900 dark:text-white">
                      {market.symbol === 'STBL-USDC' ? market.price : `¥${market.price.toLocaleString()}`}
                    </td>
                    <td className={`py-4 text-right font-medium ${market.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {market.change >= 0 ? '+' : ''}{market.change}%
                    </td>
                    <td className="py-4 text-right text-gray-500">
                      {market.volume}
                    </td>
                    <td className="py-4 text-right">
                      {market.type === 'swap' ? (
                        <button
                          className="px-3 py-1 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                          onClick={() => setActiveTab('swap')}
                        >
                          スワップ
                        </button>
                      ) : (
                        <span className="px-3 py-1 text-sm bg-gray-100 text-gray-500 rounded-lg">
                          準備中
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              RWA（実物資産トークン）取引は現在準備中です。ステーブルコイン/USDCスワップをご利用ください。
            </p>
          </div>
        </div>
      )}

      {activeTab === 'positions' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            オープンポジション
          </h2>
          <div className="text-center py-12 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p>オープンポジションがありません</p>
            <p className="text-sm mt-1">スワップから取引を開始してください</p>
          </div>
        </div>
      )}
    </div>
  );
}
