// The 9-figure concentric diagram, drawn as half rings (a "rainbow"), with a legend under it. Used by
// DetailView (the default diagram) and by Picker, full size in a rollup popup and `compact` as a thumbnail.
// It replaced the staggered 9-ring diagram, whose diagonal labels shrank to ~6px on a phone (owner chose
// this layout, 2026-11-25). formatNum/formatValue/AlignedLabel are also used by DetailView's other two
// diagrams.

import { namedToShow } from '@/lib/people';
import { useId } from 'react';
import { ringValue } from '@/lib/rainbow';

export function formatNum(v: string): string {
  const n = parseInt(v, 10);
  if (!v || isNaN(n)) return '____';
  if (n < 1000) return String(n);
  if (n < 100000) {
    const k = n / 1000;
    return (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'k';
  }
  return Math.round(n / 1000) + 'k';
}

// named: how many people are named in that role's list, shown after the estimate as "12 (4)" (owner,
// 2026-11-19) so the two can be compared. Undefined where the figure has no name list.
export type AlignedLabel = { label: string; value: string; named?: number; onClick?: () => void };

export function formatValue(l: AlignedLabel): string {
  const named = namedToShow(l.value, l.named);
  return formatNum(l.value) + (named === undefined ? '' : ` (${named})`);
}

// Inner -> outer, matching the labels passed in. Darker to lighter; text is white on the first four and
// navy on the rest, each pair at least 4.5:1. The thicker white gaps after rings 3 and 6 group them.
const RINGS = ['#1e3a8a', '#1e40af', '#1d4ed8', '#2563eb', '#60a5fa', '#7fb3fb', '#a5c8fd', '#c7dcfe', '#e6efff'];
const DARK_TEXT = 4;               // rings below this index get white text
const GAP_AFTER = new Set([2, 5]); // ring indexes whose outer edge is a thicker gap
// Each label curves along its own band (owner, 2026-11-25: a legend list below took more room than the
// diagram). The open centre (HOLE) keeps even the innermost arc long enough for its text; the longest
// label, ring 5's, fills about 80% of its arc.
// Drawn at twice the original scale (owner, 2026-11-27: on a phone the labels looked too big and off centre).
// A ~10px font let a phone's minimum font size enlarge the labels; at 21 units they sit above any such
// minimum, and the viewBox still scales the whole drawing to fit.
const HOLE = 80, STEP = 28, CX = 334, BASE = 334, W = 668, H = 340, FONT = 21;

// A half ring's outer edge, left foot -> over the top -> right foot.
function arc(r: number): string {
  return `M${CX - r} ${BASE} A${r} ${r} 0 0 1 ${CX + r} ${BASE}`;
}

// `compact` draws only the rings, for a thumbnail where text would be illegible.
export default function ConcentricRainbow({ labels, compact }: { labels: AlignedLabel[]; compact?: boolean }) {
  const id = useId();
  const rings = labels.map((l, i) => ({ l, i, r: HOLE + (i + 1) * STEP, mid: HOLE + (i + 0.5) * STEP, fill: RINGS[i] }));
  const editable = labels.some(l => l.onClick);
  const svg = (
    <svg viewBox={`0 0 ${W} ${H}`} role={compact ? 'img' : 'group'} style={{ width: '100%', maxWidth: compact ? undefined : 480, display: 'block', margin: '0 auto' }}
      aria-label="Concentric circles">
      {!compact && (
        <defs>
          {rings.map(({ i, mid }) => <path key={i} id={`${id}-ring${i}`} d={arc(mid)} />)}
        </defs>
      )}
      {/* Outer -> inner, so each smaller half ring sits on top: a tap anywhere on a visible band, or on its
          label, lands on that ring (owner, 2026-11-25). Each label lies in its own band, so drawing it with
          its ring leaves it uncovered. The arc alone is stroked (no closing line along the base). */}
      {[...rings].reverse().map(({ l, i, r, fill }) => {
        const click = compact ? undefined : l.onClick;
        return (
          <g key={i} className={click ? 'rainbow-ring' : undefined} onClick={click}
            {...(click ? {
              role: 'button', tabIndex: 0, 'aria-label': `${l.label}: ${ringValue(l.value, l.named)}. Change the estimate`,
              onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); click(); } },
            } : {})}>
            <path d={arc(r)} fill={fill} stroke="white" strokeWidth={GAP_AFTER.has(i) ? 8 : 3} />
            {!compact && (
              <text fontSize={FONT} fill={i < DARK_TEXT ? '#ffffff' : '#172554'}
                aria-hidden={click ? 'true' : undefined}>
                <textPath href={`#${id}-ring${i}`} startOffset="50%" textAnchor="middle">
                  {/* dy centres the text on its band; Safari mishandles dominant-baseline on a textPath. */}
                  <tspan dy="0.35em"><tspan fontWeight={700}>{ringValue(l.value, l.named)}</tspan> {l.label}</tspan>
                </textPath>
              </text>
            )}
          </g>
        );
      })}
      {/* The open centre: white, so it reads as a hole rather than another ring. */}
      <path d={arc(HOLE)} fill="white" pointerEvents="none" />
      <line x1={0} y1={BASE + 1} x2={W} y2={BASE + 1} stroke="#cbd5e0" strokeWidth={2} pointerEvents="none" />
    </svg>
  );
  if (compact || !editable) return svg;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {svg}
      <div style={{ fontSize: 12, color: '#4a5568', textAlign: 'center' }}>Tap a ring to change its estimate.</div>
    </div>
  );
}
