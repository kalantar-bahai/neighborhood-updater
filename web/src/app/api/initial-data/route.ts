import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAccess } from '@/lib/access';
import { getAllDevRows } from '@/lib/data';
import { COL, DEV_COL } from '@/lib/config';

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

  const authorizedRows = access.rows
    .filter(r => (r[COL.NUCLEUS] || '').trim() !== '')
    .map(r => ({
      nucleus:       r[COL.NUCLEUS],
      parentNucleus: r[COL.PARENT_NUCLEUS],
      grouping:      r[COL.GROUPING],
      cluster:       r[COL.CLUSTER],
      locality:      r[COL.LOCALITY],
      nucleusType:   r[COL.TYPE],
      stage:         r[COL.STAGE],
    }));

  const devRows = await getAllDevRows();
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
