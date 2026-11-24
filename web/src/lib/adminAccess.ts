import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAdminClusters, type AdminCluster } from './clusterNotebook';
import { isAdminOf } from './admin';

// Gate for every /api/admin route: 401 without a Clerk user, 403 unless cluster-notebook lists at least one
// admin cluster (Administrator: all; CSO: their clusters) and, when a cluster is named, that one among them.
// Call it inside the route's try so a cluster-notebook failure from getAdminClusters goes through
// clusterNotebookErrorResponse. cluster-notebook enforces its own permissions on each call as well.
export async function requireAdmin(clusterName?: string): Promise<{ clusters: AdminCluster[] } | NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const clusters = await getAdminClusters();
  if (clusters.length === 0 || (clusterName !== undefined && !isAdminOf(clusters, clusterName))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }
  return { clusters };
}
