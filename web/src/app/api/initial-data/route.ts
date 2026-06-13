import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAuthorizedRows } from '@/lib/access';
import { getAllDevRows } from '@/lib/data';
import { COL, DEV_COL } from '@/lib/config';

export const GET = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const email = req.auth.user.email;
  const { role, rows } = await getAuthorizedRows(email);

  if (role === 'none') {
    return NextResponse.json(
      { error: `Access denied. Your account (${email}) is not authorized.` },
      { status: 403 }
    );
  }

  const authorizedRows = rows
    .filter(r => (r[COL.NEIGHBORHOOD] || '').trim() !== '')
    .map(r => ({
      neighborhood:       r[COL.NEIGHBORHOOD],
      parentNeighborhood: r[COL.PARENT_NEIGHBORHOOD],
      grouping:           r[COL.GROUPING],
      cluster:            r[COL.CLUSTER],
      locality:           r[COL.LOCALITY],
      stage:              r[COL.STAGE],
    }));

  const devRows = await getAllDevRows();
  const srpNames = devRows.map(r => (r[DEV_COL.NAME] || '').toLowerCase().trim());

  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${process.env.MASTER_SHEET_ID}`;

  return NextResponse.json({ role, rows: authorizedRows, email, srpNames, spreadsheetUrl });
});
