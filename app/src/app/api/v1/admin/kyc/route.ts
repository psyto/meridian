import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/app/lib/store';

/**
 * Admin KYC API
 *
 * GET /api/v1/admin/kyc - Get all KYC records
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const records = store.getAllKycRecords(status || undefined);

    return NextResponse.json({
      success: true,
      data: {
        records,
        total: records.length,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Admin get KYC error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch KYC records',
        },
      },
      { status: 500 }
    );
  }
}
