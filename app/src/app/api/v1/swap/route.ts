import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/app/lib/store';

/**
 * Swap API
 *
 * Get quotes and execute swaps on AMM pools
 */

const QuoteRequestSchema = z.object({
  inputMint: z.string(),
  outputMint: z.string(),
  amount: z.string().min(1),
  slippageBps: z.number().min(0).max(1000).default(50),
});

const ExecuteSwapSchema = z.object({
  walletAddress: z.string().min(32),
  fromToken: z.string(),
  toToken: z.string(),
  fromAmount: z.string(),
  toAmount: z.string(),
});

// GET /api/v1/swap - Get quote
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const inputMint = searchParams.get('inputMint') || searchParams.get('fromToken');
    const outputMint = searchParams.get('outputMint') || searchParams.get('toToken');
    const amount = searchParams.get('amount');
    const slippageBps = parseInt(searchParams.get('slippageBps') || '50');

    if (!inputMint || !outputMint || !amount) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_PARAMETERS',
            message: 'inputMint, outputMint, and amount are required',
          },
        },
        { status: 400 }
      );
    }

    // Calculate swap quote
    const inputAmount = BigInt(amount);
    const fee = inputAmount * BigInt(30) / BigInt(10000); // 0.3% fee
    const outputAmount = inputAmount - fee;

    const priceImpact = 0.1;

    return NextResponse.json({
      success: true,
      data: {
        inputMint,
        outputMint,
        inputAmount: amount,
        outputAmount: outputAmount.toString(),
        fee: fee.toString(),
        priceImpact,
        price: '1000000',
        route: [
          {
            pool: 'STABLECOIN_USDC_POOL',
            inputMint,
            outputMint,
            amountIn: amount,
            amountOut: outputAmount.toString(),
          },
        ],
        expiresAt: new Date(Date.now() + 30000).toISOString(),
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Get swap quote error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get swap quote',
        },
      },
      { status: 500 }
    );
  }
}

// POST /api/v1/swap - Execute swap
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ExecuteSwapSchema.safeParse(body);

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

    const { walletAddress, fromToken, toToken, fromAmount, toAmount } = parsed.data;

    // Get current balance
    const currentBalance = store.getBalance(walletAddress);
    const swapAmount = BigInt(fromAmount);

    // Check if user has enough balance
    if (fromToken === 'STABLECOIN') {
      if (currentBalance.stablecoinBalance < swapAmount) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INSUFFICIENT_BALANCE',
              message: '残高が不足しています',
            },
          },
          { status: 400 }
        );
      }

      // Deduct from stablecoin balance
      store.updateTokenBalance(walletAddress, 'STABLECOIN', swapAmount, 'subtract');

      // Add USDC balance (convert: 1 stablecoin = 0.0067 USDC, so amount / 150)
      // Store USDC as micro units (6 decimals) - multiply by 1000000
      const usdcAmount = (swapAmount * BigInt(1000000)) / BigInt(150);
      store.updateTokenBalance(walletAddress, 'USDC', usdcAmount, 'add');
    } else if (fromToken === 'USDC') {
      const usdcSwapAmount = BigInt(Math.floor(parseFloat(toAmount) * 1000000));
      if (currentBalance.usdcBalance < usdcSwapAmount) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INSUFFICIENT_BALANCE',
              message: 'USDC残高が不足しています',
            },
          },
          { status: 400 }
        );
      }

      // Deduct USDC and add stablecoin
      store.updateTokenBalance(walletAddress, 'USDC', usdcSwapAmount, 'subtract');
      const stablecoinAmount = (usdcSwapAmount * BigInt(150)) / BigInt(1000000);
      store.updateTokenBalance(walletAddress, 'STABLECOIN', stablecoinAmount, 'add');
    }

    // Create mock transaction signature
    const mockTxSignature = `swap_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 10)}`;

    // Record the swap transaction
    const transaction = store.addTransaction({
      walletAddress,
      type: 'swap',
      amount: fromAmount,
      token: `${fromToken}→${toToken}`,
      txSignature: mockTxSignature,
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
    });

    console.log(`[SWAP] ${walletAddress}: ${fromAmount} ${fromToken} → ${toAmount} ${toToken}`);

    return NextResponse.json({
      success: true,
      data: {
        transaction,
        fromToken,
        toToken,
        fromAmount,
        toAmount,
        txSignature: mockTxSignature,
        explorerUrl: `https://explorer.solana.com/tx/${mockTxSignature}?cluster=devnet`,
      },
      message: 'スワップが完了しました',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Swap error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SWAP_ERROR',
          message: 'スワップに失敗しました',
        },
      },
      { status: 500 }
    );
  }
}
