import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isAdministrator } from '@/lib/access';
import { getCurrentUserEmail } from '@/lib/clerkUser';
import { activitiesFromClusterNotebook } from '@/lib/data';
import { getAllNuclei, getClusters } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

function n(v: string) { return parseInt(v || '0', 10) || 0; }
function norm(s: string) { return (s || '').toLowerCase().trim(); }

// No arguments -- this route never reads anything from the request itself.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const email = await getCurrentUserEmail();

  try {
    const [clusterNotebookNuclei, clusters, admin] = await Promise.all([getAllNuclei(), getClusters(), isAdministrator()]);

    const readableNuclei = clusterNotebookNuclei.filter(cn => cn.myPermissions.canRead);

    if (readableNuclei.length === 0 && !admin) {
      return NextResponse.json(
        { error: `Access denied. Your account (${email}) is not authorized.` },
        { status: 403 }
      );
    }

    const permissions: Record<string, import('@/lib/access').PermissionSet> = {};
    const authorizedRows = readableNuclei.map(cn => {
      permissions[norm(cn.name)] = cn.myPermissions;
      const acts = Object.values(activitiesFromClusterNotebook(cn));
      return {
        nucleus:       cn.name,
        parentNucleus: cn.parentNucleus?.name ?? '',
        grouping:      cn.cluster.groupOfClusters ?? '',
        cluster:       cn.cluster.name,
        locality:      cn.locality ?? '',
        nucleusType:   cn.nucleusType ?? '',
        stage:         cn.stage ?? '',
        totalAct:  acts.reduce((s, a) => s + n(a.act),  0),
        totalPart: acts.reduce((s, a) => s + n(a.part), 0),
        totalFof:  acts.reduce((s, a) => s + n(a.fof),  0),
      };
    });

    return NextResponse.json({
      access: { isAdministrator: admin, permissions },
      rows: authorizedRows,
      email,
      clusterNames: clusters.map(c => c.name),
    });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
