import { namedToShow } from './people';

// The estimate printed at the top of its half ring: "2,500". Blank means not recorded ("—"), never 0.
export function rainbowValue(v: string): string {
  const t = v.trim();
  const n = Number(t);
  if (t === '' || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US');
}

// What a ring shows before its label: "2,500", or "12 (4)" when the name list's count differs from the
// estimate (the other diagrams' rule, owner 2026-11-19), or "—" when not recorded.
export function ringValue(estimate: string, named: number | undefined): string {
  const n = namedToShow(estimate, named);
  return rainbowValue(estimate) + (n === undefined ? '' : ` (${n})`);
}
