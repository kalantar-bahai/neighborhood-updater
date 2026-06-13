'use client';

import { useState, useCallback } from 'react';
import { NeighborhoodDetail, NeighborhoodRow, Activity, SrpData } from '@/types';

interface Props {
  detail: NeighborhoodDetail;
  email: string;
  showBack: boolean;
  spreadsheetUrl: string;
  onBack: () => void;
  onSaved: (savedBy: string, savedAt: string) => void;
}

type FormState = Omit<NeighborhoodRow, 'neighborhood' | 'parentNeighborhood' | 'grouping' | 'cluster' | 'pg' | 'clusterCode'>;

function rowToForm(row: NeighborhoodRow): FormState {
  const { neighborhood: _n, parentNeighborhood: _p, grouping: _g, cluster: _c, pg: _pg, clusterCode: _cc, ...rest } = row;
  return rest;
}

function computedPct(connected: string, total: string): string {
  const c = parseFloat(connected);
  const t = parseFloat(total);
  if (!c || !t || t === 0) return '';
  const pct = (c / t) * 100;
  return (pct <= 1.0 ? +pct.toFixed(2) : +pct.toFixed(1)) + '%';
}

function actTotal(acts: (Activity | undefined)[]) {
  return acts.reduce((acc, a) => ({
    act:  acc.act  + parseInt((a?.act  || '0'), 10),
    part: acc.part + parseInt((a?.part || '0'), 10),
    fof:  acc.fof  + parseInt((a?.fof  || '0'), 10),
  }), { act: 0, part: 0, fof: 0 });
}

function Field({ label, value, onChange, readonly, type }: {
  label: string; value: string; onChange?: (v: string) => void; readonly?: boolean; type?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type={type || 'text'}
        value={value || ''}
        readOnly={readonly}
        className={readonly ? 'ro' : ''}
        onChange={e => onChange?.(e.target.value)}
      />
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

function PairField({ label, numVal, pctVal, onNumChange, pctReadonly }: {
  label: string; numVal: string; pctVal: string;
  onNumChange: (v: string) => void; pctReadonly?: boolean;
}) {
  return (
    <div className="pair-field">
      <label>{label}</label>
      <div className="pair-inputs">
        <input type="text" value={numVal || ''} placeholder="#" onChange={e => onNumChange(e.target.value)} />
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

  return (
    <tr>
      <td className="row-label">{label}</td>
      <td><input type="number" value={userVals.act || ''} className={actDiffers ? 'overridden' : ''} onChange={e => onChange('act', e.target.value)} /></td>
      <td><input type="number" value={userVals.part || ''} className={partDiffers ? 'overridden' : ''} onChange={e => onChange('part', e.target.value)} /></td>
      <td><input type="number" value={userVals.fof || ''} className={fofDiffers ? 'overridden' : ''} onChange={e => onChange('fof', e.target.value)} /></td>
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
  const isNo  = (value || '').toLowerCase() === 'no';
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

export default function DetailView({ detail, email, showBack, spreadsheetUrl, onBack, onSaved }: Props) {
  const { row, srp } = detail;
  const [form, setForm] = useState<FormState>(() => rowToForm(row));
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ msg: string; type: 'idle' | 'success' | 'error' }>({ msg: '', type: 'idle' });
  const [lastUpdatedBy, setLastUpdatedBy] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');

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
      const res = await fetch('/api/neighborhood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: row.neighborhood, formData: form }),
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

  function handleDiscard() {
    if (isDirty && !confirm('Discard all unsaved changes?')) return;
    setForm(rowToForm(row));
    setIsDirty(false);
    setSaveStatus({ msg: '', type: 'idle' });
  }

  const edTotal  = actTotal([form.activities.ccs, form.activities.jygs, form.activities.scs]);
  const allTotal = actTotal([form.activities.ccs, form.activities.jygs, form.activities.scs, form.activities.devotionals]);

  const updatedLine = lastUpdatedAt
    ? `Last saved by ${lastUpdatedBy} on ${new Date(lastUpdatedAt).toLocaleString()}`
    : '';

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
          {showBack && <button className="back-btn" onClick={onBack}>← Back</button>}
          <div style={{ minWidth: 0 }}>
            <h1>{row.neighborhood}</h1>
            <div className="meta">{row.clusterCode} · {row.cluster} · {row.locality}</div>
            {updatedLine && <div className="last-updated">{updatedLine}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <a href={spreadsheetUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '4px 10px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Open sheet ↗
          </a>
          <button onClick={() => window.location.href = '/signout'} style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', background: 'none', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
            Sign out
          </button>
          <button className="save-btn" disabled={saving} onClick={handleSave}>Save</button>
        </div>
      </div>

      <div className="container">

        {/* Identity */}
        <div className="card">
          <div className="card-header">Identity</div>
          <div className="card-body">
            <div className="field-grid-4">
              <Field label="Grouping"     value={row.grouping}    readonly />
              <Field label="Cluster Code" value={row.clusterCode} readonly />
              <Field label="Cluster"      value={row.cluster}     readonly />
              <Field label="PG"           value={row.pg}          readonly />
            </div>
            <div className="field-grid-3">
              <Field label="Locality"              value={row.locality}    readonly />
              <Field label="Neighborhood & Pocket" value={row.neighborhood} readonly />
              <Field label="Neighborhood Stage"    value={row.stage}       readonly />
            </div>
            <div className="field-grid-3">
              <Field label="Neighborhood Contact"      value={row.contact}  readonly />
              <Field label="Contact Email"             value={row.email}    readonly />
              <Field label="Auxiliary Board Member(s)" value={row.auxBoard} readonly />
            </div>
          </div>
        </div>

        {/* Population */}
        <div className="card">
          <div className="card-header">Population</div>
          <div className="card-body">
            <div className="field-grid-2">
              <Field label="Total Population" value={form.totalPop} onChange={v => set('totalPop', v)} />
              <Field label="Total Households" value={form.totalHH}  onChange={v => set('totalHH', v)} />
            </div>
            <div className="field-grid-2">
              <PairField
                label="Individuals Connected"
                numVal={form.indNum} pctVal={computedPct(form.indNum, form.totalPop)}
                onNumChange={v => set('indNum', v)} pctReadonly
              />
              <PairField
                label="Households Connected"
                numVal={form.hhNum} pctVal={computedPct(form.hhNum, form.totalHH)}
                onNumChange={v => set('hhNum', v)} pctReadonly
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
                  <ActRow label="Children's Classes (CCs)" userVals={form.activities.ccs} srpVals={srp?.ccs ?? null}
                    onChange={(f, v) => setAct('ccs', f, v)} onReset={() => resetToSrp('ccs')} />
                  <ActRow label="Junior Youth Groups (JYGs)" userVals={form.activities.jygs} srpVals={srp?.jygs ?? null}
                    onChange={(f, v) => setAct('jygs', f, v)} onReset={() => resetToSrp('jygs')} />
                  <ActRow label="Study Circles (SCs)" userVals={form.activities.scs} srpVals={srp?.scs ?? null}
                    onChange={(f, v) => setAct('scs', f, v)} onReset={() => resetToSrp('scs')} />
                  <TotalRow label="Total Educational Activities" totals={edTotal} />
                  <ActRow label="Devotionals" userVals={form.activities.devotionals} srpVals={srp?.devotionals ?? null}
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
              <Field label="Protagonists / Workers"  value={form.protagonists} onChange={v => set('protagonists', v)} />
              <Field label="Accompaniers in Nucleus" value={form.accompaniers} onChange={v => set('accompaniers', v)} />
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
              <ToggleItem label="Assembly Support" value={form.supported} notes={form.notesSupported}
                onToggle={v => set('supported', v)} onNotes={v => set('notesSupported', v)} />
              <ToggleItem label="Social Action Presence" value={form.presence} notes={form.notesPresence}
                onToggle={v => set('presence', v)} onNotes={v => set('notesPresence', v)} />
              <ToggleItem label="Local Leaders Involved" value={form.involved} notes={form.notesInvolved}
                onToggle={v => set('involved', v)} onNotes={v => set('notesInvolved', v)} />
              <ToggleItem label="Specific Efforts for Spiritual Health" value={form.efforts} notes={form.notesEfforts}
                onToggle={v => set('efforts', v)} onNotes={v => set('notesEfforts', v)} />
            </div>
          </div>
        </div>

      </div>

      <div className="footer">
        <span className={`save-status${saveStatus.type !== 'idle' ? ` ${saveStatus.type}` : ''}`}>
          {saveStatus.msg}
        </span>
        <button className="btn-cancel" onClick={handleDiscard}>Discard changes</button>
        <button className="btn-save" disabled={saving} onClick={handleSave}>Save to spreadsheet</button>
      </div>
    </>
  );
}
