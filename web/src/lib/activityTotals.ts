import type { ActivityCounts } from './clusterNotebook';

// Helpers for the activities card's group view, which shows cluster-notebook's activityTotals (owner, 2026-11-27).

const FIELDS = ['number', 'participants', 'participantsFof'] as const;

// Field-wise sum for the group view's total rows. Null means not recorded, so a field stays null unless at least
// one input has a value for it.
export function sumCounts(list: ActivityCounts[]): ActivityCounts {
  const out: ActivityCounts = { number: null, participants: null, participantsFof: null };
  for (const counts of list) {
    for (const f of FIELDS) {
      const v = counts[f];
      if (v !== null) out[f] = (out[f] ?? 0) + v;
    }
  }
  return out;
}

// The switch's group option, or null (no switch) when no nucleus is under this one. nucleiCounted includes this one.
export function groupLabel(nucleiCounted: number | undefined): string | null {
  const under = (nucleiCounted ?? 1) - 1;
  return under >= 1 ? `With ${under} under it` : null;
}

export function countText(n: number | null): string {
  return n === null ? '' : String(n);
}
