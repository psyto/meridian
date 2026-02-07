import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/app/lib/store';

/**
 * KYC API
 *
 * GET /api/v1/kyc?wallet=...
 * POST /api/v1/kyc - Submit KYC
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');

    if (!wallet) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_PARAMETER',
            message: 'Wallet address is required',
          },
        },
        { status: 400 }
      );
    }

    const kyc = store.getKyc(wallet);

    return NextResponse.json({
      success: true,
      data: kyc,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Get KYC error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch KYC status',
        },
      },
      { status: 500 }
    );
  }
}

const SubmitKycSchema = z.object({
  walletAddress: z.string().min(32),
  level: z.enum(['basic', 'standard', 'enhanced', 'institutional']).optional().default('standard'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = SubmitKycSchema.safeParse(body);

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

    const { walletAddress, level } = parsed.data;

    // Check if already submitted
    const existing = store.getKyc(walletAddress);
    if (existing.status === 'pending') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ALREADY_PENDING',
            message: 'KYC認証が既に審査中です',
          },
        },
        { status: 400 }
      );
    }

    if (existing.status === 'verified') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ALREADY_VERIFIED',
            message: 'KYC認証は既に完了しています',
          },
        },
        { status: 400 }
      );
    }

    const kyc = store.submitKyc(walletAddress, level);

    return NextResponse.json({
      success: true,
      data: kyc,
      message: 'KYC認証申請を受け付けました。審査には24-48時間かかります。',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Submit KYC error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to submit KYC',
        },
      },
      { status: 500 }
    );
  }
}
