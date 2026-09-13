import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAccess } from '@/lib/access';
import { getAllDevRows, parseRow } from '@/lib/data';
import { getNucleusNames } from '@/lib/clusterNotebook';
import { COL, DEV_COL } from '@/lib/config';

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
  const [clusterNotebookNamesList, devRows] = await Promise.all([getNucleusNames(), getAllDevRows()]);
  const clusterNotebookNames = new Set(clusterNotebookNamesList.map(norm));

  const authorizedRows = access.rows
    .filter(r => (r[COL.NUCLEUS] || '').trim() !== '')
    .filter(r => clusterNotebookNames.has(norm(r[COL.NUCLEUS])))
    .map(r => {
      const parsed = parseRow(r);
      const acts = Object.values(parsed.activities);
      return {
        nucleus:       r[COL.NUCLEUS],
        parentNucleus: r[COL.PARENT_NUCLEUS],
        grouping:      r[COL.GROUPING],
        cluster:       r[COL.CLUSTER],
        locality:      r[COL.LOCALITY],
        nucleusType:   r[COL.TYPE],
        stage:         r[COL.STAGE],
        totalAct:  acts.reduce((s, a) => s + n(a.act),  0),
        totalPart: acts.reduce((s, a) => s + n(a.part), 0),
        totalFof:  acts.reduce((s, a) => s + n(a.fof),  0),
      };
    });
  const srpNames = devRows.map(r => (r[DEV_COL.NAME] || '').toLowerCase().trim());
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${process.env.MASTER_SHEET_ID}`;

  return NextResponse.json({
    access: { roleMap: access.roleMap },
    rows: authorizedRows,
    email,
    srpNames,
    spreadsheetUrl,
  });
});
