'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NucleusDetail, NucleusRow, Activity } from '@/types';
import type { Worker } from '@/types';
import type { PermissionSet } from '@/lib/access';
import type { LastUpdated, LocalityOption } from '@/lib/clusterNotebook';
import WorkerListModal from './WorkerListModal';
import ManageAccessCard from './ManageAccessCard';
import StaggeredConcentricDiagram, { formatNum, type AlignedLabel } from './StaggeredConcentricDiagram';

interface Props {
  detail: NucleusDetail;
  permissions: PermissionSet;
  email: string;
  showBack: boolean;
  onBack: () => void;
  onSaved: (savedBy: string, savedAt: string) => void;
  // Backs the Parent Nucleus picker's suggestions (2026-10-08) -- every nucleus
  // name the current user can read, same list the main picker uses. Filtered to
  // exclude this nucleus's own name before rendering.
  allNucleusNames: string[];
}

type FormState = NucleusRow;

function rowToForm(row: NucleusRow): FormState {
  return { ...row };
}

function computedPct(connected: string, total: string): string {
  const c = parseFloat(connected);
  const t = parseFloat(total);
  if (!c || !t || t === 0) return '';
  const pct = (c / t) * 100;
  return (pct <= 1.0 ? +pct.toFixed(2) : +pct.toFixed(1)) + '%';
}

function isValidInt(v: string) { return !v || /^\d+$/.test(v.trim()); }

// Surfaces the two consequences cluster-notebook described directly, 2026-10-08,
// for whichever Setting is currently chosen (a Locality-only or cluster-level
// choice has neither): other nuclei already there (their counts get SUMMED
// together in SRP, which double-counts if this nucleus's people are a subset of
// theirs) and a Setting that isn't linked to SRP yet (entered numbers stay local
// for now). `ownNucleusName` is filtered out of "already has" -- a nucleus already
// placed at this Setting isn't "sharing" with itself. The `!locationName` guard is
// defensive, not expected in practice -- every nucleus has a location now (commit
// c40fb54, same day), so this should only ever trigger for a handful of already-
// archived nuclei that predate that rule.
function locationWarningFor(locationName: string, options: LocalityOption[], ownNucleusName: string): string | null {
  if (!locationName) return null;
  for (const locality of options) {
    for (const setting of locality.settings) {
      if (setting.name !== locationName) continue;
      const others = setting.nuclei.filter(n => n !== ownNucleusName);
      if (others.length > 0) {
        return `This Setting already has ${others.join(', ')} — your counts will be summed together in SRP.`;
      }
      return setting.srpLinked ? null : 'This Setting isn’t linked to SRP yet — entered numbers will stay local for now.';
    }
  }
  return null;
}

// The three actually-editable Activity fields -- excludes isOverridden, which is
// server-computed display state, never something a blur/change event commits.
type ActivityNumericField = 'act' | 'part' | 'fof';

function actTotal(acts: (Activity | undefined)[]) {
  return acts.reduce((acc, a) => ({
    act:  acc.act  + parseInt((a?.act  || '0'), 10),
    part: acc.part + parseInt((a?.part || '0'), 10),
    fof:  acc.fof  + parseInt((a?.fof  || '0'), 10),
  }), { act: 0, part: 0, fof: 0 });
}

function Field({ label, value, onChange, onBlur, readonly, type, integer, onLabelClick, highlighted, onSync, fromSheet, info }: {
  label: string; value: string; onChange?: (v: string) => void; onBlur?: () => void; readonly?: boolean; type?: string; integer?: boolean;
  onLabelClick?: () => void; highlighted?: boolean; onSync?: () => void; fromSheet?: boolean; info?: string;
}) {
  const hasError = integer && !readonly && !isValidInt(value);
  const cls = [readonly ? 'ro' : '', hasError ? 'error' : '', highlighted ? 'overridden' : ''].filter(Boolean).join(' ');
  return (
    <div className={`field${fromSheet ? ' from-sheet' : ''}`}>
      {onLabelClick
        ? (
          // info sits OUTSIDE both clickable spans entirely (a true sibling of each,
          // never a descendant) -- not just stopPropagation-guarded. Nesting it inside
          // an element with its own onClick was still the wrong structure even with a
          // correctly-sized hit area: the user could reproducibly open both the info
          // popover and the names-list modal from a single tap on the list icon. Split
          // into two independently-clickable spans (name, then icon) so info can sit
          // between them -- left of the list icon, still right next to the name.
          <label style={{ display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start', gap: 4 }}>
            <span onClick={e => { lastLabelClickTime = e.timeStamp; onLabelClick(); }} style={{ cursor: 'pointer', textDecoration: 'underline' }}>{label}</span>
            {info && <InfoTip text={info} />}
            <span onClick={e => { lastLabelClickTime = e.timeStamp; onLabelClick(); }} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><IcoList /></span>
          </label>
        )
        : <label style={{ display: 'inline-flex', alignItems: 'center' }}>{label}{info && <InfoTip text={info} />}</label>
      }
      <div style={{ position: 'relative' }}>
        <input
          type={type || 'text'}
          value={value || ''}
          readOnly={readonly}
          className={cls || undefined}
          style={{
            ...(highlighted && onSync ? { paddingRight: 26 } : {}),
            ...(highlighted ? { borderColor: '#f6ad55', background: '#fffaf0' } : {}),
          }}
          onChange={e => onChange?.(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onBlur ? (e => { if (e.key === 'Enter') e.currentTarget.blur(); }) : undefined}
        />
        {highlighted && onSync && (
          <button onClick={onSync} title="Sync to list count" style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#d97706', display: 'flex', alignItems: 'center' }}>
            <IcoSync />
          </button>
        )}
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange, fromSheet }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; fromSheet?: boolean;
}) {
  return (
    <div className={`field${fromSheet ? ' from-sheet' : ''}`}>
      <label>{label}</label>
      <select value={value || ''} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
      </select>
    </div>
  );
}

// A short "what does this field mean" note, tucked behind a tappable (i) icon so it
// costs no space until touched -- works on mobile (no hover needed), and the text can
// run long without disturbing the surrounding layout. Trying this out on one field
// (Households Connected) before considering it for others, 2026-09-15.
interface InfoTipPos { top?: number; bottom?: number; left: number; width: number }

// Guards against a confirmed spurious replay: clicking a field's clickable label (the
// name text or its list icon, opening a worker-list modal) is sometimes followed, ~30-40ms
// later, by a SECOND synthetic click event whose target is a nearby InfoTip button and
// whose clientX/clientY are copied verbatim from the ORIGINAL click -- even though those
// coordinates don't fall within the button's own actual bounding box. Diagnosed live with
// the user (2026-09-15): confirmed via getBoundingClientRect() logging that the two events
// share identical coordinates while the button's real rect doesn't contain them, ruling out
// a genuine second tap or a real hit-test. Root mechanism (React event replay vs. a
// touch/browser ghost-click) unconfirmed; this timestamp guard sidesteps it regardless.
let lastLabelClickTime = 0;

function InfoTip({ text }: { text: string }) {
  const [pos, setPos] = useState<InfoTipPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  // Dismiss on outside pointerdown (not a full-screen overlay <div>'s onClick) --
  // a covering overlay that removes itself in its own click handler causes a real bug
  // on touch devices: the tap that closes it can "click through" to whatever element is
  // newly exposed underneath once the overlay's gone (reported by the user: tapping the
  // info icon again to close it was also opening the names-list modal beneath it, since
  // the overlay had been covering that same spot). A pointerdown listener on the
  // document, fired before any click is dispatched, has nothing to click through.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return; // the button's own onClick handles this tap
      if (popoverRef.current?.contains(target)) return; // tapping the popover itself shouldn't close it
      setPos(null);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    const close = () => setPos(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    // See lastLabelClickTime's own comment -- a confirmed spurious replay click follows
    // a real label click by ~30-40ms with copied coordinates. Anything this close is
    // almost certainly that, not a genuine tap on this button.
    if (e.timeStamp - lastLabelClickTime < 200) return;
    if (open) { setPos(null); return; }
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(240, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    const spaceBelow = window.innerHeight - rect.bottom;
    // Flip above the icon when there's not enough room below -- a rough threshold
    // (long text wraps to several lines within this width), not an exact measurement.
    if (spaceBelow < 160) {
      setPos({ bottom: window.innerHeight - rect.top + 4, left, width });
    } else {
      setPos({ top: rect.bottom + 4, left, width });
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label="Field description"
        aria-expanded={open}
        // Explicit, fixed box (not left to default flex sizing) -- pins the clickable
        // area to exactly the icon + its padding, so it can't end up wider than it
        // looks the way the label itself once did (see the align-self: flex-start fix).
        style={{
          background: 'none', border: 'none', cursor: 'pointer', color: '#a0aec0',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, padding: 0, marginLeft: 4, flex: '0 0 auto',
        }}
      >
        <IcoInfo />
      </button>
      {/* Rendered into document.body, not in place -- a card's `overflow: hidden` (needed
          to clip the header's rounded corners) would otherwise cut this off whenever it'd
          extend past the card's edge, which the long definitions here often do. */}
      {open && pos && createPortal(
        <div
          ref={popoverRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: pos.left, width: pos.width,
            ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
            background: '#2d3748', color: 'white', fontSize: 12, lineHeight: 1.4,
            // Reset the label's uppercase/bold/letter-spacing styling -- this would
            // otherwise inherit it from the <label> it's triggered from.
            fontWeight: 400, textTransform: 'none', letterSpacing: 'normal',
            padding: '8px 10px', borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)', zIndex: 200,
          }}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  );
}

function PairField({ label, numVal, pctVal, onNumChange, onNumBlur, readonly, pctReadonly, numInteger, fromSheet, info }: {
  label: string; numVal: string; pctVal: string;
  onNumChange: (v: string) => void; onNumBlur?: () => void; readonly?: boolean; pctReadonly?: boolean; numInteger?: boolean; fromSheet?: boolean; info?: string;
}) {
  const hasError = numInteger && !readonly && !isValidInt(numVal);
  return (
    <div className={`pair-field${fromSheet ? ' from-sheet' : ''}`}>
      <label>{label}{info && <InfoTip text={info} />}</label>
      <div className="pair-inputs">
        <input
          type="text" value={numVal || ''} placeholder="#" readOnly={readonly}
          className={[readonly ? 'ro' : '', hasError ? 'error' : ''].filter(Boolean).join(' ') || undefined}
          onChange={e => onNumChange(e.target.value)}
          onBlur={onNumBlur}
          onKeyDown={onNumBlur ? (e => { if (e.key === 'Enter') e.currentTarget.blur(); }) : undefined}
        />
        <input type="text" value={pctVal || ''} placeholder="%" className={`pct${pctReadonly ? ' ro' : ''}`} readOnly={pctReadonly} />
      </div>
    </div>
  );
}

// Highlighting is driven entirely by cluster-notebook's ActivitySummary.isOverridden
// now (2026-09-14) -- one flag for the whole {act, part, fof} triple, not a per-field
// diff against a separately-fetched SRP value. So the row is either fully amber or not.
// highlightOverrides defaults on, but is turned off for Devotional Gatherings
// specifically (2026-10-05): cluster-notebook now has a write-back path that will
// (eventually) push an overridden DG value to SRP itself, so a manual DG override no
// longer represents a standing discrepancy worth flagging -- it's not a divergence
// waiting to be reconciled, just a value on its way there. The other three activity
// types have no such write-back yet, so they keep the amber cue.
function ActRow({ label, userVals, onChange, onBlur, readonly, highlightOverrides = true }: {
  label: string;
  userVals: Activity;
  onChange: (field: ActivityNumericField, v: string) => void;
  onBlur: (field: ActivityNumericField) => void;
  readonly?: boolean;
  highlightOverrides?: boolean;
}) {
  const highlighted = highlightOverrides && !!userVals.isOverridden;

  function cls(val: string) {
    return [readonly ? 'ro' : '', highlighted ? 'overridden' : '', !readonly && !isValidInt(val) ? 'error' : ''].filter(Boolean).join(' ') || undefined;
  }

  function field(key: ActivityNumericField) {
    return (
      <input
        type="text" value={userVals[key] || ''} className={cls(String(userVals[key]))} readOnly={readonly}
        onChange={e => onChange(key, e.target.value)}
        onBlur={() => onBlur(key)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
    );
  }

  return (
    <tr>
      <td className="row-label" style={{ textAlign: 'right', paddingLeft: 4, paddingRight: 10 }}>{label}</td>
      <td>{field('act')}</td>
      <td>{field('part')}</td>
      <td>{field('fof')}</td>
    </tr>
  );
}

function TotalRow({ label, totals }: { label: string; totals: { act: number; part: number; fof: number } }) {
  return (
    <tr className="total-row">
      <td className="row-label">{label}</td>
      <td><input className="plain" type="text" value={totals.act} readOnly /></td>
      <td><input className="plain" type="text" value={totals.part} readOnly /></td>
      <td><input className="plain" type="text" value={totals.fof} readOnly /></td>
    </tr>
  );
}

function ToggleItem({ label, value, notes, onToggle, onNotes, onNotesBlur, readonly, info }: {
  label: string; value: string; notes: string;
  onToggle: (v: string) => void; onNotes: (v: string) => void; onNotesBlur?: () => void; readonly?: boolean; info?: string;
}) {
  const isYes = (value || '').toLowerCase() === 'yes';
  const isNo  = !isYes;
  return (
    <div className="detail-item">
      <div className="q">{label}{info && <InfoTip text={info} />}</div>
      <div className="toggle-row">
        <button className={`tb${isYes ? ' yes' : ''}`} onClick={() => onToggle('Yes')} disabled={readonly}>Yes</button>
        <button className={`tb${isNo ? ' no' : ''}`} onClick={() => onToggle('No')} disabled={readonly}>No</button>
      </div>
      <textarea value={notes || ''} onChange={e => onNotes(e.target.value)} onBlur={onNotesBlur} readOnly={readonly} />
    </div>
  );
}

const IcoDiagram = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="12" rx="10" ry="7"/><ellipse cx="12" cy="12" rx="5" ry="3.5"/>
  </svg>
);
const IcoLogOut = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
const IcoInfo = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="11" x2="12" y2="16.5"/><line x1="12" y1="7.5" x2="12.01" y2="7.5"/>
  </svg>
);
const IcoList = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);
const IcoSync = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);
const IcoDiagram2 = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>
    <line x1="12" y1="2.5" x2="12" y2="6" strokeDasharray="1.6 1.6"/>
    <line x1="12" y1="18" x2="12" y2="21.5" strokeDasharray="1.6 1.6"/>
  </svg>
);

const IcoDiagram3 = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6.5" strokeDasharray="2 2"/><circle cx="12" cy="12" r="3"/>
  </svg>
);

const TYPE_OPTIONS  = ['', 'Neighborhood', 'Network', 'Population'];
const STAGE_OPTIONS = ['', 'Potential/1', 'Initial/2', 'Emerging/3', 'Expanding/4', 'Advanced/5', 'Advanced+/6'];

// Bounding box centered in 540×310 viewBox (70px h-margin, 55px v-margin each side).
// textY = top of ring at tx + 16, where top = cy - ry×√(1−((tx−cx)/rx)²)
// This places each label at a consistent distance below the ring's upper arc at its text x.
// 5 rings evenly spaced: rx 200→40 (step 40), ry 100→20 (step 20), cx 270→170 (step 25), cy 155→195 (step 10).
const RINGS = [
  { cx: 270, cy: 155, rx: 200, ry: 100, fill: '#dbeafe', textFill: '#1e3a8a', tx: 286, textY:  71 },
  { cx: 245, cy: 165, rx: 160, ry:  80, fill: '#93c5fd', textFill: '#1e3a8a', tx: 261, textY: 101 },
  { cx: 220, cy: 175, rx: 120, ry:  60, fill: '#60a5fa', textFill: '#1e3a8a', tx: 236, textY: 132 },
  { cx: 195, cy: 185, rx:  80, ry:  40, fill: '#2563eb', textFill: '#ffffff', tx: 211, textY: 162 },
  { cx: 170, cy: 195, rx:  40, ry:  20, fill: '#1e3a8a', textFill: '#ffffff', tx: 186, textY: 193 },
];

function ConcentricDiagram({ data }: { data: { label: string; value: string; onClick?: () => void }[] }) {
  return (
    <svg viewBox="0 0 540 310" style={{ width: '100%', display: 'block' }}>
      {RINGS.map((r, i) => (
        <ellipse
          key={i}
          cx={r.cx} cy={r.cy} rx={r.rx} ry={r.ry}
          fill={r.fill} stroke="white" strokeWidth={1.5}
          onClick={data[i].onClick}
          style={data[i].onClick ? { cursor: 'pointer' } : undefined}
        />
      ))}
      {RINGS.map((r, i) => (
        <text
          key={i}
          x={r.tx} y={r.textY}
          textAnchor="start" fontSize={12} fontWeight={400} fill={r.textFill}
          onClick={data[i].onClick}
          style={data[i].onClick ? { cursor: 'pointer' } : undefined}
          textDecoration={data[i].onClick ? 'underline' : undefined}
        >
          <tspan fontWeight={700}>{formatNum(data[i].value)}</tspan> {data[i].label}
        </text>
      ))}
    </svg>
  );
}

// Aligned (centered) diagram: 4 concentric circles sharing one center, plus a label
// placed outside all circles for "Residing". Ordered outer -> inner, matching content
// order below: band for ring i sits between ARINGS[i+1].r (or 0) and ARINGS[i].r.
const ACX = 220, ACY = 230;
const ARINGS = [
  { r: 190, fill: '#93c5fd', textFill: '#1e3a8a' }, // In conversation (outer, single label)
  { r: 145, fill: '#60a5fa', textFill: '#1e3a8a' }, // In core activity / Participating
  { r: 100, fill: '#2563eb', textFill: '#ffffff' }, // Facilitating / Promoting
  { r:  55, fill: '#1e3a8a', textFill: '#ffffff' }, // Accompanying / Helping (innermost)
];

type AlignedRingContent = { single?: AlignedLabel; right?: AlignedLabel; left?: AlignedLabel };

const ATOP = -Math.PI / 2, ARIGHT = 0, ALEFT = Math.PI;
function arcPoint(r: number, angle: number): [number, number] {
  return [ACX + r * Math.cos(angle), ACY + r * Math.sin(angle)];
}

function AlignedConcentricDiagram({ rings, residing }: { rings: AlignedRingContent[]; residing: AlignedLabel }) {
  const cx = ACX, cy = ACY;
  const outerMid = (ARINGS[0].r + ARINGS[1].r) / 2;
  const [oLeftX, oLeftY] = arcPoint(outerMid, ALEFT);
  const [oRightX, oRightY] = arcPoint(outerMid, ARIGHT);
  return (
    <svg viewBox="0 0 440 480" style={{ width: '100%', display: 'block' }}>
      {ARINGS.map((r, i) => (
        <circle key={i} cx={cx} cy={cy} r={r.r} fill={r.fill} stroke="white" strokeWidth={1.5} />
      ))}
      {/* Dashed vertical line through the inner 3 rings only; stops before the outer "In conversation" ring. */}
      <line x1={cx} y1={cy - ARINGS[1].r} x2={cx} y2={cy + ARINGS[1].r} stroke="white" strokeWidth={1.5} strokeDasharray="6 5" />

      {/* Residing — outside all circles */}
      <text x={cx} y={28} textAnchor="middle" fontSize={13} fontWeight={400} fill="#2d3748">
        <tspan fontWeight={700}>{formatNum(residing.value)}</tspan> {residing.label}
      </text>

      <defs>
        <path id="aligned-arc-outer" fill="none" d={`M ${oLeftX},${oLeftY} A ${outerMid},${outerMid} 0 0,1 ${oRightX},${oRightY}`} />
      </defs>

      {/* Outer ring: single label curving across the top of its band */}
      {rings[0]?.single && (
        <text fontSize={12} fontWeight={400} fill={ARINGS[0].textFill} dominantBaseline="middle">
          <textPath href="#aligned-arc-outer" startOffset="50%" textAnchor="middle">
            <tspan fontWeight={700}>{formatNum(rings[0].single.value)}</tspan> {rings[0].single.label}
          </textPath>
        </text>
      )}

      {/* Rings 1-2: right/left labels curving across the top of each band (toward the right/left edges) */}
      {[1, 2].map(i => {
        const outerR = ARINGS[i].r, innerR = ARINGS[i + 1].r;
        const mid = (outerR + innerR) / 2;
        const [topX, topY] = arcPoint(mid, ATOP);
        const [rightX, rightY] = arcPoint(mid, ARIGHT);
        const [leftX, leftY] = arcPoint(mid, ALEFT);
        const idR = `aligned-arc-r-${i}`, idL = `aligned-arc-l-${i}`;
        const ring = rings[i];
        if (!ring) return null;
        return (
          <g key={i}>
            <defs>
              <path id={idR} fill="none" d={`M ${topX},${topY} A ${mid},${mid} 0 0,1 ${rightX},${rightY}`} />
              <path id={idL} fill="none" d={`M ${leftX},${leftY} A ${mid},${mid} 0 0,1 ${topX},${topY}`} />
            </defs>
            {ring.right && (
              <text fontSize={11} fontWeight={400} fill={ARINGS[i].textFill} dominantBaseline="middle"
                onClick={ring.right.onClick} style={ring.right.onClick ? { cursor: 'pointer' } : undefined}>
                <textPath href={`#${idR}`} startOffset="50%" textAnchor="middle"><tspan fontWeight={700}>{formatNum(ring.right.value)}</tspan> {ring.right.label}</textPath>
              </text>
            )}
            {ring.left && (
              <text fontSize={11} fontWeight={400} fill={ARINGS[i].textFill} dominantBaseline="middle"
                onClick={ring.left.onClick} style={ring.left.onClick ? { cursor: 'pointer' } : undefined}>
                <textPath href={`#${idL}`} startOffset="50%" textAnchor="middle"><tspan fontWeight={700}>{formatNum(ring.left.value)}</tspan> {ring.left.label}</textPath>
              </text>
            )}
          </g>
        );
      })}

      {/* Ring 3 (innermost): too small to curve long words legibly — use vertical text instead. */}
      {rings[3] && (() => {
        const vx = ARINGS[3].r * 0.45;
        const ring = rings[3];
        return (
          <g>
            {ring.right && (
              <g transform={`rotate(-90 ${cx + vx} ${cy})`} onClick={ring.right.onClick} style={ring.right.onClick ? { cursor: 'pointer' } : undefined}>
                <text x={cx + vx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={400} fill={ARINGS[3].textFill}
                  textDecoration={ring.right.onClick ? 'underline' : undefined}>
                  <tspan fontWeight={700}>{formatNum(ring.right.value)}</tspan> {ring.right.label}
                </text>
              </g>
            )}
            {ring.left && (
              <g transform={`rotate(-90 ${cx - vx} ${cy})`} onClick={ring.left.onClick} style={ring.left.onClick ? { cursor: 'pointer' } : undefined}>
                <text x={cx - vx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={400} fill={ARINGS[3].textFill}
                  textDecoration={ring.left.onClick ? 'underline' : undefined}>
                  <tspan fontWeight={700}>{formatNum(ring.left.value)}</tspan> {ring.left.label}
                </text>
              </g>
            )}
          </g>
        );
      })()}
    </svg>
  );
}

// StaggeredConcentricDiagram (9-ring) moved to its own file, 2026-10-08, so
// Picker.tsx can also render a rollup version of it from its own popup.

export default function DetailView({ detail, permissions, email, showBack, onBack, onSaved, allNucleusNames }: Props) {
  const { row } = detail;
  const [form, setForm] = useState<FormState>(() => rowToForm(row));
  // Baseline to diff a blur-triggered field's current value against, so clicking into
  // a field and back out without editing it sends nothing. Advanced only on a
  // successful save of that specific field -- see saveField/commitField/setAndSave.
  const committedRef = useRef<FormState>(rowToForm(row));
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ msg: string; type: 'idle' | 'success' | 'error' }>({ msg: '', type: 'idle' });
  // The most recent failed field save, so the status bar can offer a one-click Retry
  // instead of requiring the user to re-edit the field to re-trigger a blur.
  const [retry, setRetry] = useState<{ label: string; run: () => void } | null>(null);
  // Real, persisted data from cluster-notebook's audit log (confirmed 2026-10-04) --
  // not fabricated client-side state. Initialized from the detail we loaded, kept
  // fresh after each save from that save's own response. Always one of three shapes:
  // null (no audit row exists at all -- predates audit logging), { at, by: null }
  // (history exists, actor withheld by role), or { at, by } (full info) -- see
  // LastUpdated/updatedLine below for how each renders.
  const [lastUpdated, setLastUpdated] = useState<LastUpdated | null>(() => detail.lastUpdated);
  // Which of the three concentric-circle diagrams the Concentric Circles card
  // currently shows -- replaces three separate full-screen modals (one per type,
  // each reachable only from its own page-header button) with one switcher inside
  // the single card, 2026-10-08. Defaults to 'staggered', matching that diagram's
  // prior status as the one already embedded directly in the card.
  const [diagramType, setDiagramType] = useState<'simple' | 'aligned' | 'staggered'>('staggered');
  const [accompanierNames, setAccompanierNames] = useState<Worker[]>(() => detail.accompanierNames);
  const [showAccompaniersModal, setShowAccompaniersModal] = useState(false);
  const [protagonistNames, setProtagonistNames] = useState<Worker[]>(() => detail.protagonistNames);
  const [showProtagonistsModal, setShowProtagonistsModal] = useState(false);
  const [abmAssistantNames, setAbmAssistantNames] = useState<Worker[]>(() => detail.abmAssistantNames);
  const [showAbmAssistantModal, setShowAbmAssistantModal] = useState(false);
  const [contactNames, setContactNames] = useState<Worker[]>(() => detail.contactNames);
  const [showContactModal, setShowContactModal] = useState(false);
  const [promoterNames, setPromoterNames] = useState<Worker[]>(() => detail.promoterNames);
  const [showPromotersModal, setShowPromotersModal] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [diagramCardOpen, setDiagramCardOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  // Open by default (2026-10-08) -- these five were previously always shown with
  // no way to collapse them at all; now they're collapsible like every other card,
  // just starting open instead of closed.
  const [overviewOpen, setOverviewOpen] = useState(true);
  const [familiesOpen, setFamiliesOpen] = useState(true);
  const [activitiesOpen, setActivitiesOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [narrativeOpen, setNarrativeOpen] = useState(true);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canWrite = permissions.canWrite;

  // Local-only: updates what's displayed as the user types/selects. Never talks to the
  // network by itself -- see commitField/setAndSave/commitActField below for that.
  const set = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm(f => ({ ...f, [key]: val }));
  }, []);

  const setAct = useCallback((actKey: keyof FormState['activities'], field: ActivityNumericField, val: string) => {
    setForm(f => ({ ...f, activities: { ...f.activities, [actKey]: { ...f.activities[actKey], [field]: val } } }));
  }, []);

  // Sends one small formData fragment to the same /api/nucleus POST saveRowData always
  // used -- every field this app writes is already a partial update on cluster-notebook's
  // side (undefined = leave alone), so autosave needed no new or smaller APIs, just
  // smaller/more frequent calls to the ones that already existed (2026-09-15, see
  // docs/superpowers/specs/2026-09-15-detailview-autosave-design.md).
  async function saveField(fragment: Record<string, unknown>, label: string) {
    setSaving(true);
    setSaveStatus({ msg: 'Saving…', type: 'idle' });
    try {
      const res = await fetch('/api/nucleus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: row.nucleus, formData: fragment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      setSaveStatus({ msg: 'Saved', type: 'success' });
      setRetry(null);
      // Server-recomputed isOverridden (and current act/part/fof) for whichever activity
      // types this fragment touched -- without this the amber highlight wouldn't appear
      // until reload. Only present when the fragment included `activities`.
      if (data.activities) {
        setForm(f => ({ ...f, activities: data.activities }));
      }
      // data.lastUpdated is always present on a successful save (saveRowData reads it
      // fresh after writing) -- undefined would only mean an old server response
      // shape, so `!== undefined` (not a truthiness check) is what actually guards
      // against that, while still accepting a legitimate null.
      if (data.lastUpdated !== undefined) setLastUpdated(data.lastUpdated as LastUpdated | null);
      onSaved(data.lastUpdated?.by ?? email, data.lastUpdated?.at ?? new Date().toISOString());
      return { ok: true as const, activities: data.activities as FormState['activities'] | undefined };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setSaveStatus({ msg: `Failed to save ${label}: ${message}`, type: 'error' });
      return { ok: false as const };
    } finally {
      setSaving(false);
    }
  }

  // Blur/Enter-triggered fields: totalPop, totalHH, hhNum, makeup,
  // notesPresence, notesGatherings, narrative, and the Overview card's eight new
  // fields. Skips the request entirely if the value hasn't changed since the last
  // successful save, or (for integer fields) is invalid -- an invalid number is
  // never sent, and doesn't block saving any other field. (indNum removed 2026-10-08
  // along with the Individuals Connected field itself -- see the Families card.)
  type TextFieldKey = 'totalPop' | 'totalHH' | 'hhNum' | 'makeup' | 'notesPresence' | 'notesGatherings' | 'narrative'
    | 'inConversation' | 'inCommunityActivities' | 'protagonists' | 'devotionalHosts'
    | 'inEducationalActivities' | 'educationalFacilitators' | 'helpingOthers' | 'accompanying';
  function commitField(key: TextFieldKey, label: string, integer?: boolean) {
    const value = form[key];
    if (value === committedRef.current[key]) return;
    if (integer && !isValidInt(value)) {
      setSaveStatus({ msg: `${label} must be a number`, type: 'error' });
      return;
    }
    const attempt = async () => {
      const result = await saveField({ [key]: value }, label);
      if (result.ok) {
        committedRef.current = { ...committedRef.current, [key]: value };
      } else {
        setRetry({ label, run: () => void attempt() });
      }
    };
    void attempt();
  }

  // Immediate-trigger fields: stage, nucleusType (admin dropdowns), presence, gatherings
  // (toggles) -- the change event itself is the complete, discrete action, no blur needed.
  function setAndSave<K extends keyof FormState>(key: K, value: FormState[K], fragment: Record<string, unknown>, label: string) {
    setForm(f => ({ ...f, [key]: value }));
    const attempt = async () => {
      const result = await saveField(fragment, label);
      if (result.ok) {
        committedRef.current = { ...committedRef.current, [key]: value };
      } else {
        setRetry({ label, run: () => void attempt() });
      }
    };
    void attempt();
  }

  // Parent Nucleus: blur/Enter-triggered like commitField, but (like nucleusType/
  // location) its patch fragment is nested under identity -- commitField only
  // builds flat top-level fragments, so this gets its own small commit function
  // rather than trying to make that one handle both shapes.
  function commitParentNucleus(label: string) {
    const value = form.parentNucleus;
    if (value === committedRef.current.parentNucleus) return;
    const attempt = async () => {
      const result = await saveField({ identity: { parentNucleus: value } }, label);
      if (result.ok) {
        committedRef.current = { ...committedRef.current, parentNucleus: value };
      } else {
        setRetry({ label, run: () => void attempt() });
      }
    };
    void attempt();
  }

  // Activities: blur/Enter-triggered, per sub-field (act/part/fof independently) --
  // updateActivitySummary's fields are each genuinely optional, server-side: cluster-
  // notebook's resolver defaults them to strawberry.UNSET and only assigns a field
  // when it's not UNSET, so omitting a field here really does leave it untouched --
  // it is NOT the same as sending it as null (a real, explicit clear). Confirmed with
  // cluster-notebook directly, 2026-10-03, after their audit log caught an earlier
  // version of this function sending a partial {act} fragment that activityUpdateWrites/
  // updateActivitySummary (at the time) defaulted into clearing nulls for participants/
  // fof. Both of those now only include a sub-field when the caller actually provided
  // one, so a blur on just "Number" can safely send only {act: value} again.
  const ACT_FIELD_LABEL: Record<ActivityNumericField, string> = { act: 'Number', part: 'Participants', fof: 'Friends of the Faith' };
  function commitActField(actKey: keyof FormState['activities'], field: ActivityNumericField, rowLabel: string) {
    const value = form.activities[actKey][field];
    const committedVal = committedRef.current.activities[actKey][field];
    if (value === committedVal) return;
    const label = `${rowLabel} ${ACT_FIELD_LABEL[field]}`;
    if (!isValidInt(String(value ?? ''))) {
      setSaveStatus({ msg: `${label} must be a number`, type: 'error' });
      return;
    }
    const attempt = async () => {
      const result = await saveField({ activities: { [actKey]: { [field]: value } } }, label);
      if (result.ok) {
        committedRef.current = {
          ...committedRef.current,
          activities: result.activities ?? {
            ...committedRef.current.activities,
            [actKey]: { ...committedRef.current.activities[actKey], [field]: value },
          },
        };
      } else {
        setRetry({ label, run: () => void attempt() });
      }
    };
    void attempt();
  }

  function handleBack() {
    if (saving && !confirm('A save is still in progress. Leave anyway?')) return;
    onBack();
  }

  function handleSignOut() {
    if (saving && !confirm('A save is still in progress. Leave anyway?')) return;
    window.location.href = '/signout';
  }

  const edTotal  = actTotal([form.activities.ccs, form.activities.jygs, form.activities.scs]);
  const allTotal = actTotal([form.activities.ccs, form.activities.jygs, form.activities.scs, form.activities.devotionals]);

  // All three diagrams below were switched 2026-10-07 to the Overview card's own
  // nine independently-editable, SRP-synced fields, for the same reason the
  // Overview card itself switched: these numbers no longer come from our role-
  // assignment lists (promoter/protagonist/accompanier workers) or from summing
  // activity data, so showing the diagrams' old computed/counted values would
  // silently disagree with what the Overview card now shows for the exact same
  // concept. Role-list click-to-manage-names (onClick) stays wherever it was --
  // unrelated to, and still independent of, the number displayed.
  const diagramData = [
    { label: 'Residing',      value: form.totalPop },
    { label: 'Connected',     value: form.inConversation },
    { label: 'Participating', value: form.inCommunityActivities },
    { label: 'Helping Others', value: form.helpingOthers, onClick: () => setShowProtagonistsModal(true) },
    { label: 'Accompanying',  value: form.accompanying, onClick: () => setShowAccompaniersModal(true) },
  ];

  const alignedResiding = { label: 'Residing', value: form.totalPop };
  const alignedRings: AlignedRingContent[] = [
    { single: { label: 'In conversation', value: form.inConversation } },
    {
      right: { label: 'In core activity', value: form.inEducationalActivities },
      left:  { label: 'Participating',    value: form.inCommunityActivities },
    },
    {
      right: { label: 'Facilitating', value: form.educationalFacilitators },
      left:  { label: 'Promoting',    value: form.protagonists, onClick: () => setShowPromotersModal(true) },
    },
    {
      right: { label: 'Accompanying', value: form.accompanying, onClick: () => setShowAccompaniersModal(true) },
      left:  { label: 'Helping Others', value: form.helpingOthers, onClick: () => setShowProtagonistsModal(true) },
    },
  ];

  // Innermost -> outermost, same values as the Aligned diagram's rings. Hosting
  // Devotional Meetings/Gatherings has a real mapping now (devotionalHosts,
  // 2026-10-07) -- was always blank before, no field existed for it yet.
  const staggeredLabels: AlignedLabel[] = [
    { label: 'Accompanying',                           value: form.accompanying, onClick: () => setShowAccompaniersModal(true) },
    { label: 'Helping Others',                          value: form.helpingOthers, onClick: () => setShowProtagonistsModal(true) },
    { label: 'Facilitating Ed. Act.',                   value: form.educationalFacilitators },
    { label: 'Participating in Ed. Act.',               value: form.inEducationalActivities },
    { label: 'Hosting Devotional Meetings/Gatherings',  value: form.devotionalHosts },
    { label: 'Protagonists/Promoting',                  value: form.protagonists, onClick: () => setShowPromotersModal(true) },
    { label: 'Participating',                           value: form.inCommunityActivities },
    { label: 'In Conversation',                         value: form.inConversation },
    { label: 'Population/Residing',                     value: form.totalPop },
  ];

  // Three cases, confirmed with cluster-notebook 2026-10-04 -- null means no audit
  // row exists at all (predates audit logging, 2026-09-25: no date to show, not an
  // unknown one), `by` null with `at` set means the actor is withheld by role (not
  // "unknown" either -- the server already decided, so no "unknown person" wording),
  // both set is the full line. Deliberately NOT "System" for the null case (2026-10-04,
  // reported by the user as confusing) -- "System" is cluster-notebook's own real label
  // for a script/seed write that DID get audited (a case `lastUpdated.by` can equal,
  // rendered by the second branch below); reusing that word here, for a nucleus with
  // no audit row at all, made it look like the same thing when it isn't.
  const updatedLine = !lastUpdated
    ? 'No update history recorded'
    : lastUpdated.by
      ? `Last updated by ${lastUpdated.by} on ${new Date(lastUpdated.at).toLocaleString()}`
      : `Last updated on ${new Date(lastUpdated.at).toLocaleString()}`;

  const locationWarning = locationWarningFor(form.locationName, detail.locationOptions, row.nucleus);

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
          {showBack && <button className="back-btn" onClick={handleBack}>← Back</button>}
          <div style={{ minWidth: 0 }}>
            <h1>{row.nucleus}</h1>
            <div className="meta">{row.clusterCode} · {row.cluster} · {row.locality}</div>
            <div className="last-updated">{updatedLine}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={handleSignOut} title="Sign out" aria-label="Sign out" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.7)', background: 'none', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '5px 7px', cursor: 'pointer' }}>
            <IcoLogOut />
          </button>
        </div>
      </div>

      <div className="container">

        {/* Identity */}
        <div className="card">
          <div
            className="card-header"
            onClick={() => setIdentityOpen(o => !o)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <span><span style={{ fontSize: 11, marginRight: 6 }}>{identityOpen ? '▼' : '▶'}</span>Identity</span>
          </div>
          {identityOpen && <div className="card-body">
            <div className="field-grid-4">
              {/* Grouping/Cluster/PG/Cluster Code are all read-only: Grouping/Cluster/PG
                  because cluster-notebook derives them from Cluster.groupOfClusters/name/
                  growthMilestone with no mutation for any of the three (2026-09-13); Cluster
                  Code because it's not a stored field at all, just the first token of
                  cluster.name, computed in nucleusFieldsFromClusterNotebook (data.ts).
                  Cluster is chosen once, at creation time, via CreateNucleusModal
                  (createNucleus needs a clusterName) -- not editable here afterward,
                  2026-09-14. */}
              <Field label="Grouping"     value={form.grouping}    readonly />
              <Field label="Cluster Code" value={form.clusterCode} readonly />
              <Field label="Cluster"      value={form.cluster}     readonly />
              <Field label="PG"           value={form.pg}          readonly />
            </div>
            <div className="field-grid-4">
              {/* Location replaces Locality here, 2026-10-08 -- Locality was always
                  just a read-only derived VIEW of Location (walking up from it until
                  a Locality is found), and showing both was redundant now that
                  Location itself is editable. Every nucleus has one now (at minimum
                  its own Cluster) -- cluster-notebook commit c40fb54, 2026-10-08,
                  superseding their own earlier "null is legitimate" guidance, so
                  there's no "none" option any more; a Cluster/Locality/Setting name
                  is the only kind of choice. The tree (detail.locationOptions) is
                  already scoped to this nucleus's own cluster and to what this
                  caller can read -- confirmed with cluster-notebook directly.
                  Nucleus (the name itself) is read-only: cluster-notebook's own
                  name is now the canonical identifier (2026-09-13, the user
                  directly) and cluster-notebook has no rename mutation — an edit
                  here would silently revert on next load. Set once, at creation
                  time, via CreateNucleusModal, 2026-09-14. */}
              {permissions.canChangeIdentity ? (
                <div className="field">
                  <label>Location</label>
                  <select
                    value={form.locationName}
                    onChange={e => setAndSave('locationName', e.target.value, { identity: { location: e.target.value } }, 'Location')}
                  >
                    <option value={form.cluster}>— This cluster ({form.cluster}) —</option>
                    {detail.locationOptions.map(locality => (
                      <optgroup key={locality.name} label={locality.name}>
                        <option value={locality.name}>{locality.name} (locality)</option>
                        {locality.settings.map(setting => (
                          <option key={setting.name} value={setting.name}>{setting.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              ) : (
                <Field label="Location" value={form.locationName} readonly />
              )}
              <Field label="Nucleus" value={form.nucleus} readonly />
              {/* Type is only ever freely settable at a CLUSTER or LOCALITY location --
                  at a SETTING, cluster-notebook forces it to "Neighborhood" and now
                  raises a real error if you try to set anything else (previously a
                  silent revert, confirmed with cluster-notebook directly, 2026-10-08,
                  commit c40fb54), so there's no point offering the control at all in
                  that case -- show it readonly instead of letting the save fail. */}
              {permissions.canChangeIdentity && form.locationType !== 'SETTING'
                ? <SelectField label="Type" value={form.nucleusType} options={TYPE_OPTIONS} onChange={v => setAndSave('nucleusType', v, { identity: { nucleusType: v } }, 'Type')} />
                : <Field label="Type" value={form.nucleusType} readonly />
              }
              {permissions.canChangeIdentity
                ? <SelectField label="Stage" value={form.stage} options={STAGE_OPTIONS} onChange={v => setAndSave('stage', v, { stage: v }, 'Stage')} />
                : <Field label="Stage" value={form.stage} readonly />
              }
            </div>
            <div className="field-grid-4">
              <Field
                label="Contact"
                value={contactNames[0]?.name ?? ''}
                readonly
                onLabelClick={permissions.canAssignRoles && permissions.assignableRoles.includes('contact') ? () => setShowContactModal(true) : undefined}
              />
              {/* Derived from the Contact Individual's own email field -- no separate
                  stored value, so there's nothing to edit here directly. */}
              <Field label="Contact Email" value={contactNames[0]?.email ?? ''} readonly />
              {/* Read-only everywhere: sourced from cluster-notebook's Cluster.auxiliaryBoardMembers
                  (plain text, comma-separated "<Name> (<Portfolio>)" entries, no mutation) -- same
                  treatment as Grouping/Cluster/PG above. */}
              <Field label="Auxiliary Board Member(s)" value={form.auxBoard} readonly />
              <Field
                label="ABm Assistant"
                value={abmAssistantNames.map(w => w.name).join(', ')}
                readonly
                onLabelClick={permissions.canAssignRoles && permissions.assignableRoles.includes('abm-assistant') ? () => setShowAbmAssistantModal(true) : undefined}
              />
            </div>
            {/* Parent Nucleus ("pocket grouping") -- data/save plumbing already
                existed (the picker already reads it to group nuclei), but nothing
                ever let a user SET it until now, 2026-10-08. A search-assisted text
                input rather than a flat dropdown: nucleus counts can run larger than
                clusters/localities. datalist gives free browser-native autocomplete
                over allNucleusNames without a new search API -- the same list the
                main picker already uses, just filtered to exclude this nucleus. */}
            <div className="field-grid-2">
              {permissions.canChangeIdentity ? (
                <div className="field">
                  <label>Parent Nucleus</label>
                  <input
                    list="parent-nucleus-options"
                    value={form.parentNucleus}
                    onChange={e => set('parentNucleus', e.target.value)}
                    onBlur={() => commitParentNucleus('Parent Nucleus')}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  />
                  <datalist id="parent-nucleus-options">
                    {allNucleusNames.filter(n => n !== row.nucleus).map(n => <option key={n} value={n} />)}
                  </datalist>
                </div>
              ) : (
                <Field label="Parent Nucleus" value={form.parentNucleus} readonly />
              )}
            </div>
            {/* Confirmed with cluster-notebook directly, 2026-10-08: permissions
                follow nesting, so a pocket's own location doesn't affect whether
                its parent's people can reach it. SRP sums only happen at a
                Setting -- a pocket can no longer have "no location" at all
                (commit c40fb54, same day, superseding their own earlier advice to
                leave it empty), so the way to keep a pocket's counts out of SRP
                sums now is to place it at the Cluster or a Locality specifically,
                never the same Setting as its parent. Surfaced proactively whenever
                a parent is set, not only once it's "wrong". */}
            {form.parentNucleus && (
              <p style={{ fontSize: 12, color: '#718096', margin: '4px 0 0' }}>
                This nucleus has a parent — give it the Cluster or a Locality (not a Setting) unless its counts should add to a neighbourhood separately.
              </p>
            )}
            {/* Setting-level Type is read-only above for everyone, but only the
                people who could otherwise edit it need telling why. */}
            {permissions.canChangeIdentity && form.locationType === 'SETTING' && (
              <p style={{ fontSize: 12, color: '#718096', margin: '4px 0 0' }}>
                This nucleus is at a Setting, so its type is fixed to Neighborhood. Move it to a Locality or the Cluster to set Network or Population instead.
              </p>
            )}
            {locationWarning && (
              <p style={{ fontSize: 12, color: '#975a16', background: '#fffaf0', border: '1px solid #f6e05e', borderRadius: 6, padding: '6px 10px', margin: '4px 0 0' }}>
                {locationWarning}
              </p>
            )}
          </div>}
        </div>

        {/* Overview (formerly "Workers & Prevalence"). Restructured 2026-10-07: all
            nine fields are now independently editable, hand-entered estimates
            synced both ways with SRP -- confirmed with cluster-notebook directly.
            Previously Participating/In Educational Activity/Facilitating Educational
            Activity were computed from the Activities card's totals, and Promoting/
            Helping Others/Accompanying were read off our own role-assignment lists
            (promoter/protagonist/accompanier workers) -- both approaches are gone
            now, deliberately: SRP itself only stores numbers, never names, so a
            count derived from our own lists could never round-trip with it. The role
            lists themselves are untouched and still reachable via each field's
            clickable label (for naming specific individuals) -- that's now fully
            decoupled from the number shown, which the user enters directly instead.
            Total Population moved here from the Population card below, as the first
            of the nine (it was already a NucleusPatch field, just newly SRP-synced). */}
        <div className="card">
          <div
            className="card-header"
            onClick={() => setOverviewOpen(o => !o)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <span><span style={{ fontSize: 11, marginRight: 6 }}>{overviewOpen ? '▼' : '▶'}</span>Overview</span>
          </div>
          {overviewOpen && <div className="card-body">
            <div className="field-grid-3">
              <Field label="Total Population" value={form.totalPop} onChange={v => set('totalPop', v)} onBlur={() => commitField('totalPop', 'Total Population', true)} readonly={!canWrite} integer />
              <Field
                label="In Conversation"
                value={form.inConversation} onChange={v => set('inConversation', v)} onBlur={() => commitField('inConversation', 'In Conversation', true)} readonly={!canWrite} integer
                info="Estimated number of individuals with whom there is some contact or conversation in the neighborhood, but who do not yet participate regularly in activities or collective spaces."
              />
              <Field
                label="Participating"
                value={form.inCommunityActivities} onChange={v => set('inCommunityActivities', v)} onBlur={() => commitField('inCommunityActivities', 'Participating', true)} readonly={!canWrite} integer
                info="Estimated number of individuals who participate with some regularity in collective spaces in the neighborhood, such as devotional meetings, family groups, neighborhood gatherings, festivals, community gatherings, Bahá’í holy days, or neighborhood Feasts, and home visits."
              />
            </div>
            <div className="field-grid-3">
              {/* Promoting/Helping Others/Accompanying still open their role list on
                  a label click (naming specific individuals), entirely independent
                  of the number itself now -- see this card's own comment above. */}
              <Field
                label="Promoting"
                value={form.protagonists} onChange={v => set('protagonists', v)} onBlur={() => commitField('protagonists', 'Promoting', true)} readonly={!canWrite} integer
                onLabelClick={permissions.canAssignRoles ? () => setShowPromotersModal(true) : undefined}
                info="Estimated number of individuals promoting various aspects of community life such as parents encouraging participation, junior youth bringing friends, or youth inviting peers. It also includes promoting collective spaces such as festivals, Summer of Service, family gatherings, and various logistical assistance such as providing food, giving rides, serving others, etc."
              />
              <Field
                label="Hosting Devotional Gatherings"
                value={form.devotionalHosts} onChange={v => set('devotionalHosts', v)} onBlur={() => commitField('devotionalHosts', 'Hosting Devotional Gatherings', true)} readonly={!canWrite} integer
                info="Estimated number of individuals who are sharing prayers with others, with family members, and inviting others to attend devotional meetings or gatherings. Examples include where prayers are shared in home visits, community gatherings, festivals, and educational activities."
              />
              <Field
                label="In Educational Activity"
                value={form.inEducationalActivities} onChange={v => set('inEducationalActivities', v)} onBlur={() => commitField('inEducationalActivities', 'In Educational Activity', true)} readonly={!canWrite} integer
                info="Estimated number of children, junior youth, youth, and adults participating in educational activities in various modalities and forms: children’s classes, junior youth groups, and study circles."
              />
            </div>
            <div className="field-grid-3">
              <Field
                label="Facilitating Educational Activity"
                value={form.educationalFacilitators} onChange={v => set('educationalFacilitators', v)} onBlur={() => commitField('educationalFacilitators', 'Facilitating Educational Activity', true)} readonly={!canWrite} integer
                info="Estimated number of individuals who facilitate or share the content of the institute’s educational programs, in various forms, approaches, methods, and modalities, to all ages in the neighborhood."
              />
              <Field
                label="Helping Others"
                value={form.helpingOthers} onChange={v => set('helpingOthers', v)} onBlur={() => commitField('helpingOthers', 'Helping Others', true)} readonly={!canWrite} integer
                onLabelClick={permissions.canAssignRoles ? () => setShowProtagonistsModal(true) : undefined}
                info="Estimated number of individuals who assist others in taking initial steps in serving others. For example, one may walk with another to do home visits, to share a prayer, to learn a quotation, to introduce the institute’s programs, or other acts of service."
              />
              <Field
                label="Accompanying"
                value={form.accompanying} onChange={v => set('accompanying', v)} onBlur={() => commitField('accompanying', 'Accompanying', true)} readonly={!canWrite} integer
                onLabelClick={permissions.canAssignRoles && permissions.assignableRoles.includes('accompanier') ? () => setShowAccompaniersModal(true) : undefined}
                info="Estimated number of individuals who have gained a measure of experience from the institute’s courses alongside acts of service, whose actions are motivated by a desire to see capacity develop in others and to foster friendships founded on cooperation and reciprocity."
              />
            </div>
            {/* Moved here from the Families card, 2026-10-08. */}
            <div className="field">
              <label>Makeup of Population</label>
              <textarea value={form.makeup || ''} onChange={e => set('makeup', e.target.value)} onBlur={() => commitField('makeup', 'Makeup of Population')} readOnly={!canWrite} />
            </div>
          </div>}
        </div>

        {/* Families (formerly "Population" -- now households only, 2026-10-08:
            Individuals Connected removed, Total Population and Makeup of Population
            moved to the Overview card) */}
        <div className="card">
          <div
            className="card-header"
            onClick={() => setFamiliesOpen(o => !o)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <span><span style={{ fontSize: 11, marginRight: 6 }}>{familiesOpen ? '▼' : '▶'}</span>Families</span>
          </div>
          {familiesOpen && <div className="card-body">
            <div className="field-grid-2">
              {/* Total Population moved to the Overview card, 2026-10-07 -- see its own comment there. */}
              <Field label="Total Households" value={form.totalHH}  onChange={v => set('totalHH', v)} onBlur={() => commitField('totalHH', 'Total Households', true)} readonly={!canWrite} integer />
              {/* Individuals Connected (indNum/connectedPopulation) removed 2026-10-08 --
                  meaningless now that the Overview card's "In Conversation" field covers
                  the same idea with real SRP sync. The underlying cluster-notebook field
                  (connectedPopulation) is untouched -- just no longer shown/edited here. */}
              <PairField
                label="Households Connected"
                info="Number of households where at least one person is engaged in a conversation about the Faith, participating, serving, and/or accompanying others."
                numVal={form.hhNum} pctVal={computedPct(form.hhNum, form.totalHH)}
                onNumChange={v => set('hhNum', v)} onNumBlur={() => commitField('hhNum', 'Households Connected', true)} readonly={!canWrite} pctReadonly numInteger
              />
            </div>
          </div>}
        </div>

        {/* Concentric Circles -- one card showing any of the three diagram types,
            switched via the small buttons below (moved here from the page header,
            2026-10-08, where each used to open its own full-screen modal instead). */}
        <div className="card">
          <div
            className="card-header"
            onClick={() => setDiagramCardOpen(o => !o)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <span><span style={{ fontSize: 11, marginRight: 6 }}>{diagramCardOpen ? '▼' : '▶'}</span>Concentric Circles</span>
          </div>
          {diagramCardOpen && (
            <div className="card-body">
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {([
                  ['simple', IcoDiagram, 'Concentric Circles'],
                  ['aligned', IcoDiagram2, 'Concentric Circles (Aligned)'],
                  ['staggered', IcoDiagram3, 'Concentric Circles (Staggered)'],
                ] as const).map(([type, Icon, title]) => {
                  const active = diagramType === type;
                  return (
                    <button
                      key={type}
                      onClick={e => { e.stopPropagation(); setDiagramType(type); }}
                      title={title} aria-label={title}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        color: active ? '#2b6cb0' : '#a0aec0',
                        background: active ? '#ebf8ff' : 'none',
                        border: `1px solid ${active ? '#90cdf4' : '#e2e8f0'}`,
                        borderRadius: 6, padding: '5px 7px', cursor: 'pointer',
                      }}
                    >
                      <Icon />
                    </button>
                  );
                })}
              </div>
              {diagramType === 'simple' && <ConcentricDiagram data={diagramData} />}
              {diagramType === 'aligned' && <AlignedConcentricDiagram rings={alignedRings} residing={alignedResiding} />}
              {diagramType === 'staggered' && <StaggeredConcentricDiagram labels={staggeredLabels} />}
            </div>
          )}
        </div>

        {/* Activities */}
        <div className="card">
          <div
            className="card-header"
            onClick={() => setActivitiesOpen(o => !o)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <span><span style={{ fontSize: 11, marginRight: 6 }}>{activitiesOpen ? '▼' : '▶'}</span>Educational Activities &amp; Devotionals</span>
          </div>
          {activitiesOpen && <div className="card-body">
            <div className="sync-note">
              Numbers come from cluster-notebook. Amber rows are manually overridden.
            </div>
            <div className="act-table-wrap">
              <table className="act-table">
                <thead>
                  <tr>
                    <th className="left">Activity</th>
                    <th>Number</th><th>Participants</th><th>Friends of the Faith</th>
                  </tr>
                </thead>
                <tbody>
                  <ActRow label="Children's Classes" userVals={form.activities.ccs} readonly={!canWrite}
                    onChange={(f, v) => setAct('ccs', f, v)} onBlur={f => commitActField('ccs', f, "Children's Classes")} />
                  <ActRow label="Junior Youth Groups" userVals={form.activities.jygs} readonly={!canWrite}
                    onChange={(f, v) => setAct('jygs', f, v)} onBlur={f => commitActField('jygs', f, 'Junior Youth Groups')} />
                  <ActRow label="Study Circles" userVals={form.activities.scs} readonly={!canWrite}
                    onChange={(f, v) => setAct('scs', f, v)} onBlur={f => commitActField('scs', f, 'Study Circles')} />
                  <TotalRow label="Total Educational Activities" totals={edTotal} />
                  <ActRow label="Devotional Gatherings" userVals={form.activities.devotionals} readonly={!canWrite} highlightOverrides={false}
                    onChange={(f, v) => setAct('devotionals', f, v)} onBlur={f => commitActField('devotionals', f, 'Devotional Gatherings')} />
                  <TotalRow label="Total Activities" totals={allTotal} />
                </tbody>
              </table>
            </div>
          </div>}
        </div>

        {/* Additional Details */}
        <div className="card">
          <div
            className="card-header"
            onClick={() => setDetailsOpen(o => !o)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <span><span style={{ fontSize: 11, marginRight: 6 }}>{detailsOpen ? '▼' : '▶'}</span>Additional Details</span>
          </div>
          {detailsOpen && <div className="card-body">
            <div className="detail-grid">
              <ToggleItem label="Social Action" value={form.presence} notes={form.notesPresence} readonly={!canWrite}
                onToggle={v => setAndSave('presence', v, { presence: v }, 'Social Action')}
                onNotes={v => set('notesPresence', v)} onNotesBlur={() => commitField('notesPresence', 'Social Action notes')}
                info="Efforts aimed at improving an aspect of the social or economic life of the population, however modest or informal." />
              <ToggleItem label="Regular Gatherings / Festivals" value={form.gatherings} notes={form.notesGatherings} readonly={!canWrite}
                onToggle={v => setAndSave('gatherings', v, { gatherings: v }, 'Regular Gatherings / Festivals')}
                onNotes={v => set('notesGatherings', v)} onNotesBlur={() => commitField('notesGatherings', 'Regular Gatherings / Festivals notes')}
                info="Well-prepared community gatherings, camps, festivals, service projects, arts endeavours, and collective teaching initiatives that occur regularly, each according to its own rhythm, and with increasing frequency." />
            </div>
          </div>}
        </div>

        {/* Narrative */}
        <div className="card">
          <div
            className="card-header"
            onClick={() => setNarrativeOpen(o => !o)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <span><span style={{ fontSize: 11, marginRight: 6 }}>{narrativeOpen ? '▼' : '▶'}</span>Narrative</span>
          </div>
          {narrativeOpen && <div className="card-body">
            <div className="field">
              <textarea
                value={form.narrative || ''}
                onChange={canWrite ? e => set('narrative', e.target.value) : undefined}
                onBlur={canWrite ? () => commitField('narrative', 'Narrative') : undefined}
                readOnly={!canWrite}
                rows={6}
              />
            </div>
          </div>}
        </div>

        {/* Manage Access — anyone cluster-notebook lets assign roles here */}
        {permissions.canAssignRoles && (
          <div className="card">
            <div
              className="card-header"
              onClick={() => setAccessOpen(o => !o)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <span><span style={{ fontSize: 11, marginRight: 6 }}>{accessOpen ? '▼' : '▶'}</span>Manage Access</span>
            </div>
            {accessOpen && (
              <div className="card-body">
                <ManageAccessCard nucleus={row.nucleus} />
              </div>
            )}
          </div>
        )}

        {/* Danger Zone — requires delete permission on this specific nucleus */}
        {permissions.canDelete && (
          <div className="card" style={{ borderColor: '#fed7d7' }}>
            <div
              className="card-header"
              onClick={() => setDangerOpen(o => !o)}
              style={{ cursor: 'pointer', userSelect: 'none', background: '#fff5f5', borderBottomColor: '#fed7d7', color: '#c53030' }}
            >
              <span><span style={{ fontSize: 11, marginRight: 6 }}>{dangerOpen ? '▼' : '▶'}</span>Danger Zone</span>
            </div>
            {dangerOpen && (
              <div className="card-body">
                <p style={{ fontSize: 13, color: '#744210', background: '#fffbeb', border: '1px solid #f6e05e', borderRadius: 6, padding: '8px 12px', margin: 0 }}>
                  Deleting a nucleus removes it immediately. This can&rsquo;t be undone here.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 4 }}>
                  <div className="field" style={{ flex: 1, margin: 0 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#c53030', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      Type &ldquo;{row.nucleus}&rdquo; to confirm
                    </label>
                    <input
                      type="text"
                      value={deleteInput}
                      onChange={e => { setDeleteInput(e.target.value); setDeleteError(null); }}
                      placeholder={row.nucleus}
                      style={{ fontSize: 13 }}
                    />
                  </div>
                  <button
                    disabled={deleting || deleteInput !== row.nucleus}
                    onClick={async () => {
                      setDeleting(true);
                      setDeleteError(null);
                      try {
                        const res = await fetch(`/api/nucleus?name=${encodeURIComponent(row.nucleus)}`, { method: 'DELETE' });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Delete failed');
                        onBack();
                      } catch (e: unknown) {
                        setDeleteError(e instanceof Error ? e.message : 'Delete failed');
                      } finally {
                        setDeleting(false);
                      }
                    }}
                    style={{
                      fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 6, border: 'none',
                      background: deleteInput === row.nucleus ? '#c53030' : '#a0aec0',
                      color: 'white', cursor: deleteInput === row.nucleus ? 'pointer' : 'default',
                      whiteSpace: 'nowrap', alignSelf: 'flex-end', marginBottom: 1,
                    }}
                  >
                    {deleting ? 'Deleting…' : 'Delete nucleus'}
                  </button>
                </div>
                {deleteError && <div style={{ fontSize: 13, color: '#c53030', marginTop: 4 }}>{deleteError}</div>}
              </div>
            )}
          </div>
        )}
      </div>

      {showAccompaniersModal && (
        <WorkerListModal
          title="Accompanying"
          role="accompanier"
          nucleus={row.nucleus}
          workers={accompanierNames}
          onChange={workers => setAccompanierNames(workers)}
          onClose={() => setShowAccompaniersModal(false)}
        />
      )}

      {showProtagonistsModal && (
        <WorkerListModal
          title="Helping Others"
          role="protagonist"
          nucleus={row.nucleus}
          workers={protagonistNames}
          importWorkers={accompanierNames}
          onChange={workers => setProtagonistNames(workers)}
          onClose={() => setShowProtagonistsModal(false)}
        />
      )}

      {showAbmAssistantModal && (
        <WorkerListModal
          title="ABm Assistant"
          role="abm-assistant"
          nucleus={row.nucleus}
          workers={abmAssistantNames}
          onChange={workers => setAbmAssistantNames(workers)}
          onClose={() => setShowAbmAssistantModal(false)}
        />
      )}

      {showContactModal && (
        <WorkerListModal
          title="Contact"
          role="contact"
          nucleus={row.nucleus}
          workers={contactNames}
          single
          onChange={workers => setContactNames(workers)}
          onClose={() => setShowContactModal(false)}
        />
      )}

      {showPromotersModal && (
        <WorkerListModal
          title="Promoters"
          role="promoter"
          nucleus={row.nucleus}
          workers={promoterNames}
          onChange={workers => setPromoterNames(workers)}
          onClose={() => setShowPromotersModal(false)}
        />
      )}

      <div className="footer">
        <span className={`save-status${saveStatus.type !== 'idle' ? ` ${saveStatus.type}` : ''}`}>
          {saveStatus.msg}
        </span>
        {retry && <button className="btn-cancel" onClick={() => retry.run()}>Retry</button>}
      </div>
    </>
  );
}
