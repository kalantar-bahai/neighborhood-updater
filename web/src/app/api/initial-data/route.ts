import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAccess } from '@/lib/access';
import { parseRow, activitiesFromClusterNotebook } from '@/lib/data';
import { getAllNuclei } from '@/lib/clusterNotebook';
import { COL } from '@/lib/config';

function n(v: string) { return parseInt(v || '0', 10) || 0; }
function norm(s: string) { return (s || '').toLowerCase().trim(); }

export const GET = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const email = req.auth.user.email;
  const access = await getAccess(email);

  if (access.role === 'none') {
    return NextResponse.json(
      { error: `Access denied. Your account (${email}) is not authorized.` },
      { status: 403 }
    );
  }

  // TEMPORARY, branch-only: restrict the picker to nuclei that actually exist in
  // cluster-notebook, so every nucleus shown is fully testable end-to-end during
  // the incremental migration. No fallback if cluster-notebook is unreachable —
  // this call throws like any other data source failure here, per the branch's
  // no-silent-degradation design. Remove this filter once the migration no
  // longer needs it (either fully complete, or once partial-migration testing
  // isn't the priority).
  //
  // The list of valid nuclei is cluster-notebook's, not the Sheet's (2026-09-13,
  // the user directly) -- this loop is driven by clusterNotebookNuclei, and the
  // `nucleus` value returned below is cluster-notebook's own name, not the Sheet's
  // copy of it. The Sheet is consulted only for per-user authorization (does this
  // user have a row for this name?) and for fields not yet migrated. Also overrides
  // locality/stage/nucleusType/activities (all four rollups: cc/jyg/sc/devotionals,
  // 2026-09-14) with cluster-notebook's own values rather than the (now possibly
  // stale) sheet columns — avoids reintroducing the staleness
  // this migration is removing field-by-field. grouping/cluster in the summary below
  // are NOT yet migrated (still `r[COL.GROUPING]`/`r[COL.CLUSTER]`) — out of scope for
  // this pass; revisit if the picker's own grouping/cluster display needs the same
  // treatment later.
  const clusterNotebookNuclei = await getAllNuclei();
  const authorizedByName = new Map(
    access.rows
      .filter(r => (r[COL.NUCLEUS] || '').trim() !== '')
      .map(r => [norm(r[COL.NUCLEUS]), r] as const)
  );

  const authorizedRows = clusterNotebookNuclei
    .filter(cn => authorizedByName.has(norm(cn.name)))
    .map(cn => {
      const r = authorizedByName.get(norm(cn.name))!;
      const parsed = parseRow(r);
      parsed.activities = activitiesFromClusterNotebook(cn);
      const acts = Object.values(parsed.activities);
      return {
        nucleus:       cn.name,
        parentNucleus: r[COL.PARENT_NUCLEUS],
        grouping:      r[COL.GROUPING],
        cluster:       r[COL.CLUSTER],
        locality:      cn.locality ?? '',
        nucleusType:   cn.nucleusType ?? '',
        stage:         cn.stage ?? '',
        totalAct:  acts.reduce((s, a) => s + n(a.act),  0),
        totalPart: acts.reduce((s, a) => s + n(a.part), 0),
        totalFof:  acts.reduce((s, a) => s + n(a.fof),  0),
      };
    });
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${process.env.MASTER_SHEET_ID}`;

  return NextResponse.json({
    access: { roleMap: access.roleMap },
    rows: authorizedRows,
    email,
    spreadsheetUrl,
  });
});
