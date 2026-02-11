'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Stats {
  pendingMint: number;
  pendingBurn: number;
  totalPendingAmount: string;
}

interface KycStats {
  pending: number;
  verified: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [kycStats, setKycStats] = useState<KycStats>({ pending: 0, verified: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchKycStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/v1/admin/requests?status=PENDING');
      const data = await response.json();
      if (data.success) {
        setStats(data.data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchKycStats = async () => {
    try {
      const [pendingRes, verifiedRes] = await Promise.all([
        fetch('/api/v1/admin/kyc?status=pending'),
        fetch('/api/v1/admin/kyc?status=verified'),
      ]);
      const pendingData = await pendingRes.json();
      const verifiedData = await verifiedRes.json();
      setKycStats({
        pending: pendingData.success ? pendingData.data.total : 0,
        verified: verifiedData.success ? verifiedData.data.total : 0,
      });
    } catch (error) {
      console.error('Failed to fetch KYC stats:', error);
    }
  };

  const formatAmount = (amount: string) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      maximumFractionDigits: 0,
    }).format(BigInt(amount));
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          管理者ダッシュボード
        </h1>
        <p className="text-gray-500 mt-1">
          ステーブルコイン発行・償還リクエストの管理
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-700 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">発行待ち</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                {loading ? '-' : stats?.pendingMint || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-700 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">償還待ち</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                {loading ? '-' : stats?.pendingBurn || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-700 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">待機中合計</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {loading ? '-' : stats ? formatAmount(stats.totalPendingAmount) : '¥0'}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-xl text-blue-600 font-bold">¥</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-700 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">要対応</p>
              <p className="text-3xl font-bold text-orange-500 mt-1">
                {loading ? '-' : (stats?.pendingMint || 0) + (stats?.pendingBurn || 0)}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Link
          href="/admin/requests?type=mint&status=PENDING"
          className="bg-white dark:bg-gray-700 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">発行リクエスト審査</h3>
              <p className="text-sm text-gray-500">銀行振込確認後、ステーブルコイントークンを発行</p>
            </div>
          </div>
        </Link>

        <Link
          href="/admin/requests?type=burn&status=PENDING"
          className="bg-white dark:bg-gray-700 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">償還リクエスト処理</h3>
              <p className="text-sm text-gray-500">ステーブルコイントークン焼却後、銀行振込を実行</p>
            </div>
          </div>
        </Link>

        <Link
          href="/admin/kyc"
          className="bg-white dark:bg-gray-700 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-white">KYC審査</h3>
                {kycStats.pending > 0 && (
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                    {kycStats.pending}件待ち
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">本人確認申請の審査</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Process Flow */}
      <div className="bg-white dark:bg-gray-700 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          承認フロー
        </h2>
        <div className="grid md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="font-bold text-blue-600">1</span>
            </div>
            <p className="font-medium text-gray-900 dark:text-white">リクエスト受付</p>
            <p className="text-xs text-gray-500">ユーザーが発行/償還申請</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="font-bold text-yellow-600">2</span>
            </div>
            <p className="font-medium text-gray-900 dark:text-white">銀行確認</p>
            <p className="text-xs text-gray-500">振込/入金を確認</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="font-bold text-green-600">3</span>
            </div>
            <p className="font-medium text-gray-900 dark:text-white">承認・実行</p>
            <p className="text-xs text-gray-500">オンチェーン処理を実行</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="font-bold text-purple-600">4</span>
            </div>
            <p className="font-medium text-gray-900 dark:text-white">完了通知</p>
            <p className="text-xs text-gray-500">ユーザーに完了を通知</p>
          </div>
        </div>
      </div>
    </div>
  );
}
