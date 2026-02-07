'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface KycRecord {
  walletAddress: string;
  status: 'none' | 'pending' | 'verified' | 'rejected';
  level: 'basic' | 'standard' | 'enhanced' | 'institutional';
  submittedAt?: string;
  verifiedAt?: string;
  expiresAt?: string;
  rejectionReason?: string;
}

export default function AdminKycPage() {
  const [records, setRecords] = useState<KycRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetchRecords();
  }, [statusFilter]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      const response = await fetch(`/api/v1/admin/kyc?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        setRecords(data.data.records);
      }
    } catch (error) {
      console.error('Failed to fetch KYC records:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (wallet: string) => {
    if (!confirm('このKYC申請を承認しますか？')) return;

    setProcessing(wallet);
    try {
      const response = await fetch(`/api/v1/admin/kyc/${wallet}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: 'admin-1' }),
      });
      const data = await response.json();
      if (data.success) {
        alert('KYC認証が承認されました');
        fetchRecords();
      } else {
        alert(data.error?.message || '承認に失敗しました');
      }
    } catch (error) {
      console.error('Approve failed:', error);
      alert('承認に失敗しました');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (wallet: string) => {
    const reason = prompt('却下理由を入力してください（任意）');
    if (reason === null) return; // Cancelled

    setProcessing(wallet);
    try {
      const response = await fetch(`/api/v1/admin/kyc/${wallet}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: 'admin-1', reason }),
      });
      const data = await response.json();
      if (data.success) {
        alert('KYC認証が却下されました');
        fetchRecords();
      } else {
        alert(data.error?.message || '却下に失敗しました');
      }
    } catch (error) {
      console.error('Reject failed:', error);
      alert('却下に失敗しました');
    } finally {
      setProcessing(null);
    }
  };

  const shortenAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">審査中</span>;
      case 'verified':
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">認証済み</span>;
      case 'rejected':
        return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">却下</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">未申請</span>;
    }
  };

  const getLevelLabel = (level: string) => {
    switch (level) {
      case 'basic': return 'ベーシック';
      case 'standard': return 'スタンダード';
      case 'enhanced': return 'エンハンスド';
      case 'institutional': return '機関投資家';
      default: return level;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            KYC管理
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            ユーザーのKYC申請を審査
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          ← 管理画面に戻る
        </Link>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              ステータス
            </label>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">すべて</option>
              <option value="pending">審査中</option>
              <option value="verified">認証済み</option>
              <option value="rejected">却下</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={fetchRecords}
              className="btn-secondary"
            >
              更新
            </button>
          </div>
        </div>
      </div>

      {/* Records Table */}
      <div className="card">
        {loading ? (
          <div className="text-center py-12 text-gray-500">
            読み込み中...
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p>KYC申請がありません</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-3 font-medium">ウォレット</th>
                  <th className="pb-3 font-medium">レベル</th>
                  <th className="pb-3 font-medium">ステータス</th>
                  <th className="pb-3 font-medium">申請日</th>
                  <th className="pb-3 font-medium text-right">アクション</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.walletAddress} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-4">
                      <span className="font-mono text-sm text-gray-900 dark:text-white">
                        {shortenAddress(record.walletAddress)}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className="text-gray-900 dark:text-white">
                        {getLevelLabel(record.level)}
                      </span>
                    </td>
                    <td className="py-4">
                      {getStatusBadge(record.status)}
                    </td>
                    <td className="py-4 text-gray-500 text-sm">
                      {record.submittedAt
                        ? new Date(record.submittedAt).toLocaleString('ja-JP')
                        : '-'}
                    </td>
                    <td className="py-4 text-right">
                      {record.status === 'pending' && (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleApprove(record.walletAddress)}
                            disabled={processing === record.walletAddress}
                            className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            {processing === record.walletAddress ? '...' : '承認'}
                          </button>
                          <button
                            onClick={() => handleReject(record.walletAddress)}
                            disabled={processing === record.walletAddress}
                            className="px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                          >
                            {processing === record.walletAddress ? '...' : '却下'}
                          </button>
                        </div>
                      )}
                      {record.status === 'verified' && (
                        <span className="text-sm text-gray-500">
                          {record.verifiedAt
                            ? new Date(record.verifiedAt).toLocaleDateString('ja-JP')
                            : ''} に認証
                        </span>
                      )}
                      {record.status === 'rejected' && record.rejectionReason && (
                        <span className="text-sm text-red-500">
                          理由: {record.rejectionReason}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
