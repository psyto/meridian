import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/app/lib/store';

/**
 * Transactions API
 *
 * GET /api/v1/transactions?wallet=...
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

    const transactions = store.getTransactions(wallet);

    return NextResponse.json({
      success: true,
      data: {
        transactions,
        total: transactions.length,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch transactions',
        },
      },
      { status: 500 }
    );
  }
}
