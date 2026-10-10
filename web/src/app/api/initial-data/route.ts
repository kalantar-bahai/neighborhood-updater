import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
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
    const [clusterNotebookNuclei, clusters] = await Promise.all([getAllNuclei(), getClusters()]);

    const readableNuclei = clusterNotebookNuclei.filter(cn => cn.myPermissions.canRead);
    // Clusters this user can actually create a nucleus under -- drives both whether
    // "+Add nucleus" shows at all (AppClient.tsx) and which clusters
    // CreateNucleusModal's dropdown offers, so the UI and the PUT route's own
    // enforcement agree by construction. Confirmed with cluster-notebook 2026-10-05:
    // this is the same computation as their per-entity myPermissions(entityName:)
    // check (a test on their side pins the two equal), not an approximation of it --
    // and replaces the old, wrong isAdministrator-based gate, which hid this
    // capability from anyone who wasn't also a global Administrator.
    const createableClusterNames = clusters
      .filter(c => c.myPermissions.createableEntityTypes.includes('nucleus'))
      .map(c => c.name);

    if (readableNuclei.length === 0 && createableClusterNames.length === 0) {
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
        // Passed through as-is, null and all -- see NucleusSummary's own comment
        // in types.ts for why collapsing null to 0 here would be wrong.
        totalPop:               cn.population,
        inConversation:         cn.inConversation,
        inCommunityActivities:  cn.inCommunityActivities,
        protagonists:           cn.protagonists,
        devotionalHosts:        cn.devotionalHosts,
        inEducationalActivities:  cn.inEducationalActivities,
        educationalFacilitators:  cn.educationalFacilitators,
        helpingOthers:          cn.helpingOthers,
        accompanying:           cn.accompanying,
      };
    });

    return NextResponse.json({
      access: { permissions },
      rows: authorizedRows,
      email,
      clusterNames: createableClusterNames,
    });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
