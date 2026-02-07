import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/app/lib/store';

/**
 * JPY Balance API
 *
 * GET /api/v1/jpy/balance?wallet=...
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

    const balance = store.getBalance(wallet);
    const totalSupply = store.getTotalSupply();

    return NextResponse.json({
      success: true,
      data: {
        walletAddress: wallet,
        jpyBalance: balance.jpyBalance.toString(),
        usdcBalance: balance.usdcBalance.toString(),
        updatedAt: balance.updatedAt,
        totalSupply: totalSupply.toString(),
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Get balance error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch balance',
        },
      },
      { status: 500 }
    );
  }
}
