'use client';

import { useState } from 'react';

interface Props {
  title: string;
  type: string;
  neighborhood: string;
  initialNames: string[];
  importNames?: string[];
  onSave: (names: string[]) => void;
  onClose: () => void;
}

function IcoImport() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

export default function NamedListModal({ title, type, neighborhood, initialNames, importNames, onSave, onClose }: Props) {
  const [names, setNames] = useState<string[]>(initialNames);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function add() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setNames(n => [...n, trimmed]);
    setInput('');
  }

  function remove(i: number) {
    setNames(n => n.filter((_, idx) => idx !== i));
  }

  function moveUp(i: number) {
    if (i === 0) return;
    setNames(n => { const a = [...n]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; });
  }

  function moveDown(i: number) {
    setNames(n => {
      if (i === n.length - 1) return n;
      const a = [...n]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a;
    });
  }

  function importFromList() {
    if (!importNames) return;
    const existing = new Set(names.map(n => n.toLowerCase().trim()));
    const toAdd = importNames.filter(n => !existing.has(n.toLowerCase().trim()));
    setNames(prev => [...prev, ...toAdd]);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neighborhood, type, names }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      onSave(names);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 12, padding: '20px 24px', maxWidth: 480, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#2d3748' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#718096', lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: '#718096', marginBottom: 16 }}>{neighborhood}</div>

        {importNames && importNames.length > 0 && (
          <button
            onClick={importFromList}
            title="Import accompaniers"
            style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', padding: '4px 8px', background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 6, cursor: 'pointer', color: '#2b6cb0', marginBottom: 8 }}
          >
            <IcoImport />
          </button>
        )}

        <div style={{ overflowY: 'auto', flex: 1, marginBottom: 12 }}>
          {names.length === 0 && (
            <div style={{ color: '#a0aec0', fontSize: 13, padding: '8px 0' }}>No names added yet.</div>
          )}
          {names.map((name, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
              <button
                onClick={() => moveUp(i)}
                disabled={i === 0}
                style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#cbd5e0' : '#718096', fontSize: 12, padding: '2px 4px' }}
              >↑</button>
              <button
                onClick={() => moveDown(i)}
                disabled={i === names.length - 1}
                style={{ background: 'none', border: 'none', cursor: i === names.length - 1 ? 'default' : 'pointer', color: i === names.length - 1 ? '#cbd5e0' : '#718096', fontSize: 12, padding: '2px 4px' }}
              >↓</button>
              <span style={{ flex: 1, fontSize: 14 }}>{name}</span>
              <button
                onClick={() => remove(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
              >×</button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="Add a name..."
            style={{ flex: 1, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }}
          />
          <button
            onClick={add}
            style={{ padding: '6px 14px', background: '#3182ce', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >Add</button>
        </div>

        {error && <div style={{ color: '#e53e3e', fontSize: 13, marginBottom: 8 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ padding: '7px 16px', background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '7px 16px', background: '#3182ce', color: 'white', border: 'none', borderRadius: 6, cursor: saving ? 'default' : 'pointer', fontSize: 14, opacity: saving ? 0.7 : 1 }}
          >{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
