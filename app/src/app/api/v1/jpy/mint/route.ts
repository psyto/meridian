import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/app/lib/store';

/**
 * JPY Minting API
 */

const MintRequestSchema = z.object({
  amount: z.string().min(1),
  recipient: z.string().length(44), // Solana address
  reference: z.string().min(1),
  jurisdiction: z.enum(['JP', 'SG', 'HK', 'EU', 'OTHER']),
  type: z.enum(['mint', 'burn']).optional().default('mint'),
  bankAccount: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = MintRequestSchema.safeParse(body);

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

    const { amount, recipient, reference, jurisdiction, type, bankAccount } = parsed.data;

    // Create request in store
    const newRequest = store.addRequest({
      type: type as 'mint' | 'burn',
      walletAddress: recipient,
      amount,
      reference,
      jurisdiction,
      bankAccount,
    });

    console.log(`[MINT API] New ${type} request created:`, newRequest.id);

    return NextResponse.json({
      success: true,
      data: {
        requestId: newRequest.id,
        status: newRequest.status,
        estimatedCompletion: new Date(Date.now() + 3600000).toISOString(),
        amount,
        recipient,
        reference,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Mint request error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to process mint request',
        },
      },
      { status: 500 }
    );
  }
}

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

    // Fetch requests for wallet from store
    const requests = store.getRequests({ wallet });

    return NextResponse.json({
      success: true,
      data: {
        requests: requests.map(r => ({
          id: r.id,
          type: r.type,
          amount: r.amount,
          reference: r.reference,
          status: r.status.toLowerCase(),
          createdAt: r.createdAt,
        })),
        total: requests.length,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Get mint requests error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch mint requests',
        },
      },
      { status: 500 }
    );
  }
}
