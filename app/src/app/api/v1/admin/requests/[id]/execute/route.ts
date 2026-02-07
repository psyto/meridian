import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/app/lib/store';

/**
 * Admin API - Execute approved mint/burn request (on-chain)
 *
 * POST /api/v1/admin/requests/[id]/execute
 */

const ExecuteSchema = z.object({
  adminId: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = ExecuteSchema.safeParse(body);

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

    // Get request from store
    const existingRequest = store.getRequest(id);
    if (!existingRequest) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'リクエストが見つかりません',
          },
        },
        { status: 404 }
      );
    }

    // Update to processing
    store.updateRequest(id, { status: 'PROCESSING' });

    // Mock on-chain execution
    const mockTxSignature = `${Date.now().toString(36)}${Math.random().toString(36).substring(2, 15)}`;

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Update wallet balance
    const amount = BigInt(existingRequest.amount);
    const newBalance = store.updateBalance(
      existingRequest.walletAddress,
      amount,
      existingRequest.type
    );

    // Create transaction record
    store.addTransaction({
      walletAddress: existingRequest.walletAddress,
      type: existingRequest.type,
      amount: existingRequest.amount,
      token: 'JPY',
      txSignature: mockTxSignature,
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
    });

    console.log(`[ADMIN] Balance updated for ${existingRequest.walletAddress}: ${newBalance.jpyBalance.toString()} JPY`);

    // Update to completed
    const updatedRequest = store.updateRequest(id, {
      status: 'COMPLETED',
      txSignature: mockTxSignature,
      processedAt: new Date().toISOString(),
    });

    console.log(`[ADMIN] Request ${id} executed by ${adminId}, tx: ${mockTxSignature}`);

    return NextResponse.json({
      success: true,
      data: {
        request: updatedRequest,
        transaction: {
          signature: mockTxSignature,
          explorerUrl: `https://explorer.solana.com/tx/${mockTxSignature}?cluster=devnet`,
        },
        message: 'トランザクションが正常に実行されました。',
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Admin execute error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: 'オンチェーン処理に失敗しました',
        },
      },
      { status: 500 }
    );
  }
}
