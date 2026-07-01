'use client';

import { useState, useCallback } from 'react';
import { NucleusDetail, NucleusRow, Activity, SrpData } from '@/types';
import type { Role } from '@/types';
import NamedListModal from './NamedListModal';
import AccessPanel from './AccessPanel';

interface Props {
  detail: NucleusDetail;
  role: Role;
  roleMap: Record<string, Role>;
  email: string;
  showBack: boolean;
  spreadsheetUrl: string;
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

function actTotal(acts: (Activity | undefined)[]) {
  return acts.reduce((acc, a) => ({
    act:  acc.act  + parseInt((a?.act  || '0'), 10),
    part: acc.part + parseInt((a?.part || '0'), 10),
    fof:  acc.fof  + parseInt((a?.fof  || '0'), 10),
  }), { act: 0, part: 0, fof: 0 });
}

function Field({ label, value, onChange, readonly, type, integer, onLabelClick, highlighted, onSync }: {
  label: string; value: string; onChange?: (v: string) => void; readonly?: boolean; type?: string; integer?: boolean;
  onLabelClick?: () => void; highlighted?: boolean; onSync?: () => void;
}) {
  const hasError = integer && !readonly && !isValidInt(value);
  const cls = [readonly ? 'ro' : '', hasError ? 'error' : '', highlighted ? 'overridden' : ''].filter(Boolean).join(' ');
  return (
    <div className="field">
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

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value || ''} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
      </select>
    </div>
  );
}

function PairField({ label, numVal, pctVal, onNumChange, pctReadonly, numInteger }: {
  label: string; numVal: string; pctVal: string;
  onNumChange: (v: string) => void; pctReadonly?: boolean; numInteger?: boolean;
}) {
  const hasError = numInteger && !isValidInt(numVal);
  return (
    <div className="pair-field">
      <label>{label}</label>
      <div className="pair-inputs">
        <input type="text" value={numVal || ''} placeholder="#" className={hasError ? 'error' : undefined} onChange={e => onNumChange(e.target.value)} />
        <input type="text" value={pctVal || ''} placeholder="%" className={`pct${pctReadonly ? ' ro' : ''}`} readOnly={pctReadonly} />
      </div>
    </div>
  );
}

function ActRow({ label, userVals, srpVals, onChange, onReset }: {
  label: string;
  userVals: Activity;
  srpVals: Activity | null;
  onChange: (field: keyof Activity, v: string) => void;
  onReset: () => void;
}) {
  const actDiffers  = srpVals !== null && (userVals.act  || '') !== (srpVals.act  || '');
  const partDiffers = srpVals !== null && (userVals.part || '') !== (srpVals.part || '');
  const fofDiffers  = srpVals !== null && (userVals.fof  || '') !== (srpVals.fof  || '');
  const anyDiffers  = actDiffers || partDiffers || fofDiffers;
  const srpText = srpVals ? `${srpVals.act} / ${srpVals.part} / ${srpVals.fof}` : 'not in SRP';

  function cls(differs: boolean, val: string) {
    return [differs ? 'overridden' : '', !isValidInt(val) ? 'error' : ''].filter(Boolean).join(' ') || undefined;
  }

  return (
    <tr>
      <td className="row-label" style={{ textAlign: 'right', paddingLeft: 4, paddingRight: 10 }}>{label}</td>
      <td><input type="text" value={userVals.act || ''} className={cls(actDiffers, userVals.act)} onChange={e => onChange('act', e.target.value)} /></td>
      <td><input type="text" value={userVals.part || ''} className={cls(partDiffers, userVals.part)} onChange={e => onChange('part', e.target.value)} /></td>
      <td><input type="text" value={userVals.fof || ''} className={cls(fofDiffers, userVals.fof)} onChange={e => onChange('fof', e.target.value)} /></td>
      <td className={`srp-cell${anyDiffers ? ' differs' : ''}`}>
        {srpText}
        {anyDiffers && <button className="reset-btn" onClick={onReset}>reset</button>}
      </td>
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
      <td className="srp-cell">—</td>
    </tr>
  );
}

function ToggleItem({ label, value, notes, onToggle, onNotes }: {
  label: string; value: string; notes: string;
  onToggle: (v: string) => void; onNotes: (v: string) => void;
}) {
  const isYes = (value || '').toLowerCase() === 'yes';
  const isNo  = !isYes;
  return (
    <div className="detail-item">
      <div className="q">{label}</div>
      <div className="toggle-row">
        <button className={`tb${isYes ? ' yes' : ''}`} onClick={() => onToggle('Yes')}>Yes</button>
        <button className={`tb${isNo ? ' no' : ''}`} onClick={() => onToggle('No')}>No</button>
      </div>
      <textarea value={notes || ''} onChange={e => onNotes(e.target.value)} />
    </div>
  );
}

const IcoDiagram = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="12" rx="10" ry="7"/><ellipse cx="12" cy="12" rx="5" ry="3.5"/>
  </svg>
);
const IcoExternalLink = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);
const IcoLogOut = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
const IcoSave = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
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

// Bounding box centered in 540×310 viewBox (70px h-margin, 55px v-margin each side).
// textY = top of ring at tx + 16, where top = cy - ry×√(1−((tx−cx)/rx)²)
// This places each label at a consistent distance below the ring's upper arc at its text x.
const RINGS = [
  { cx: 270, cy: 155, rx: 200, ry: 100, fill: '#dbeafe', textFill: '#1e3a8a', tx: 286, textY:  71 },
  { cx: 250, cy: 163, rx: 168, ry:  84, fill: '#bfdbfe', textFill: '#1e3a8a', tx: 266, textY:  95 },
  { cx: 230, cy: 171, rx: 136, ry:  68, fill: '#93c5fd', textFill: '#1e3a8a', tx: 246, textY: 119 },
  { cx: 210, cy: 179, rx: 104, ry:  52, fill: '#60a5fa', textFill: '#1e3a8a', tx: 226, textY: 144 },
  { cx: 190, cy: 187, rx:  72, ry:  36, fill: '#2563eb', textFill: '#ffffff', tx: 206, textY: 168 },
  { cx: 170, cy: 195, rx:  40, ry:  20, fill: '#1e3a8a', textFill: '#ffffff', tx: 186, textY: 193 },
];

function formatNum(v: string): string {
  const n = parseInt(v, 10);
  if (!v || isNaN(n)) return '—';
  if (n < 1000) return String(n);
  if (n < 100000) {
    const k = n / 1000;
    return (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'k';
  }
  return Math.round(n / 1000) + 'k';
}

function ConcentricDiagram({ data }: { data: { label: string; value: string }[] }) {
  return (
    <svg viewBox="0 0 540 310" style={{ width: '100%', display: 'block' }}>
      {RINGS.map((r, i) => (
        <ellipse key={i} cx={r.cx} cy={r.cy} rx={r.rx} ry={r.ry} fill={r.fill} stroke="white" strokeWidth={1.5} />
      ))}
      {RINGS.map((r, i) => (
        <text key={i} x={r.tx} y={r.textY} textAnchor="start" fontSize={12} fontWeight={600} fill={r.textFill}>
          {formatNum(data[i].value)} {data[i].label}
        </text>
      ))}
    </svg>
  );
}

export default function DetailView({ detail, role, roleMap, email, showBack, spreadsheetUrl, onBack, onSaved }: Props) {
  const { row, srp } = detail;
  const [form, setForm] = useState<FormState>(() => rowToForm(row));
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ msg: string; type: 'idle' | 'success' | 'error' }>({ msg: '', type: 'idle' });
  const [lastUpdatedBy, setLastUpdatedBy] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [showDiagram, setShowDiagram] = useState(false);
  const [accompanierNames, setAccompanierNames] = useState<string[]>(() => detail.accompanierNames);
  const [showAccompaniersModal, setShowAccompaniersModal] = useState(false);
  const [protagonistNames, setProtagonistNames] = useState<string[]>(() => detail.protagonistNames);
  const [showProtagonistsModal, setShowProtagonistsModal] = useState(false);
  const [abmAssistantNames, setAbmAssistantNames] = useState<string[]>(() => detail.abmAssistantNames);
  const [showAbmAssistantModal, setShowAbmAssistantModal] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  const canWrite       = role === 'read-write' || role === 'collaborator' || role === 'admin';
  const isAdmin        = role === 'admin';
  const canManageAccess = role === 'admin' || role === 'collaborator';
  const isReadOnly     = role === 'read';

  const set = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm(f => ({ ...f, [key]: val }));
    setIsDirty(true);
  }, []);

  const setAct = useCallback((actKey: keyof FormState['activities'], field: keyof Activity, val: string) => {
    setForm(f => ({ ...f, activities: { ...f.activities, [actKey]: { ...f.activities[actKey], [field]: val } } }));
    setIsDirty(true);
  }, []);

  const resetToSrp = useCallback((actKey: keyof SrpData) => {
    if (!srp || !srp[actKey as keyof SrpData]) return;
    const srpAct = srp[actKey as keyof SrpData] as Activity;
    if (actKey === 'facilitators') return;
    setForm(f => ({ ...f, activities: { ...f.activities, [actKey]: { ...srpAct } } }));
    setIsDirty(true);
  }, [srp]);

  async function handleSave() {
    setSaving(true);
    setSaveStatus({ msg: 'Saving...', type: 'idle' });
    try {
      const payload: Record<string, unknown> = { ...form };
      if (isAdmin) {
        payload.identity = {
          nucleus:        form.nucleus,
          parentNucleus:  form.parentNucleus,
          grouping:       form.grouping,
          cluster:        form.cluster,
          pg:             form.pg,
          clusterCode:    form.clusterCode,
          nucleusType:    form.nucleusType,
        };
      }
      const res = await fetch('/api/nucleus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: row.nucleus, formData: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSaveStatus({ msg: 'Saved successfully', type: 'success' });
      setIsDirty(false);
      setLastUpdatedBy(data.savedBy || email);
      setLastUpdatedAt(data.savedAt || new Date().toISOString());
      onSaved(data.savedBy || email, data.savedAt || new Date().toISOString());
    } catch (e: unknown) {
      setSaveStatus({ msg: `Save failed: ${e instanceof Error ? e.message : String(e)}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (isDirty && !confirm('Discard all unsaved changes?')) return;
    onBack();
  }

  function handleSignOut() {
    if (isDirty && !confirm('Discard all unsaved changes?')) return;
    window.location.href = '/signout';
  }

  function handleDiscard() {
    if (isDirty && !confirm('Discard all unsaved changes?')) return;
    setForm(rowToForm(row));
    setIsDirty(false);
    setSaveStatus({ msg: '', type: 'idle' });
  }

  const accompaniersMismatch = accompanierNames.length > 0 &&
    accompanierNames.length !== parseInt(form.accompaniers || '0', 10);
  const protagonistsMismatch = protagonistNames.length > 0 &&
    protagonistNames.length !== parseInt(form.protagonists || '0', 10);

  const edTotal  = actTotal([form.activities.ccs, form.activities.jygs, form.activities.scs]);
  const allTotal = actTotal([form.activities.ccs, form.activities.jygs, form.activities.scs, form.activities.devotionals]);

  const actKeys = ['ccs', 'jygs', 'scs', 'devotionals'] as const;
  const actVals = actKeys.flatMap(k => [form.activities[k].act, form.activities[k].part, form.activities[k].fof]);
  const hasIntErrors = [
    form.totalPop, form.totalHH, form.indNum, form.hhNum,
    form.protagonists, form.accompaniers,
    ...actVals,
  ].some(v => !isValidInt(v));

  const hasAnyActPart = actKeys.some(k => form.activities[k].part !== '');
  const diagramData = [
    { label: 'Residing',              value: form.totalPop },
    { label: 'Potential Connections', value: '' },
    { label: 'Connected',             value: form.indNum },
    { label: 'Participating',         value: hasAnyActPart ? String(allTotal.part) : '' },
    { label: 'Sustaining',            value: form.protagonists },
    { label: 'Accompanying',          value: form.accompaniers },
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
          <button onClick={() => setShowDiagram(true)} title="Concentric Circle" aria-label="Concentric Circle" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.7)', background: 'none', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '5px 7px', cursor: 'pointer' }}>
            <IcoDiagram />
          </button>
          <a href={spreadsheetUrl} target="_blank" rel="noopener noreferrer" title="Open spreadsheet" aria-label="Open spreadsheet" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '5px 7px', textDecoration: 'none' }}>
            <IcoExternalLink />
          </a>
          <button onClick={handleSignOut} title="Sign out" aria-label="Sign out" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.7)', background: 'none', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '5px 7px', cursor: 'pointer' }}>
            <IcoLogOut />
          </button>
          {!isReadOnly && (
            <button className="save-btn" disabled={saving || hasIntErrors} onClick={handleSave} title="Save to spreadsheet" aria-label="Save to spreadsheet" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 12px' }}>
              <IcoSave /><span className="save-btn-label">Save</span>
            </button>
          )}
        </div>
      </div>

      <div className="container">

        {/* Identity */}
        <div className="card">
          <div className="card-header">Identity</div>
          <div className="card-body">
            <div className="field-grid-4">
              <Field label="Grouping"     value={form.grouping}    onChange={isAdmin ? v => set('grouping', v)    : undefined} readonly={!isAdmin} />
              <Field label="Cluster Code" value={form.clusterCode} onChange={isAdmin ? v => set('clusterCode', v) : undefined} readonly={!isAdmin} />
              <Field label="Cluster"      value={form.cluster}     onChange={isAdmin ? v => set('cluster', v)     : undefined} readonly={!isAdmin} />
              <Field label="PG"           value={form.pg}          onChange={isAdmin ? v => set('pg', v)          : undefined} readonly={!isAdmin} />
            </div>
            <div className="field-grid-4">
              <Field label="Locality"         value={form.locality}     onChange={isAdmin ? v => set('locality', v)     : undefined} readonly={!isAdmin} />
              <Field label="Nucleus / Pocket" value={form.nucleus}      onChange={isAdmin  ? v => set('nucleus', v)      : undefined} readonly={!isAdmin} />
              <Field label="Type"             value={form.nucleusType}  onChange={isAdmin  ? v => set('nucleusType', v)  : undefined} readonly={!isAdmin} />
              <Field label="Stage"            value={form.stage}        onChange={isAdmin ? v => set('stage', v)        : undefined} readonly={!isAdmin} />
            </div>
            <div className="field-grid-4">
              <Field label="Contact"                   value={form.contact}  onChange={isAdmin ? v => set('contact', v)  : undefined} readonly={!isAdmin} />
              <Field label="Contact Email"             value={form.email}    onChange={isAdmin ? v => set('email', v)    : undefined} readonly={!isAdmin} />
              <Field label="Auxiliary Board Member(s)" value={form.auxBoard} onChange={isAdmin ? v => set('auxBoard', v) : undefined} readonly={!isAdmin} />
              <Field
                label="ABm Assistant"
                value={abmAssistantNames.join(', ')}
                readonly
                onLabelClick={isAdmin ? () => setShowAbmAssistantModal(true) : undefined}
              />
            </div>
          </div>
        </div>

        {/* Population */}
        <div className="card">
          <div className="card-header">Population</div>
          <div className="card-body">
            <div className="field-grid-2">
              <Field label="Total Population" value={form.totalPop} onChange={v => set('totalPop', v)} integer />
              <Field label="Total Households" value={form.totalHH}  onChange={v => set('totalHH', v)} integer />
            </div>
            <div className="field-grid-2">
              <PairField
                label="Individuals Connected"
                numVal={form.indNum} pctVal={computedPct(form.indNum, form.totalPop)}
                onNumChange={v => set('indNum', v)} pctReadonly numInteger
              />
              <PairField
                label="Households Connected"
                numVal={form.hhNum} pctVal={computedPct(form.hhNum, form.totalHH)}
                onNumChange={v => set('hhNum', v)} pctReadonly numInteger
              />
            </div>
            <div className="field">
              <label>Makeup of Population</label>
              <textarea value={form.makeup || ''} onChange={e => set('makeup', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Activities */}
        <div className="card">
          <div className="card-header">
            Educational Activities &amp; Devotionals
            <span className="srp-badge">{srp ? 'SRP synced' : 'No SRP data'}</span>
          </div>
          <div className="card-body">
            <div className="sync-note">
              Numbers pre-filled from SRP where available. Edit any value to override — overridden values are highlighted amber.
            </div>
            <div className="act-table-wrap">
              <table className="act-table">
                <thead>
                  <tr>
                    <th className="left">Activity</th>
                    <th>Active</th><th>Participants</th><th>Friends of the Faith</th>
                    <th className="srp-col">SRP</th>
                  </tr>
                </thead>
                <tbody>
                  <ActRow label="Children's Classes" userVals={form.activities.ccs} srpVals={srp?.ccs ?? null}
                    onChange={(f, v) => setAct('ccs', f, v)} onReset={() => resetToSrp('ccs')} />
                  <ActRow label="Junior Youth Groups" userVals={form.activities.jygs} srpVals={srp?.jygs ?? null}
                    onChange={(f, v) => setAct('jygs', f, v)} onReset={() => resetToSrp('jygs')} />
                  <ActRow label="Study Circles" userVals={form.activities.scs} srpVals={srp?.scs ?? null}
                    onChange={(f, v) => setAct('scs', f, v)} onReset={() => resetToSrp('scs')} />
                  <TotalRow label="Total Educational Activities" totals={edTotal} />
                  <ActRow label="Devotional Gatherings" userVals={form.activities.devotionals} srpVals={srp?.devotionals ?? null}
                    onChange={(f, v) => setAct('devotionals', f, v)} onReset={() => resetToSrp('devotionals')} />
                  <TotalRow label="Total Activities" totals={allTotal} />
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Workers & Prevalence */}
        <div className="card">
          <div className="card-header">Workers &amp; Prevalence</div>
          <div className="card-body">
            <div className="field-grid-2">
              <Field
                label="Protagonists / Workers"
                value={form.protagonists}
                onChange={v => set('protagonists', v)}
                integer
                highlighted={protagonistsMismatch}
                onLabelClick={() => setShowProtagonistsModal(true)}
                onSync={() => set('protagonists', String(protagonistNames.length))}
              />
              <Field
                label="Accompaniers in Nucleus"
                value={form.accompaniers}
                onChange={v => set('accompaniers', v)}
                integer
                highlighted={accompaniersMismatch}
                onLabelClick={() => setShowAccompaniersModal(true)}
                onSync={() => set('accompaniers', String(accompanierNames.length))}
              />
            </div>
            {srp?.facilitators && (
              <div className="srp-ref">SRP Facilitators: <strong>{srp.facilitators}</strong></div>
            )}
            <div className="divider" />
            <Field label="Prevalence Level" value={form.level} onChange={v => set('level', v)} />
            <div className="field">
              <label>Notes</label>
              <textarea value={form.notesPrevalence || ''} onChange={e => set('notesPrevalence', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Additional Details */}
        <div className="card">
          <div className="card-header">Additional Details</div>
          <div className="card-body">
            <div className="detail-grid">
              <ToggleItem label="Social Action Presence" value={form.presence} notes={form.notesPresence}
                onToggle={v => set('presence', v)} onNotes={v => set('notesPresence', v)} />
              <ToggleItem label="Gatherings / Festivals" value={form.gatherings} notes={form.notesGatherings}
                onToggle={v => set('gatherings', v)} onNotes={v => set('notesGatherings', v)} />
            </div>
          </div>
        </div>

        {/* Manage Access — collaborator and admin */}
        {canManageAccess && (
          <div className="card">
            <div
              className="card-header"
              onClick={() => setAccessOpen(o => !o)}
              style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              Manage Access
              <span style={{ fontSize: 11 }}>{accessOpen ? '▼' : '▶'}</span>
            </div>
            {accessOpen && (
              <div className="card-body">
                <AccessPanel nucleus={row.nucleus} roleMap={roleMap} />
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

      {showAccompaniersModal && (
        <NamedListModal
          title="Accompaniers in Nucleus"
          type="accompanier"
          nucleus={row.nucleus}
          initialNames={accompanierNames}
          onSave={names => {
            const wasInSync = accompanierNames.length === parseInt(form.accompaniers || '0', 10);
            setAccompanierNames(names);
            if (wasInSync) set('accompaniers', String(names.length));
            setShowAccompaniersModal(false);
          }}
          onClose={() => setShowAccompaniersModal(false)}
        />
      )}

      {showProtagonistsModal && (
        <NamedListModal
          title="Protagonists / Workers"
          type="protagonist"
          nucleus={row.nucleus}
          initialNames={protagonistNames}
          importNames={accompanierNames}
          onSave={names => {
            const wasInSync = protagonistNames.length === parseInt(form.protagonists || '0', 10);
            setProtagonistNames(names);
            if (wasInSync) set('protagonists', String(names.length));
            setShowProtagonistsModal(false);
          }}
          onClose={() => setShowProtagonistsModal(false)}
        />
      )}

      {showAbmAssistantModal && (
        <NamedListModal
          title="ABm Assistant"
          type="abm-assistant"
          nucleus={row.nucleus}
          initialNames={abmAssistantNames}
          onSave={names => {
            setAbmAssistantNames(names);
            setShowAbmAssistantModal(false);
          }}
          onClose={() => setShowAbmAssistantModal(false)}
        />
      )}

      <div className="footer">
        <span className={`save-status${saveStatus.type !== 'idle' ? ` ${saveStatus.type}` : ''}`}>
          {saveStatus.msg}
        </span>
        {!isReadOnly && (
          <>
            <button className="btn-cancel" onClick={handleDiscard}>Discard changes</button>
            <button className="btn-save" disabled={saving || hasIntErrors} onClick={handleSave}>Save to spreadsheet</button>
          </>
        )}
      </div>
    </>
  );
}
