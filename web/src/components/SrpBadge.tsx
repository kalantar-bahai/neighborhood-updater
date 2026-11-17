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
