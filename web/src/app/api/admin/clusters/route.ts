import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAccess';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

// The clusters the caller administers (Administrator: all; CSO: theirs). 403 when there are none.
export async function GET() {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    return NextResponse.json({ clusters: admin.clusters });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
