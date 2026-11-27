import type { NucleusSummary } from '@/types';

// One child nucleus on the Children card, with its own children nested under it.
export type ChildNode = { row: NucleusSummary; children: ChildNode[] };

// The nuclei under `name`, any depth deep, each level sorted by name. Built from the nucleus list the user can
// see (there is no server-side child list; confirmed with cluster-notebook 2026-11-27), so a child they can't
// read isn't there. cluster-notebook didn't always refuse cycles (A under B under A, a nucleus as its own
// parent), so `visited` keeps every nucleus to one appearance and ends the walk.
export function childTree(rows: NucleusSummary[], name: string): ChildNode[] {
  const byParent = new Map<string, NucleusSummary[]>();
  for (const r of rows) {
    const p = (r.parentNucleus || '').trim();
    if (!p) continue;
    const list = byParent.get(p);
    if (list) list.push(r); else byParent.set(p, [r]);
  }
  const visited = new Set([name]);
  const walk = (parent: string): ChildNode[] =>
    (byParent.get(parent) ?? [])
      .filter(r => !visited.has(r.nucleus))
      .sort((a, b) => a.nucleus.localeCompare(b.nucleus))
      .map(r => { visited.add(r.nucleus); return r; })
      .map(r => ({ row: r, children: walk(r.nucleus) }));
  return walk(name);
}

// The top of `r`'s parent chain within `rows` (`r` itself when its parent isn't there). The home page buckets a
// child by this nucleus's locality, so a grandchild sits in the same locality as the bar it nests under.
export function rootOf(rows: NucleusSummary[], r: NucleusSummary): NucleusSummary {
  const byName = new Map(rows.map(x => [x.nucleus, x]));
  const seen = new Set([r.nucleus]);
  let top = r;
  for (;;) {
    const parent = byName.get((top.parentNucleus || '').trim());
    if (!parent || seen.has(parent.nucleus)) return top;
    seen.add(parent.nucleus);
    top = parent;
  }
}
