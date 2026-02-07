import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/app/lib/store';

/**
 * Admin API - Reject KYC
 *
 * POST /api/v1/admin/kyc/[wallet]/reject
 */

const RejectSchema = z.object({
  adminId: z.string().min(1),
  reason: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;
    const body = await request.json();
    const parsed = RejectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0].message,
          },
        },
        { status: 400 }
      );
    }

    const { adminId, reason } = parsed.data;

    // Get existing KYC record
    const existing = store.getKyc(wallet);
    if (existing.status !== 'pending') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: 'KYC申請が審査中ではありません',
          },
        },
        { status: 400 }
      );
    }

    // Reject KYC
    const rejected = store.rejectKyc(wallet, reason);
    if (!rejected) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'KYC記録が見つかりません',
          },
        },
        { status: 404 }
      );
    }

    console.log(`[ADMIN] KYC rejected for ${wallet} by ${adminId}: ${reason || 'No reason provided'}`);

    return NextResponse.json({
      success: true,
      data: rejected,
      message: 'KYC認証が却下されました',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Admin reject KYC error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'KYC却下に失敗しました',
        },
      },
      { status: 500 }
    );
  }
}
