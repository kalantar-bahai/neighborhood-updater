import { getAllMasterRows, getGlobalList } from './data';
import { COL } from './config';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

export async function getAuthorizedRows(email: string) {
  const [allRows, globalList] = await Promise.all([getAllMasterRows(), getGlobalList()]);

  if (globalList.some(e => norm(e) === norm(email))) {
    return { role: 'global' as const, rows: allRows };
  }

  const rows = allRows.filter(r => norm(r[COL.EMAIL]) === norm(email));
  if (rows.length === 0) return { role: 'none' as const, rows: [] };

  return { role: 'contact' as const, rows };
}
