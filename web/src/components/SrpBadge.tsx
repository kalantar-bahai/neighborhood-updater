import type { SrpAction } from '@/lib/clusterNotebook';
import { srpBadge, type SrpState } from '@/lib/srp';

const COLORS = {
  green: { color: '#2f855a', background: '#f0fff4' },
  amber: { color: '#b7791f', background: '#fffff0' },
  red: { color: '#c53030', background: '#fff5f5' },
  grey: { color: '#718096', background: '#f7fafc' },
} as const;

export default function SrpBadge({ state, action }: { state: SrpState | null; action?: SrpAction['action'] }) {
  if (!state) return null;
  const { label, color } = srpBadge(state, action);
  return (
    <span
      style={{
        ...COLORS[color],
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 10,
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

// Experiment (2026-11-18): a small coloured dot beside the Location label, as a
// lighter alternative to the SRP status tag. Hover/long-press shows the words.
const DOT = { green: '#38a169', amber: '#d69e2e', red: '#e53e3e', grey: '#a0aec0' } as const;

export function SrpDot({ state, action }: { state: SrpState | null; action?: SrpAction['action'] }) {
  if (!state) return null;
  const { label, color } = srpBadge(state, action);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: DOT[color], marginLeft: 6, flexShrink: 0 }}
    />
  );
}
