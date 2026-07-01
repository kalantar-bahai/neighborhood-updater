'use client';

import { useState } from 'react';

interface Props {
  title: string;
  type: string;
  nucleus: string;
  initialNames: string[];
  importNames?: string[];
  onSave: (names: string[]) => void;
  onClose: () => void;
}

const IcoImport = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const IcoTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);

const IcoPencil = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const IcoCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const IcoX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

function iconBtn(onClick: () => void, title: string, color: string, children: React.ReactNode) {
  return (
    <button onClick={onClick} title={title} style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: '2px 4px', display: 'inline-flex', alignItems: 'center' }}>
      {children}
    </button>
  );
}

export default function NamedListModal({ title, type, nucleus, initialNames, importNames, onSave, onClose }: Props) {
  const [names, setNames] = useState<string[]>(initialNames);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

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

  function startEdit(i: number) {
    setEditIdx(i);
    setEditValue(names[i]);
  }

  function confirmEdit() {
    if (editIdx === null) return;
    const trimmed = editValue.trim();
    if (trimmed) setNames(n => n.map((v, i) => i === editIdx ? trimmed : v));
    setEditIdx(null);
    setEditValue('');
  }

  function cancelEdit() {
    setEditIdx(null);
    setEditValue('');
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
        body: JSON.stringify({ nucleus, type, names }),
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
        <div style={{ fontSize: 12, color: '#718096', marginBottom: 16 }}>{nucleus}</div>

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
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
              <button onClick={() => moveUp(i)} disabled={i === 0}
                style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#cbd5e0' : '#718096', fontSize: 12, padding: '2px 4px' }}>↑</button>
              <button onClick={() => moveDown(i)} disabled={i === names.length - 1}
                style={{ background: 'none', border: 'none', cursor: i === names.length - 1 ? 'default' : 'pointer', color: i === names.length - 1 ? '#cbd5e0' : '#718096', fontSize: 12, padding: '2px 4px' }}>↓</button>
              {editIdx === i ? (
                <>
                  <input
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
                    style={{ flex: 1, fontSize: 14, padding: '2px 6px', border: '1px solid #bee3f8', borderRadius: 4 }}
                  />
                  {iconBtn(confirmEdit, 'Save', '#276749', <IcoCheck />)}
                  {iconBtn(cancelEdit, 'Cancel', '#718096', <IcoX />)}
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 14 }}>{name}</span>
                  {iconBtn(() => startEdit(i), 'Edit', '#3182ce', <IcoPencil />)}
                  {iconBtn(() => remove(i), 'Remove', '#e53e3e', <IcoTrash />)}
                </>
              )}
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
          <button onClick={add} style={{ padding: '6px 14px', background: '#3182ce', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>Add</button>
        </div>

        {error && <div style={{ color: '#e53e3e', fontSize: 13, marginBottom: 8 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '7px 16px', background: '#3182ce', color: 'white', border: 'none', borderRadius: 6, cursor: saving ? 'default' : 'pointer', fontSize: 14, opacity: saving ? 0.7 : 1 }}
          >{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
