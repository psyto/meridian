'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import dynamic from 'next/dynamic';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

interface MintRequest {
  id: string;
  type: 'mint' | 'burn';
  amount: string;
  reference: string;
  status: string;
  createdAt: string;
}

export default function MintPage() {
  const { publicKey, connected } = useWallet();
  const [activeTab, setActiveTab] = useState<'mint' | 'burn'>('mint');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requests, setRequests] = useState<MintRequest[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [jpyBalance, setJpyBalance] = useState<string>('0');

  useEffect(() => {
    if (connected && publicKey) {
      fetchRequests();
      fetchBalance();
    }
  }, [connected, publicKey]);

  const fetchBalance = async () => {
    if (!publicKey) return;
    try {
      const response = await fetch(`/api/v1/jpy/balance?wallet=${publicKey.toBase58()}`);
      const data = await response.json();
      if (data.success) {
        setJpyBalance(data.data.jpyBalance);
      }
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    }
  };

  const fetchRequests = async () => {
    if (!publicKey) return;
    try {
      const response = await fetch(`/api/v1/jpy/mint?wallet=${publicKey.toBase58()}`);
      const data = await response.json();
      if (data.success) {
        setRequests(data.data.requests || []);
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!connected || !publicKey) {
      alert('ウォレットを接続してください');
      return;
    }

    if (!amount || parseInt(amount) < 10000) {
      alert('最小発行額は¥10,000です');
      return;
    }

    if (activeTab === 'mint' && !reference) {
      alert('銀行振込参照番号を入力してください');
      return;
    }

    if (activeTab === 'burn' && !bankAccount) {
      alert('振込先銀行口座を入力してください');
      return;
    }

    setIsSubmitting(true);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/v1/jpy/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          recipient: publicKey.toBase58(),
          reference: activeTab === 'mint' ? reference : `BURN-${Date.now()}`,
          jurisdiction: 'JP',
          type: activeTab,
          bankAccount: activeTab === 'burn' ? bankAccount : undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccessMessage(
          activeTab === 'mint'
            ? `発行リクエストを送信しました。リクエストID: ${data.data.requestId}\n\n管理者による銀行振込確認後、JPYトークンが発行されます。`
            : `償還リクエストを送信しました。リクエストID: ${data.data.requestId}\n\n管理者による確認後、銀行口座に振り込まれます。`
        );
        setAmount('');
        setReference('');
        setBankAccount('');
        fetchRequests();
      } else {
        alert(`エラー: ${data.error?.message || 'リクエストの送信に失敗しました'}`);
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert('リクエストの送信に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    const labels: Record<string, string> = {
      pending: '審査中',
      approved: '承認済み',
      completed: '完了',
      rejected: '却下',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">
        JPY 発行 / 償還
      </h1>

      {/* Wallet Connection Warning */}
      {!connected && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                ウォレットを接続してください
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                JPYの発行・償還にはウォレット接続が必要です
              </p>
            </div>
            <WalletMultiButton />
          </div>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
          <div className="flex">
            <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-green-700 dark:text-green-300 whitespace-pre-line">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg mb-8">
        <button
          onClick={() => setActiveTab('mint')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'mint'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          発行 (Mint)
        </button>
        <button
          onClick={() => setActiveTab('burn')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'burn'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          償還 (Burn)
        </button>
      </div>

      {/* Form */}
      <div className="card">
        <form onSubmit={handleSubmit}>
          {activeTab === 'mint' ? (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  JPYトークンを発行
                </h2>
                <p className="text-sm text-gray-500">
                  法定通貨を預け入れてJPYトークンを発行します。
                  銀行振込後、参照番号を入力してください。
                </p>
              </div>

              {/* Bank Transfer Info */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">振込先</p>
                <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                  <p>Meridian Trust Bank 本店営業部</p>
                  <p>普通 1234567</p>
                  <p>メリディアン（カ</p>
                </div>
              </div>

              {/* Amount */}
              <div className="mb-4">
                <label className="label">発行金額</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="1,000,000"
                    className="input pl-8"
                    disabled={!connected}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  最小発行額: ¥10,000 / 最大発行額: ¥100,000,000
                </p>
              </div>

              {/* Bank Reference */}
              <div className="mb-4">
                <label className="label">銀行振込参照番号</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="例: MTB-2026-001234"
                  className="input"
                  disabled={!connected}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Meridian Trust Bankへの振込時の参照番号
                </p>
              </div>

              {/* Recipient */}
              <div className="mb-6">
                <label className="label">受取アドレス</label>
                <input
                  type="text"
                  value={publicKey?.toBase58() || '未接続'}
                  disabled
                  className="input bg-gray-50 dark:bg-gray-700 text-gray-500 font-mono text-sm"
                />
              </div>
            </>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  JPYトークンを償還
                </h2>
                <p className="text-sm text-gray-500">
                  JPYトークンを焼却して法定通貨を銀行口座に引き出します。
                </p>
              </div>

              {/* Available Balance */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-500">利用可能残高</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  ¥{parseInt(jpyBalance).toLocaleString()}
                </p>
              </div>

              {/* Burn Amount */}
              <div className="mb-4">
                <label className="label">償還金額</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="1,000,000"
                    className="input pl-8"
                    disabled={!connected}
                  />
                  <button
                    type="button"
                    onClick={() => setAmount(jpyBalance)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded"
                  >
                    最大
                  </button>
                </div>
              </div>

              {/* Bank Account */}
              <div className="mb-6">
                <label className="label">振込先銀行口座</label>
                <textarea
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  placeholder="銀行名、支店名、口座種別、口座番号、口座名義を入力"
                  className="input h-24 resize-none"
                  disabled={!connected}
                />
                <p className="text-xs text-gray-500 mt-1">
                  KYC認証時に登録した銀行口座のみ利用可能です
                </p>
              </div>
            </>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <div className="flex">
              <svg className="w-5 h-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <p className="font-medium mb-1">信託型3号電子決済手段</p>
                <p>
                  本サービスは資金決済法に準拠しており、国内送金に100万円の制限はありません。
                  100%法定通貨で担保されています。
                </p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !amount || !connected}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
              activeTab === 'mint'
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                処理中...
              </span>
            ) : activeTab === 'mint' ? (
              '発行リクエストを送信'
            ) : (
              '償還リクエストを送信'
            )}
          </button>
        </form>
      </div>

      {/* Request History */}
      <div className="card mt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          リクエスト履歴
        </h3>
        {requests.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>リクエスト履歴がありません</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${
                      req.type === 'mint' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {req.type === 'mint' ? '発行' : '償還'}
                    </span>
                    {getStatusBadge(req.status)}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {new Date(req.createdAt).toLocaleString('ja-JP')}
                  </p>
                </div>
                <p className="font-medium">
                  ¥{parseInt(req.amount).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
