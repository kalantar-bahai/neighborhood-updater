'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ParticipationRecord, ParticipationSpace } from '@/lib/clusterNotebook';
import { individualDisplayName } from '@/lib/personName';
import { countAfterNaming, countValid, isoDate, lastTimeChoices, namedLabel, parseCount, recordFormChanged, recordPatch, type RecordForm } from '@/lib/participation';
import PersonSearch from './PersonSearch';

interface Props {
  nucleus: string;
  space: ParticipationSpace;
  // Given: edit (or delete) this record.
  record?: ParticipationRecord;
  onClose: () => void;
  onSaved: () => void;
}

type Picked = { id: string; name: string };

const INPUT: React.CSSProperties = { width: '100%', minHeight: 44, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', background: 'white' };
const CHIP: React.CSSProperties = { minHeight: 44, padding: '4px 14px', borderRadius: 22, fontSize: 13, cursor: 'pointer', border: '1px solid #bee3f8', background: '#ebf8ff', color: '#2a4365' };

export default function RecordModal({ nucleus, space, record, onClose, onSaved }: Props) {
  // What the form opened with, so a backdrop tap can tell whether anything has been typed.
  const [initial] = useState<RecordForm>(() => ({
    date: record?.date ?? isoDate(new Date()),
    countText: record ? String(record.count) : '',
    personIds: (record?.people ?? []).map(p => p.id),
    note: record?.note ?? '',
  }));
  const [date, setDate] = useState(initial.date);
  const [countText, setCountText] = useState(initial.countText);
  const [picked, setPicked] = useState<Picked[]>(() => (record?.people ?? []).map(p => ({ id: p.id, name: individualDisplayName(p) })));
  const [note, setNote] = useState(initial.note);
  const [searching, setSearching] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const count = parseCount(countText);
  const canSave = countValid(count, picked.length) && date !== '' && !busy;
  const pickedIds = picked.map(p => p.id);
  const running = space.mode === 'RUNNING';
  const sameAsLatest = !!record && record.id === space.latestRecord?.id;
  const choices = sameAsLatest ? [] : lastTimeChoices(space.latestRecord, pickedIds);
  const named = namedLabel(picked.length, count ?? 0);

  function pick(p: Picked) {
    if (pickedIds.includes(p.id)) return;
    setPicked([...picked, p]);
    setCountText(String(countAfterNaming(count, picked.length + 1)));
  }

  async function send(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/participation/records', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nucleus, ...body }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save that.');
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function save() {
    if (!canSave || count === null) return;
    const edited = { date, count, note, personIds: pickedIds };
    if (!record) {
      void send('POST', { spaceId: space.id, ...edited, note: note.trim() || null });
      return;
    }
    const patch = recordPatch({ date: record.date, count: record.count, note: record.note, personIds: record.people.map(p => p.id) }, edited);
    if (Object.keys(patch).length === 0) { onClose(); return; }
    void send('PATCH', { id: record.id, ...patch });
  }

  // A stray tap outside the form closes it only while nothing has been typed; Cancel and × always close.
  function backdropClose() {
    if (!recordFormChanged(initial, { date, countText, personIds: pickedIds, note })) onClose();
  }

  const modal = (
    <div
      onClick={backdropClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, padding: '20px 24px', maxWidth: 440, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#2d3748' }}>{space.name}{record ? ' · edit' : ''}</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#718096', lineHeight: 1, minWidth: 44, minHeight: 44 }}>×</button>
        </div>

        <div className="field" style={{ marginBottom: 12 }}>
          <label>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={INPUT} />
        </div>

        <div className="field" style={{ marginBottom: 12 }}>
          <label>{running ? 'How many to add' : 'Participants'}</label>
          <input type="text" inputMode="numeric" value={countText} onChange={e => setCountText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} style={INPUT} />
          {count !== null && count < picked.length && <div style={{ fontSize: 12, color: '#c53030', marginTop: 4 }}>{picked.length} named, so at least {picked.length}.</div>}
        </div>

        <div className="field" style={{ marginBottom: 12 }}>
          <label>Who came (optional){named && <span style={{ fontWeight: 400, color: '#718096' }}> · {named}</span>}</label>
          {picked.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {picked.map(p => (
                <button key={p.id} onClick={() => setPicked(picked.filter(x => x.id !== p.id))} aria-label={`Remove ${p.name}`} style={{ ...CHIP, background: '#2b6cb0', borderColor: '#2b6cb0', color: 'white' }}>
                  {p.name} ×
                </button>
              ))}
            </div>
          )}
          {choices.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: '#718096', marginBottom: 4 }}>Came last time</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {choices.map(p => (
                  <button key={p.id} onClick={() => pick({ id: p.id, name: individualDisplayName(p) })} style={CHIP}>+ {individualDisplayName(p)}</button>
                ))}
              </div>
            </>
          )}
          {searching ? (
            <PersonSearch
              nucleus={nucleus}
              hiddenIds={[]}
              placeholder="Find or add a person…"
              onPick={p => { pick({ id: p.id, name: p.name }); setSearching(false); }}
            />
          ) : (
            <button onClick={() => setSearching(true)} style={{ ...CHIP, background: 'white', borderColor: '#cbd5e0', color: '#2a4365' }}>+ Someone else</button>
          )}
        </div>

        <div className="field" style={{ marginBottom: 16 }}>
          <label>Note</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ ...INPUT, minHeight: 64, fontFamily: 'inherit' }} />
        </div>

        {error && <div style={{ color: '#e53e3e', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {confirmDelete ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#c53030' }}>Delete this record?</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDelete(false)} style={{ minHeight: 44, fontSize: 13, color: '#718096', background: 'none', border: '1px solid #cbd5e0', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Keep it</button>
              <button onClick={() => record && void send('DELETE', { id: record.id })} disabled={busy} style={{ minHeight: 44, fontSize: 13, fontWeight: 600, color: 'white', background: '#c53030', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: busy ? 'default' : 'pointer' }}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div>
              {record && (
                <button onClick={() => setConfirmDelete(true)} disabled={busy} style={{ minHeight: 44, fontSize: 13, color: '#c53030', background: 'none', border: '1px solid #feb2b2', borderRadius: 6, padding: '6px 14px', cursor: busy ? 'default' : 'pointer' }}>Delete</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ minHeight: 44, fontSize: 13, color: '#718096', background: 'none', border: '1px solid #cbd5e0', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={save}
                disabled={!canSave}
                style={{ minHeight: 44, fontSize: 13, fontWeight: 600, color: 'white', background: canSave ? '#2b6cb0' : '#a0aec0', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: canSave ? 'pointer' : 'default' }}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}
