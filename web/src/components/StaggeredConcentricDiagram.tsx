// Extracted from DetailView.tsx, 2026-10-08, so Picker.tsx can also render a
// rollup version of this same diagram (summed across several nuclei, via a popup
// triggered from one of the picker's own rollup cards) without duplicating it.
// formatNum/AlignedLabel stay exported too -- DetailView.tsx's other two diagrams
// (ConcentricDiagram/AlignedConcentricDiagram, which did not move here) still need
// both.

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

export type AlignedLabel = { label: string; value: string; onClick?: () => void };

// 9 concentric circles sharing one center, ordered inner -> outer to match the
// labels passed in. Each label is left-aligned and anchored in the middle of its
// own ring's band along a 45deg ray running up and to the right of the center, so
// the labels step diagonally and the longer ones spill past the circles' edges.
// The halo (paint-order: stroke) keeps a label readable wherever it crosses a
// different fill.
//
// dashed/bold are explicit per ring, not computed from position -- inserting ring
// 5 (2026-10-04) breaks the old alternating pattern on purpose: ring 6 (renamed
// from "Promoting", unchanged otherwise) keeps the dashed look it always had,
// landing right next to the new ring's own dashed look, rather than flipping to
// bold just because its position shifted by one.
// SCX shifted from 230 (right by 10) when the 9th ring was added, 2026-10-04 --
// the outermost ring's radius grew to 9*SSTEP=234, which would otherwise clip
// slightly past the viewBox's left edge (230-234 < 0).
const SCX = 240, SCY = 240, SSTEP = 26;
const SRINGS = [
  { fill: '#1e3a8a', dashed: true  }, // 1 Accompanying (innermost)
  { fill: '#1e40af', dashed: false, bold: true }, // 2 Helping Others
  { fill: '#2563eb', dashed: true  }, // 3 Facilitating Ed. Act.
  { fill: '#3b82f6', dashed: false, bold: true }, // 4 Participating in Ed. Act.
  // New 2026-10-04, no SRP/cluster-notebook mapping yet (blank value) -- #4e94f8 is the
  // midpoint between ring 4's and ring 6's existing fills, computed rather than reusing
  // a Tailwind stop: no shade falls between blue-500 and blue-400, and reusing the whole
  // palette's skipped blue-700 would've meant recoloring rings 3-4 too, which should stay
  // exactly as they were.
  { fill: '#4e94f8', dashed: true  }, // 5 Hosting Devotional Meetings/Gatherings
  { fill: '#60a5fa', dashed: true  }, // 6 Protagonists/Promoting (renamed from "Promoting")
  { fill: '#93c5fd', dashed: false, bold: true }, // 7 Participating
  { fill: '#bfdbfe', dashed: false }, // 8 In Conversation
  { fill: '#dbeafe', dashed: false }, // 9 Population/Residing (outermost)
];

export default function StaggeredConcentricDiagram({ labels }: { labels: AlignedLabel[] }) {
  const cos45 = Math.SQRT1_2;
  return (
    <svg viewBox="0 0 580 480" style={{ width: '100%', display: 'block' }}>
      {/* Painted outer -> inner so each smaller circle sits on top of the larger one. */}
      {SRINGS.map((ring, i) => ({ ring, r: (i + 1) * SSTEP })).reverse().map(({ ring, r }) => (
        <circle
          key={r} cx={SCX} cy={SCY} r={r}
          fill={ring.fill} stroke="white" strokeWidth={ring.bold ? 3.5 : 1.5}
          strokeDasharray={ring.dashed ? '6 5' : undefined}
        />
      ))}
      {labels.map((l, i) => {
        const mid = (i + 0.5) * SSTEP;
        // Dark-fill rings (white text) vs light-fill rings (navy text) -- the new ring
        // 5's fill (#4e94f8) is still closer to the dark side than the light one, so the
        // threshold shifted from 4 to 5 rather than staying put.
        const dark = i < 5;
        const x = SCX + mid * cos45, y = SCY - mid * cos45;
        const content = <><tspan fontWeight={700}>{formatNum(l.value)}</tspan> {l.label}</>;
        return (
          <g key={i} onClick={l.onClick} style={l.onClick ? { cursor: 'pointer' } : undefined}>
            <text x={x} y={y} dominantBaseline="middle" fontSize={11} fontWeight={400}
              fill={dark ? '#1e3a8a' : '#ffffff'} stroke={dark ? '#1e3a8a' : '#ffffff'} strokeWidth={3} strokeLinejoin="round">
              {content}
            </text>
            <text x={x} y={y} dominantBaseline="middle" fontSize={11} fontWeight={400}
              fill={dark ? '#ffffff' : '#1e3a8a'} textDecoration={l.onClick ? 'underline' : undefined}>
              {content}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
