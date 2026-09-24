import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAccess } from '@/lib/access';
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
  const access = await getAccess(userId);

  if (access.role === 'none') {
    return NextResponse.json(
      { error: `Access denied. Your account (${email}) is not authorized.` },
      { status: 403 }
    );
  }

  // TEMPORARY, branch-only: restrict the picker to nuclei that actually exist in
  // cluster-notebook, so every nucleus shown is fully testable end-to-end during
  // the incremental migration. No fallback if cluster-notebook is unreachable —
  // this call fails loudly (a clean 502 via clusterNotebookErrorResponse, not a
  // silent fallback) per the branch's no-silent-degradation design. Remove this
  // filter once the migration no longer needs it (either fully complete, or once
  // partial-migration testing isn't the priority).
  //
  // The list of valid nuclei is cluster-notebook's, not the Sheet's (2026-09-13,
  // the user directly) -- this loop is driven by clusterNotebookNuclei, and every
  // field returned below is cluster-notebook's own value. Authorization no longer
  // cross-references the Sheet either (2026-09-14) -- roleMap's own keys (a
  // wildcard '*', or the exact nucleus names an entry names) are the complete
  // authorization answer; see access.ts.
  try {
    const [clusterNotebookNuclei, clusters] = await Promise.all([getAllNuclei(), getClusters()]);
    const hasWildcard = '*' in access.roleMap;

    const authorizedRows = clusterNotebookNuclei
      .filter(cn => hasWildcard || norm(cn.name) in access.roleMap)
      .map(cn => {
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
      access: { roleMap: access.roleMap },
      rows: authorizedRows,
      email,
      clusterNames: clusters.map(c => c.name),
    });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
