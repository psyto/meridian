import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/app/lib/store';

/**
 * Admin API - List all mint/burn requests
 *
 * GET /api/v1/admin/requests
 * Query params: type (mint|burn), status, page, limit
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || undefined;
    const status = searchParams.get('status') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Get requests from store
    let requests = store.getRequests({ type, status });

    // Pagination
    const total = requests.length;
    const offset = (page - 1) * limit;
    requests = requests.slice(offset, offset + limit);

    // Get stats
    const stats = store.getStats();

    return NextResponse.json({
      success: true,
      data: {
        requests,
        stats,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Admin get requests error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'リクエストの取得に失敗しました',
        },
      },
      { status: 500 }
    );
  }
}
