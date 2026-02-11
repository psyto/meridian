'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import dynamic from 'next/dynamic';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

interface KycData {
  walletAddress: string;
  status: 'none' | 'pending' | 'verified' | 'rejected';
  level: 'basic' | 'standard' | 'enhanced' | 'institutional';
  submittedAt?: string;
  verifiedAt?: string;
  expiresAt?: string;
}

export default function CompliancePage() {
  const { publicKey, connected } = useWallet();
  const [kyc, setKyc] = useState<KycData | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<'basic' | 'standard' | 'enhanced' | 'institutional'>('standard');

  useEffect(() => {
    if (connected && publicKey) {
      fetchKycStatus();
    } else {
      setKyc(null);
    }
  }, [connected, publicKey]);

  const fetchKycStatus = async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/kyc?wallet=${publicKey.toBase58()}`);
      const data = await response.json();
      if (data.success) {
        setKyc(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch KYC status:', error);
    } finally {
      setLoading(false);
    }
  };

  const submitKyc = async () => {
    if (!publicKey) return;
    setSubmitting(true);
    try {
      const response = await fetch('/api/v1/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          level: selectedLevel,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setKyc(data.data);
        alert('KYC認証申請を受け付けました。審査には24-48時間かかります。');
      } else {
        alert(data.error?.message || 'KYC申請に失敗しました');
      }
    } catch (error) {
      console.error('Failed to submit KYC:', error);
      alert('KYC申請に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const kycStatus = kyc?.status || 'none';

  if (!connected) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">
          コンプライアンス
        </h1>
        <div className="card text-center py-12">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-gray-500 mb-4">ウォレットを接続してKYC状況を確認</p>
          <WalletMultiButton />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">
        コンプライアンス
      </h1>

      {/* KYC Status Card */}
      <div className="card mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              KYC認証ステータス
            </h2>
            <p className="text-sm text-gray-500">
              本人確認を完了するとステーブルコインの発行・送金が可能になります
            </p>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            kycStatus === 'verified'
              ? 'bg-green-100 text-green-700'
              : kycStatus === 'pending'
              ? 'bg-yellow-100 text-yellow-700'
              : kycStatus === 'rejected'
              ? 'bg-red-100 text-red-700'
              : 'bg-gray-100 text-gray-700'
          }`}>
            {loading ? '...' :
              kycStatus === 'verified' ? '認証済み' :
              kycStatus === 'pending' ? '審査中' :
              kycStatus === 'rejected' ? '却下' :
              '未認証'}
          </div>
        </div>

        {kycStatus === 'verified' && kyc && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">認証レベル</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {kyc.level === 'basic' ? 'ベーシック' :
                   kyc.level === 'standard' ? 'スタンダード' :
                   kyc.level === 'enhanced' ? 'エンハンスド' : '機関投資家'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">認証日</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {kyc.verifiedAt ? new Date(kyc.verifiedAt).toLocaleDateString('ja-JP') : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">有効期限</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {kyc.expiresAt ? new Date(kyc.expiresAt).toLocaleDateString('ja-JP') : '-'}
                </p>
              </div>
            </div>
          </div>
        )}

        {kycStatus === 'pending' && kyc && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">審査中</p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-300">
                    申請日: {kyc.submittedAt ? new Date(kyc.submittedAt).toLocaleString('ja-JP') : '-'}
                  </p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-300">
                    審査には24-48時間かかります。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {kycStatus === 'none' && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                  1
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">本人情報入力</p>
                  <p className="text-xs text-gray-500">氏名・住所・生年月日</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                  2
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">本人確認書類</p>
                  <p className="text-xs text-gray-500">運転免許証・パスポート等</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                  3
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">審査完了</p>
                  <p className="text-xs text-gray-500">通常24-48時間</p>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                認証レベルを選択
              </label>
              <select
                className="input w-full md:w-auto"
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value as typeof selectedLevel)}
              >
                <option value="basic">ベーシック (Level 1)</option>
                <option value="standard">スタンダード (Level 2)</option>
                <option value="enhanced">エンハンスド (Level 3)</option>
                <option value="institutional">機関投資家</option>
              </select>
            </div>

            <button
              className="btn-primary"
              onClick={submitKyc}
              disabled={submitting}
            >
              {submitting ? '送信中...' : 'KYC認証を開始'}
            </button>
          </div>
        )}

        {kycStatus === 'rejected' && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 mb-4">
              <p className="text-red-800 dark:text-red-200">
                KYC認証が却下されました。詳細はサポートにお問い合わせください。
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={submitKyc}
              disabled={submitting}
            >
              {submitting ? '送信中...' : '再申請する'}
            </button>
          </div>
        )}
      </div>

      {/* KYC Levels */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
          KYCレベル
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className={`border rounded-lg p-4 ${kyc?.level === 'basic' && kycStatus === 'verified' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-900 dark:text-white">ベーシック</h3>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Level 1</span>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              メールアドレス・電話番号の認証
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• 日次制限: ¥100,000</li>
              <li>• 発行/償還: 不可</li>
            </ul>
          </div>

          <div className={`border rounded-lg p-4 ${kyc?.level === 'standard' && kycStatus === 'verified' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-900 dark:text-white">スタンダード</h3>
              <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded">Level 2</span>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              本人確認書類の提出
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• 日次制限: 無制限</li>
              <li>• 発行/償還: 可</li>
            </ul>
          </div>

          <div className={`border rounded-lg p-4 ${kyc?.level === 'enhanced' && kycStatus === 'verified' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-900 dark:text-white">エンハンスド</h3>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Level 3</span>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              ビデオ通話・住所確認
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• 日次制限: 無制限</li>
              <li>• 高額取引: 可</li>
            </ul>
          </div>

          <div className={`border rounded-lg p-4 ${kyc?.level === 'institutional' && kycStatus === 'verified' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-900 dark:text-white">機関投資家</h3>
              <span className="text-xs bg-accent-100 text-accent-700 px-2 py-1 rounded">Institutional</span>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              法人KYC/KYB
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• 日次制限: 無制限</li>
              <li>• API アクセス: 可</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Whitelist Status */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          ホワイトリストステータス
        </h2>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-600 dark:text-gray-400">ステータス</span>
            <span className={`font-medium ${kycStatus === 'verified' ? 'text-green-500' : 'text-red-500'}`}>
              {kycStatus === 'verified' ? '登録済み' : '未登録'}
            </span>
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-600 dark:text-gray-400">日次制限</span>
            <span className="text-gray-900 dark:text-white font-medium">
              {kycStatus === 'verified' ? '無制限' : '-'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">有効期限</span>
            <span className="text-gray-900 dark:text-white font-medium">
              {kyc?.expiresAt ? new Date(kyc.expiresAt).toLocaleDateString('ja-JP') : '-'}
            </span>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-4">
          KYC認証完了後、自動的にオンチェーンのホワイトリストに登録されます。
          ホワイトリスト登録後はステーブルコイントークンの送受信が可能になります。
        </p>
      </div>

      {/* Jurisdiction Info */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          対応地域
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span>
            <span>日本</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span>
            <span>シンガポール</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span>
            <span>香港</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span>
            <span>EU</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-500">✗</span>
            <span className="text-gray-500">アメリカ（制限）</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-yellow-500">△</span>
            <span className="text-gray-500">その他（要確認）</span>
          </div>
        </div>
      </div>
    </div>
  );
}
