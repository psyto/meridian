import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/app/lib/store';

/**
 * Admin API - Approve mint/burn request
 *
 * POST /api/v1/admin/requests/[id]/approve
 */

const ApproveSchema = z.object({
  adminId: z.string().min(1),
  notes: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const { adminId, notes } = parsed.data;

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

    // Update request status
    const updatedRequest = store.updateRequest(id, {
      status: 'APPROVED',
      reviewedById: adminId,
      reviewerNotes: notes,
      reviewedAt: new Date().toISOString(),
    });

    console.log(`[ADMIN] Request ${id} approved by ${adminId}`);

    return NextResponse.json({
      success: true,
      data: {
        request: updatedRequest,
        message: 'リクエストが承認されました。オンチェーン処理を開始します。',
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Admin approve error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '承認処理に失敗しました',
        },
      },
      { status: 500 }
    );
  }
}
