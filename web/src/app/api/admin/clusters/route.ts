import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAccess';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { getMe } from '@/lib/clusterNotebook';

// The clusters the caller administers (Administrator: all; CSO: theirs). 403 when there are none.
// `me` lets the Accounts card spot the caller's own row; a failed lookup gives null rather than breaking the page.
export async function GET() {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    let me: { id: string } | null = null;
    try {
      const person = await getMe();
      me = person ? { id: person.id } : null;
    } catch (e) {
      console.error('me lookup failed; the Accounts card will not warn on self-removal', e);
    }
    return NextResponse.json({ clusters: admin.clusters, me });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
