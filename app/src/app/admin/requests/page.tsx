'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface Request {
  id: string;
  type: 'mint' | 'burn';
  walletAddress: string;
  amount: string;
  reference: string;
  jurisdiction?: string;
  status: string;
  bankReference?: string;
  bankAccount?: string;
  createdAt: string;
}

export default function AdminRequestsPage() {
  const searchParams = useSearchParams();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const typeFilter = searchParams.get('type') || 'all';
  const statusFilter = searchParams.get('status') || 'PENDING';

  useEffect(() => {
    fetchRequests();
  }, [typeFilter, statusFilter]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);

      const response = await fetch(`/api/v1/admin/requests?${params}`);
      const data = await response.json();
      if (data.success) {
        setRequests(data.data.requests);
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request: Request) => {
    if (!confirm(`このリクエストを承認しますか?\n\n金額: ¥${parseInt(request.amount).toLocaleString()}\nウォレット: ${request.walletAddress}`)) {
      return;
    }

    setProcessing(request.id);
    try {
      // Step 1: Approve
      const approveResponse = await fetch(`/api/v1/admin/requests/${request.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: 'admin_001', // In production, get from session
          notes: '銀行振込確認済み',
        }),
      });

      if (!approveResponse.ok) {
        throw new Error('Approval failed');
      }

      // Step 2: Execute on-chain
      const executeResponse = await fetch(`/api/v1/admin/requests/${request.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: 'admin_001',
        }),
      });

      const executeData = await executeResponse.json();

      if (executeData.success) {
        alert(`承認・実行完了\n\nトランザクション: ${executeData.data.transaction.signature}`);
        fetchRequests();
      } else {
        throw new Error(executeData.error?.message || 'Execution failed');
      }
    } catch (error) {
      console.error('Approve error:', error);
      alert('承認処理に失敗しました');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !rejectReason.trim()) {
      alert('却下理由を入力してください');
      return;
    }

    setProcessing(selectedRequest.id);
    try {
      const response = await fetch(`/api/v1/admin/requests/${selectedRequest.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: 'admin_001',
          reason: rejectReason,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert('却下しました');
        setShowRejectModal(false);
        setSelectedRequest(null);
        setRejectReason('');
        fetchRequests();
      } else {
        throw new Error(data.error?.message || 'Rejection failed');
      }
    } catch (error) {
      console.error('Reject error:', error);
      alert('却下処理に失敗しました');
    } finally {
      setProcessing(null);
    }
  };

  const formatAmount = (amount: string) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      maximumFractionDigits: 0,
    }).format(parseInt(amount));
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ja-JP');
  };

  const shortenAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      APPROVED: 'bg-blue-100 text-blue-800',
      PROCESSING: 'bg-purple-100 text-purple-800',
      COMPLETED: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800',
      FAILED: 'bg-gray-100 text-gray-800',
    };
    const labels: Record<string, string> = {
      PENDING: '審査待ち',
      APPROVED: '承認済み',
      PROCESSING: '処理中',
      COMPLETED: '完了',
      REJECTED: '却下',
      FAILED: '失敗',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          リクエスト管理
        </h1>
        <p className="text-gray-500 mt-1">
          発行・償還リクエストの審査と承認
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-700 rounded-lg p-4 mb-6 shadow-sm">
        <div className="flex gap-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">タイプ</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                const params = new URLSearchParams(searchParams);
                params.set('type', e.target.value);
                window.history.pushState({}, '', `?${params}`);
                window.location.reload();
              }}
              className="input w-32"
            >
              <option value="all">すべて</option>
              <option value="mint">発行</option>
              <option value="burn">償還</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">ステータス</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                const params = new URLSearchParams(searchParams);
                params.set('status', e.target.value);
                window.history.pushState({}, '', `?${params}`);
                window.location.reload();
              }}
              className="input w-32"
            >
              <option value="PENDING">審査待ち</option>
              <option value="APPROVED">承認済み</option>
              <option value="COMPLETED">完了</option>
              <option value="REJECTED">却下</option>
            </select>
          </div>
          <div className="flex-1" />
          <button
            onClick={fetchRequests}
            className="btn-primary self-end"
          >
            更新
          </button>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white dark:bg-gray-700 rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            読み込み中...
          </div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            リクエストがありません
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr className="text-left text-sm text-gray-500">
                <th className="px-4 py-3 font-medium">タイプ</th>
                <th className="px-4 py-3 font-medium">ウォレット</th>
                <th className="px-4 py-3 font-medium text-right">金額</th>
                <th className="px-4 py-3 font-medium">参照番号</th>
                <th className="px-4 py-3 font-medium">ステータス</th>
                <th className="px-4 py-3 font-medium">申請日時</th>
                <th className="px-4 py-3 font-medium text-right">アクション</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-t border-gray-100 dark:border-gray-600">
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      request.type === 'mint'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {request.type === 'mint' ? '発行' : '償還'}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-mono text-sm">
                    {shortenAddress(request.walletAddress)}
                  </td>
                  <td className="px-4 py-4 text-right font-medium">
                    {formatAmount(request.amount)}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {request.reference}
                  </td>
                  <td className="px-4 py-4">
                    {getStatusBadge(request.status)}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {formatDate(request.createdAt)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {request.status === 'PENDING' && (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleApprove(request)}
                          disabled={processing === request.id}
                          className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          {processing === request.id ? '処理中...' : '承認'}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedRequest(request);
                            setShowRejectModal(true);
                          }}
                          disabled={processing === request.id}
                          className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
                        >
                          却下
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              リクエストを却下
            </h3>
            <div className="mb-4">
              <p className="text-sm text-gray-500 mb-2">
                金額: {formatAmount(selectedRequest.amount)}
              </p>
              <p className="text-sm text-gray-500 mb-4">
                参照番号: {selectedRequest.reference}
              </p>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                却下理由 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="却下理由を入力してください"
                className="input h-24 resize-none"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setSelectedRequest(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                キャンセル
              </button>
              <button
                onClick={handleReject}
                disabled={processing !== null || !rejectReason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {processing ? '処理中...' : '却下する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
