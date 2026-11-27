'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ParticipationSpace, SpaceKind, SpaceMode } from '@/lib/clusterNotebook';
import { availableSuggestions } from '@/lib/participation';

interface Props {
  nucleus: string;
  kinds: SpaceKind[];
  existingNames: string[];
  // Given: edit this space (name and kind; the mode is fixed). Used by the space page.
  initial?: ParticipationSpace;
  onClose: () => void;
  onSaved: (space: ParticipationSpace) => void;
}

const MODES: { mode: SpaceMode; label: string; help: string }[] = [
  { mode: 'EACH_TIME', label: 'Each time it happens', help: 'A date, how many came, and who. For gatherings, devotionals, a festival, a clean-up.' },
  { mode: 'RUNNING', label: 'A running count', help: 'Keep adding to one total. For visiting, an expansion phase.' },
];

const INPUT: React.CSSProperties = { width: '100%', minHeight: 44, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', background: 'white' };

export default function SpaceFormModal({ nucleus, kinds, existingNames, initial, onClose, onSaved }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState(initial?.kind ?? '');
  const [mode, setMode] = useState<SpaceMode | ''>(initial?.mode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const suggestions = initial ? [] : availableSuggestions(kinds, existingNames);
  const canSave = name.trim() !== '' && kind !== '' && mode !== '' && !busy;

  async function send(method: 'POST' | 'PATCH', body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/participation/spaces', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nucleus, ...body }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save that.');
      onSaved(data.space);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function save() {
    if (!canSave) return;
    if (initial) void send('PATCH', { id: initial.id, name: name.trim(), kind });
    else void send('POST', { name: name.trim(), kind, mode });
  }

  const modal = (
    <div
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, padding: '20px 24px', maxWidth: 440, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#2d3748' }}>{initial ? 'Edit space' : 'Add a space'}</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#718096', lineHeight: 1, minWidth: 44, minHeight: 44 }}>×</button>
        </div>

        {suggestions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {suggestions.map(s => (
              <button
                key={s.name}
                onClick={() => { setName(s.name); setKind(s.kind); setMode(s.mode); }}
                style={{ minHeight: 44, padding: '4px 14px', borderRadius: 22, fontSize: 13, cursor: 'pointer', border: '1px solid #bee3f8', background: '#ebf8ff', color: '#2a4365' }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        <div className="field" style={{ marginBottom: 12 }}>
          <label>Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} autoFocus={!!initial} style={INPUT} />
        </div>

        <div className="field" style={{ marginBottom: 12 }}>
          <label>How do you record it?</label>
          {initial ? (
            <div style={{ padding: '6px 0', fontSize: 14, color: '#2d3748', fontWeight: 600 }}>{MODES.find(m => m.mode === initial.mode)?.label}</div>
          ) : MODES.map(m => (
            <label key={m.mode} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44, padding: '6px 0', cursor: 'pointer' }}>
              <input type="radio" name="space-mode" checked={mode === m.mode} onChange={() => setMode(m.mode)} style={{ marginTop: 4 }} />
              <span>
                <span style={{ display: 'block', fontSize: 14, color: '#2d3748', fontWeight: 600 }}>{m.label}</span>
                <span style={{ display: 'block', fontSize: 12, color: '#718096' }}>{m.help}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="field" style={{ marginBottom: 16 }}>
          <label>Kind</label>
          <select value={kind} onChange={e => setKind(e.target.value)} style={INPUT}>
            <option value="">Select a kind…</option>
            {kinds.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <div style={{ fontSize: 12, color: '#718096', marginTop: 4 }}>Lets the cluster add up spaces like this across neighborhoods.</div>
        </div>

        {error && <div style={{ color: '#e53e3e', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            {initial && (
              <button
                onClick={() => void send('PATCH', { id: initial.id, archived: !initial.archivedAt })}
                disabled={busy}
                style={{ minHeight: 44, fontSize: 13, color: '#c53030', background: 'none', border: '1px solid #feb2b2', borderRadius: 6, padding: '6px 14px', cursor: busy ? 'default' : 'pointer' }}
              >
                {initial.archivedAt ? 'Restore space' : 'Archive space'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ minHeight: 44, fontSize: 13, color: '#718096', background: 'none', border: '1px solid #cbd5e0', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Cancel</button>
            <button
              onClick={save}
              disabled={!canSave}
              style={{ minHeight: 44, fontSize: 13, fontWeight: 600, color: 'white', background: canSave ? '#2b6cb0' : '#a0aec0', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: canSave ? 'pointer' : 'default' }}
            >
              {busy ? 'Saving…' : initial ? 'Save' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}
