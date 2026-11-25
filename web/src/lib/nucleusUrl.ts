// The open nucleus lives in the address (/?nucleus=<id>) so a refresh, the phone's back button and a shared link
// all land on it. It is the nucleus's id, not its name: confirmed with cluster-notebook 2026-11-25, Nucleus.id is a
// stable uuid that survives renames, and names may repeat across localities (owner 2026-11-25), so a name could
// point at the wrong nucleus.

const PARAM = 'nucleus';

export function nucleusIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get(PARAM)?.trim();
  return id ? id : null;
}

export function nucleusHref(id: string | null): string {
  return id ? `/?${new URLSearchParams({ [PARAM]: id })}` : '/';
}

export type UrlNucleus = { kind: 'none' } | { kind: 'open'; name: string } | { kind: 'missing' };

// Which nucleus the address asks for, among the ones this user can read. 'missing' covers removed nuclei and
// nuclei the user can't see; the caller can't tell those apart, and shouldn't.
export function nucleusFromUrl(search: string, rows: { id: string; nucleus: string }[]): UrlNucleus {
  const id = nucleusIdFromSearch(search);
  if (!id) return { kind: 'none' };
  const row = rows.find(r => r.id === id);
  return row ? { kind: 'open', name: row.nucleus } : { kind: 'missing' };
}
