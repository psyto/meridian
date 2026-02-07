import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/app/lib/store';

/**
 * Admin API - Approve KYC
 *
 * POST /api/v1/admin/kyc/[wallet]/approve
 */

const ApproveSchema = z.object({
  adminId: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;
    const body = await request.json();
    const parsed = ApproveSchema.safeParse(body);

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

    const { adminId } = parsed.data;

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

    // Approve KYC
    const approved = store.approveKyc(wallet);
    if (!approved) {
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

    console.log(`[ADMIN] KYC approved for ${wallet} by ${adminId}`);

    return NextResponse.json({
      success: true,
      data: approved,
      message: 'KYC認証が承認されました',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Admin approve KYC error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'KYC承認に失敗しました',
        },
      },
      { status: 500 }
    );
  }
}
