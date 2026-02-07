import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/app/lib/store';

/**
 * Admin API - Reject mint/burn request
 *
 * POST /api/v1/admin/requests/[id]/reject
 */

const RejectSchema = z.object({
  adminId: z.string().min(1),
  reason: z.string().min(1, '却下理由は必須です'),
  notes: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const { adminId, reason, notes } = parsed.data;

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
      status: 'REJECTED',
      reviewedById: adminId,
      rejectionReason: reason,
      reviewerNotes: notes,
      reviewedAt: new Date().toISOString(),
    });

    console.log(`[ADMIN] Request ${id} rejected by ${adminId}: ${reason}`);

    return NextResponse.json({
      success: true,
      data: {
        request: updatedRequest,
        message: 'リクエストが却下されました。',
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Admin reject error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '却下処理に失敗しました',
        },
      },
      { status: 500 }
    );
  }
}
