'use client';

import { useState, useCallback, useRef } from 'react';
import { NucleusDetail, NucleusRow, Activity } from '@/types';
import type { Role, Worker } from '@/types';
import WorkerListModal from './WorkerListModal';
import AccessPanel from './AccessPanel';

interface Props {
  detail: NucleusDetail;
  role: Role;
  roleMap: Record<string, Role>;
  email: string;
  showBack: boolean;
  onBack: () => void;
  onSaved: (savedBy: string, savedAt: string) => void;
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

function Field({ label, value, onChange, onBlur, readonly, type, integer, onLabelClick, highlighted, onSync, fromSheet }: {
  label: string; value: string; onChange?: (v: string) => void; onBlur?: () => void; readonly?: boolean; type?: string; integer?: boolean;
  onLabelClick?: () => void; highlighted?: boolean; onSync?: () => void; fromSheet?: boolean;
}) {
  const hasError = integer && !readonly && !isValidInt(value);
  const cls = [readonly ? 'ro' : '', hasError ? 'error' : '', highlighted ? 'overridden' : ''].filter(Boolean).join(' ');
  return (
    <div className={`field${fromSheet ? ' from-sheet' : ''}`}>
      {onLabelClick
        ? <label onClick={onLabelClick} style={{ cursor: 'pointer', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{label} <IcoList /></label>
        : <label>{label}</label>
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

function PairField({ label, numVal, pctVal, onNumChange, onNumBlur, readonly, pctReadonly, numInteger, fromSheet }: {
  label: string; numVal: string; pctVal: string;
  onNumChange: (v: string) => void; onNumBlur?: () => void; readonly?: boolean; pctReadonly?: boolean; numInteger?: boolean; fromSheet?: boolean;
}) {
  const hasError = numInteger && !readonly && !isValidInt(numVal);
  return (
    <div className={`pair-field${fromSheet ? ' from-sheet' : ''}`}>
      <label>{label}</label>
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
function ActRow({ label, userVals, onChange, onBlur, readonly }: {
  label: string;
  userVals: Activity;
  onChange: (field: ActivityNumericField, v: string) => void;
  onBlur: (field: ActivityNumericField) => void;
  readonly?: boolean;
}) {
  const highlighted = !!userVals.isOverridden;

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

function ToggleItem({ label, value, notes, onToggle, onNotes, onNotesBlur, readonly }: {
  label: string; value: string; notes: string;
  onToggle: (v: string) => void; onNotes: (v: string) => void; onNotesBlur?: () => void; readonly?: boolean;
}) {
  const isYes = (value || '').toLowerCase() === 'yes';
  const isNo  = !isYes;
  return (
    <div className="detail-item">
      <div className="q">{label}</div>
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

function formatNum(v: string): string {
  const n = parseInt(v, 10);
  if (!v || isNaN(n)) return '____';
  if (n < 1000) return String(n);
  if (n < 100000) {
    const k = n / 1000;
    return (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'k';
  }
  return Math.round(n / 1000) + 'k';
}

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

type AlignedLabel = { label: string; value: string; onClick?: () => void };
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

export default function DetailView({ detail, role, roleMap, email, showBack, onBack, onSaved }: Props) {
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
  const [lastUpdatedBy, setLastUpdatedBy] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [showDiagram, setShowDiagram] = useState(false);
  const [showDiagram2, setShowDiagram2] = useState(false);
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
  const [accessOpen, setAccessOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canWrite       = role === 'read-write' || role === 'collaborator' || role === 'admin';
  const isAdmin        = role === 'admin';
  const canManageAccess = role === 'admin' || role === 'collaborator';

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
      setLastUpdatedBy(data.savedBy || email);
      setLastUpdatedAt(data.savedAt || new Date().toISOString());
      onSaved(data.savedBy || email, data.savedAt || new Date().toISOString());
      return { ok: true as const, activities: data.activities as FormState['activities'] | undefined };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setSaveStatus({ msg: `Failed to save ${label}: ${message}`, type: 'error' });
      return { ok: false as const };
    } finally {
      setSaving(false);
    }
  }

  // Blur/Enter-triggered fields: totalPop, totalHH, indNum, hhNum, makeup,
  // notesPresence, notesGatherings, narrative. Skips the request entirely if the value
  // hasn't changed since the last successful save, or (for integer fields) is invalid --
  // an invalid number is never sent, and doesn't block saving any other field.
  type TextFieldKey = 'totalPop' | 'totalHH' | 'indNum' | 'hhNum' | 'makeup' | 'notesPresence' | 'notesGatherings' | 'narrative';
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

  // Activities: blur/Enter-triggered, per sub-field (act/part/fof independently) --
  // updateActivitySummary's fields are each independently optional, so a blur on just
  // "Number" sends only {number}, never resending untouched participants/fof.
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

  const actKeys = ['ccs', 'jygs', 'scs', 'devotionals'] as const;
  const hasAnyActPart = actKeys.some(k => form.activities[k].part !== '');
  // "Helping" here (relabeled from "Sustaining") is still the protagonist role --
  // this simpler 5-ring diagram has no slot for Promoting (the newer promoter role)
  // or Facilitating, unlike the aligned diagram below.
  const diagramData = [
    { label: 'Residing',      value: form.totalPop },
    { label: 'Connected',     value: form.indNum },
    { label: 'Participating', value: hasAnyActPart ? String(allTotal.part) : '' },
    { label: 'Helping',       value: String(protagonistNames.length), onClick: () => setShowProtagonistsModal(true) },
    { label: 'Accompanying',  value: String(accompanierNames.length), onClick: () => setShowAccompaniersModal(true) },
  ];

  const alignedResiding = { label: 'Residing', value: form.totalPop };
  // Redefined 2026-09-14 to match the Overview card: Promoting is the promoter role
  // (was mistakenly the protagonist role), Helping is the protagonist role (was
  // empty), Facilitating is the summed facilitators count (was empty), In core
  // activity is the educational-activities participant total (was empty).
  const alignedRings: AlignedRingContent[] = [
    { single: { label: 'In conversation', value: form.indNum } },
    {
      right: { label: 'In core activity', value: String(edTotal.part) },
      left:  { label: 'Participating',    value: hasAnyActPart ? String(allTotal.part) : '' },
    },
    {
      right: { label: 'Facilitating', value: form.facilitatorsCount },
      left:  { label: 'Promoting',    value: String(promoterNames.length), onClick: () => setShowPromotersModal(true) },
    },
    {
      right: { label: 'Accompanying', value: String(accompanierNames.length), onClick: () => setShowAccompaniersModal(true) },
      left:  { label: 'Helping',      value: String(protagonistNames.length), onClick: () => setShowProtagonistsModal(true) },
    },
  ];

  const updatedLine = lastUpdatedAt
    ? `Last saved by ${lastUpdatedBy} on ${new Date(lastUpdatedAt).toLocaleString()}`
    : '';

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
          {showBack && <button className="back-btn" onClick={handleBack}>← Back</button>}
          <div style={{ minWidth: 0 }}>
            <h1>{row.nucleus}</h1>
            <div className="meta">{row.clusterCode} · {row.cluster} · {row.locality}</div>
            {updatedLine && <div className="last-updated">{updatedLine}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={() => setShowDiagram(true)} title="Concentric Circles" aria-label="Concentric Circles" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.7)', background: 'none', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '5px 7px', cursor: 'pointer' }}>
            <IcoDiagram />
          </button>
          <button onClick={() => setShowDiagram2(true)} title="Concentric Circles (Aligned)" aria-label="Concentric Circles (Aligned)" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.7)', background: 'none', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '5px 7px', cursor: 'pointer' }}>
            <IcoDiagram2 />
          </button>
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
              {/* Locality is read-only everywhere: cluster-notebook derives it from
                  Nucleus.location's own containment chain, and has no write path for
                  it (removed from NucleusPatch 2026-09-13) — not an admin-permission
                  distinction like the other Identity fields. Nucleus (the name itself)
                  is read-only: cluster-notebook's own name is now the canonical identifier
                  (2026-09-13, the user directly) and cluster-notebook has no rename
                  mutation — an edit here would silently revert on next load. Set once, at
                  creation time, via CreateNucleusModal, 2026-09-14. */}
              <Field label="Locality" value={form.locality} readonly />
              <Field label="Nucleus" value={form.nucleus} readonly />
              {isAdmin
                ? <SelectField label="Type" value={form.nucleusType} options={TYPE_OPTIONS} onChange={v => setAndSave('nucleusType', v, { identity: { nucleusType: v } }, 'Type')} />
                : <Field label="Type" value={form.nucleusType} readonly />
              }
              {isAdmin
                ? <SelectField label="Stage" value={form.stage} options={STAGE_OPTIONS} onChange={v => setAndSave('stage', v, { stage: v }, 'Stage')} />
                : <Field label="Stage" value={form.stage} readonly />
              }
            </div>
            <div className="field-grid-4">
              <Field
                label="Contact"
                value={contactNames[0]?.name ?? ''}
                readonly
                onLabelClick={isAdmin ? () => setShowContactModal(true) : undefined}
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
                onLabelClick={isAdmin ? () => setShowAbmAssistantModal(true) : undefined}
              />
            </div>
          </div>}
        </div>

        {/* Overview (formerly "Workers & Prevalence"). Mixed-source now: Helpers/
            Accompanying are still Sheet-sourced free-text counts, Facilitating Core
            Activity is cluster-notebook-sourced, Participating/In Core Activity are
            computed totals from the Activities card. All three of Promoting/Helping/
            Accompanying are cluster-notebook role lists now (2026-09-14) -- no more
            hand-typed counts, no more Sheet writes for any field in this card, so the
            fromSheet marker is gone entirely (was already gone from the card wrapper;
            now gone from the two remaining fields that still had it, too). */}
        <div className="card">
          <div className="card-header">Overview</div>
          <div className="card-body">
            <div className="field-grid-3">
              {/* Copied from the Activities card's totals, not independently entered --
                  same non-editable treatment as Facilitating Core Activity below. */}
              <Field label="Participating" value={String(allTotal.part)} readonly />
              {/* Promoting/Helping/Accompanying show a count, not the name list --
                  these can be large; unlike Contact (a singleton, shows the name
                  directly), a name list here wouldn't scale. Click the label to see
                  or edit the actual names in the modal. */}
              <Field
                label="Promoting"
                value={String(promoterNames.length)}
                readonly
                onLabelClick={() => setShowPromotersModal(true)}
              />
              <Field
                label="Helping"
                value={String(protagonistNames.length)}
                readonly
                onLabelClick={() => setShowProtagonistsModal(true)}
              />
            </div>
            <div className="field-grid-3">
              <Field label="In Core Activity" value={String(edTotal.part)} readonly />
              <Field label="Facilitating Core Activity" value={form.facilitators} readonly />
              <Field
                label="Accompanying"
                value={String(accompanierNames.length)}
                readonly
                onLabelClick={() => setShowAccompaniersModal(true)}
              />
            </div>
          </div>
        </div>

        {/* Population */}
        <div className="card">
          <div className="card-header">Population</div>
          <div className="card-body">
            <div className="field-grid-2">
              <Field label="Total Population" value={form.totalPop} onChange={v => set('totalPop', v)} onBlur={() => commitField('totalPop', 'Total Population', true)} readonly={!canWrite} integer />
              <Field label="Total Households" value={form.totalHH}  onChange={v => set('totalHH', v)} onBlur={() => commitField('totalHH', 'Total Households', true)} readonly={!canWrite} integer />
            </div>
            <div className="field-grid-2">
              <PairField
                label="Individuals Connected"
                numVal={form.indNum} pctVal={computedPct(form.indNum, form.totalPop)}
                onNumChange={v => set('indNum', v)} onNumBlur={() => commitField('indNum', 'Individuals Connected', true)} readonly={!canWrite} pctReadonly numInteger
              />
              <PairField
                label="Households Connected"
                numVal={form.hhNum} pctVal={computedPct(form.hhNum, form.totalHH)}
                onNumChange={v => set('hhNum', v)} onNumBlur={() => commitField('hhNum', 'Households Connected', true)} readonly={!canWrite} pctReadonly numInteger
              />
            </div>
            <div className="field">
              <label>Makeup of Population</label>
              <textarea value={form.makeup || ''} onChange={e => set('makeup', e.target.value)} onBlur={() => commitField('makeup', 'Makeup of Population')} readOnly={!canWrite} />
            </div>
          </div>
        </div>

        {/* Activities */}
        <div className="card">
          <div className="card-header">
            Educational Activities &amp; Devotionals
          </div>
          <div className="card-body">
            <div className="sync-note">
              Numbers come from cluster-notebook. Amber rows are manually overridden rather than SRP-derived.
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
                  <ActRow label="Devotional Gatherings" userVals={form.activities.devotionals} readonly={!canWrite}
                    onChange={(f, v) => setAct('devotionals', f, v)} onBlur={f => commitActField('devotionals', f, 'Devotional Gatherings')} />
                  <TotalRow label="Total Activities" totals={allTotal} />
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Additional Details */}
        <div className="card">
          <div className="card-header">Additional Details</div>
          <div className="card-body">
            <div className="detail-grid">
              <ToggleItem label="Social Action" value={form.presence} notes={form.notesPresence} readonly={!canWrite}
                onToggle={v => setAndSave('presence', v, { presence: v }, 'Social Action')}
                onNotes={v => set('notesPresence', v)} onNotesBlur={() => commitField('notesPresence', 'Social Action notes')} />
              <ToggleItem label="Regular Gatherings / Festivals" value={form.gatherings} notes={form.notesGatherings} readonly={!canWrite}
                onToggle={v => setAndSave('gatherings', v, { gatherings: v }, 'Regular Gatherings / Festivals')}
                onNotes={v => set('notesGatherings', v)} onNotesBlur={() => commitField('notesGatherings', 'Regular Gatherings / Festivals notes')} />
            </div>
          </div>
        </div>

        {/* Narrative */}
        <div className="card">
          <div className="card-header">Narrative</div>
          <div className="card-body">
            <div className="field">
              <textarea
                value={form.narrative || ''}
                onChange={canWrite ? e => set('narrative', e.target.value) : undefined}
                onBlur={canWrite ? () => commitField('narrative', 'Narrative') : undefined}
                readOnly={!canWrite}
                rows={6}
              />
            </div>
          </div>
        </div>

        {/* Manage Access — collaborator and admin */}
        {canManageAccess && (
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
                <AccessPanel nucleus={row.nucleus} roleMap={roleMap} />
              </div>
            )}
          </div>
        )}

        {/* Danger Zone — admin only */}
        {isAdmin && (
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

      {showDiagram && (
        <div
          onClick={() => setShowDiagram(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, padding: '20px 24px', maxWidth: 560, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#2d3748' }}>{row.nucleus}</div>
                <div style={{ fontSize: 11, color: '#718096', marginTop: 2 }}>{row.clusterCode} · {row.cluster} · {row.locality}</div>
              </div>
              <button onClick={() => setShowDiagram(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#718096', lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <ConcentricDiagram data={diagramData} />
          </div>
        </div>
      )}

      {showDiagram2 && (
        <div
          onClick={() => setShowDiagram2(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, padding: '20px 24px', maxWidth: 560, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#2d3748' }}>{row.nucleus}</div>
                <div style={{ fontSize: 11, color: '#718096', marginTop: 2 }}>{row.clusterCode} · {row.cluster} · {row.locality}</div>
              </div>
              <button onClick={() => setShowDiagram2(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#718096', lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <AlignedConcentricDiagram rings={alignedRings} residing={alignedResiding} />
          </div>
        </div>
      )}

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
          title="Helping"
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
