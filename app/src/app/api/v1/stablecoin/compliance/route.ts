import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * KYC/Compliance API
 *
 * Manages KYC submissions and whitelist status
 */

const KycSubmissionSchema = z.object({
  wallet: z.string().length(44),
  level: z.enum(['BASIC', 'STANDARD', 'ENHANCED', 'INSTITUTIONAL']),
  jurisdiction: z.enum(['JP', 'SG', 'HK', 'EU', 'US', 'OTHER']),
  documentHash: z.string().length(64), // SHA-256 hash
});

// POST /api/v1/stablecoin/compliance/kyc/submit
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = KycSubmissionSchema.safeParse(body);

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

    const { wallet, level, jurisdiction, documentHash } = parsed.data;

    // Check if US jurisdiction (restricted)
    if (jurisdiction === 'US') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'JURISDICTION_RESTRICTED',
            message: 'US jurisdiction is not currently supported',
          },
        },
        { status: 403 }
      );
    }

    // Create KYC submission
    const submissionId = crypto.randomUUID();

    return NextResponse.json({
      success: true,
      data: {
        submissionId,
        wallet,
        level,
        jurisdiction,
        status: 'PENDING',
        submittedAt: new Date().toISOString(),
        estimatedReview: '24-48 hours',
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('KYC submission error:', error);
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

// GET /api/v1/stablecoin/compliance?wallet=...
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

    // Fetch KYC status
    // In production: check both database and on-chain whitelist

    return NextResponse.json({
      success: true,
      data: {
        wallet,
        kycStatus: 'PENDING',
        kycLevel: null,
        jurisdiction: null,
        isWhitelisted: false,
        dailyLimit: '0', // Unlimited for trust-type
        dailyUsed: '0',
        expiresAt: null,
        lastActivity: null,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Get compliance status error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch compliance status',
        },
      },
      { status: 500 }
    );
  }
}
