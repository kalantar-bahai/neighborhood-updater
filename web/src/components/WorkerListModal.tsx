'use client';

import { useState, useRef, useEffect } from 'react';
import type { Worker } from '@/types';

interface Props {
  title: string;
  role: string;
  nucleus: string;
  workers: Worker[];
  importWorkers?: Worker[];
  // Single-valued role (e.g. contact): picking or creating someone replaces
  // the current occupant instead of appending, and reorder controls are hidden.
  single?: boolean;
  onChange: (workers: Worker[]) => void;
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

function iconBtn(onClick: () => void, title: string, color: string, children: React.ReactNode) {
  return (
    <button onClick={onClick} title={title} style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: '2px 4px', display: 'inline-flex', alignItems: 'center' }}>
      {children}
    </button>
  );
}

// Every action here saves immediately -- no batched "Save" step. cluster-notebook's
// updateNucleusWorkers takes the full ordered list each call (2026-09-13, confirmed
// with the user: the old batch-everything design was a spreadsheet-write limitation,
// not a real UX requirement).
export default function WorkerListModal({ title, role, nucleus, workers, importWorkers, single, onChange, onClose }: Props) {
  const [list, setList] = useState<Worker[]>(workers);
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<Worker[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);

  // Clearing suggestions when the input goes empty happens directly in the
  // input's onChange (handleInputChange below), not here -- a useEffect body
  // should react to committed state, not synchronously set more state on
  // every render (react-hooks/set-state-in-effect).
  useEffect(() => {
    const query = input.trim();
    if (!query) return;
    const seq = ++searchSeq.current;
    debounceRef.current = setTimeout(async () => {
      if (seq !== searchSeq.current) return; // a newer search superseded this one
      setSearching(true);
      try {
        const res = await fetch(`/api/individuals?nucleus=${encodeURIComponent(nucleus)}&search=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (seq !== searchSeq.current) return;
        if (!res.ok) throw new Error(data.error || 'Search failed');
        setSuggestions(data.individuals);
        setHighlighted(0);
      } catch (e: unknown) {
        if (seq === searchSeq.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [input, nucleus]);

  function handleInputChange(value: string) {
    setInput(value);
    // Clear on every keystroke, not just when empty -- otherwise Enter pressed
    // right after typing (within the 250ms debounce) can act on stale suggestions
    // from an earlier, shorter substring instead of the name just typed. That
    // silently added/re-added the wrong (often already-present) person.
    setSuggestions([]);
    if (!value.trim()) {
      setSearching(false);
    }
  }

  async function saveWorkers(personIds: string[]) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nucleus, type: role, personIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setList(data.workers);
      onChange(data.workers);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function addWorker(worker: Worker) {
    setInput('');
    setSuggestions([]);
    void saveWorkers(single ? [worker.id] : [...list.map(w => w.id), worker.id]);
  }

  async function createAndAdd(name: string) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/individuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nucleus, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      setInput('');
      setSuggestions([]);
      setSaving(false);
      await saveWorkers(single ? [data.id] : [...list.map(w => w.id), data.id]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions.length > 0) {
        addWorker(suggestions[highlighted]);
      } else if (input.trim()) {
        void createAndAdd(input.trim());
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) setHighlighted(h => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length > 0) setHighlighted(h => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  function remove(id: string) {
    void saveWorkers(list.filter(w => w.id !== id).map(w => w.id));
  }

  function moveUp(i: number) {
    if (i === 0) return;
    const ids = list.map(w => w.id);
    [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
    void saveWorkers(ids);
  }

  function moveDown(i: number) {
    if (i === list.length - 1) return;
    const ids = list.map(w => w.id);
    [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
    void saveWorkers(ids);
  }

  function importFromList() {
    if (!importWorkers) return;
    const existing = new Set(list.map(w => w.id));
    const toAdd = importWorkers.filter(w => !existing.has(w.id));
    if (toAdd.length === 0) return;
    void saveWorkers([...list.map(w => w.id), ...toAdd.map(w => w.id)]);
  }

  return (
    <div
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
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

        {importWorkers && importWorkers.length > 0 && (
          <button
            onClick={importFromList}
            title="Import accompaniers"
            style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', padding: '4px 8px', background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 6, cursor: 'pointer', color: '#2b6cb0', marginBottom: 8 }}
          >
            <IcoImport />
          </button>
        )}

        <div style={{ overflowY: 'auto', flex: 1, marginBottom: 12 }}>
          {list.length === 0 && (
            <div style={{ color: '#a0aec0', fontSize: 13, padding: '8px 0' }}>
              {single ? 'No contact assigned yet.' : 'No names added yet.'}
            </div>
          )}
          {list.map((worker, i) => (
            <div key={worker.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
              {!single && (
                <>
                  <button onClick={() => moveUp(i)} disabled={i === 0}
                    style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#cbd5e0' : '#718096', fontSize: 12, padding: '2px 4px' }}>↑</button>
                  <button onClick={() => moveDown(i)} disabled={i === list.length - 1}
                    style={{ background: 'none', border: 'none', cursor: i === list.length - 1 ? 'default' : 'pointer', color: i === list.length - 1 ? '#cbd5e0' : '#718096', fontSize: 12, padding: '2px 4px' }}>↓</button>
                </>
              )}
              <span style={{ flex: 1, fontSize: 14 }}>{worker.name}</span>
              {iconBtn(() => remove(worker.id), 'Remove', '#e53e3e', <IcoTrash />)}
            </div>
          ))}
        </div>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            type="text"
            value={input}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search or type a new name..."
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
          />
          {(suggestions.length > 0 || searching) && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, marginTop: 4, maxHeight: 180, overflowY: 'auto', zIndex: 1, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              {searching && suggestions.length === 0 && (
                <div style={{ padding: '8px 10px', fontSize: 13, color: '#a0aec0' }}>Searching...</div>
              )}
              {suggestions.map((s, i) => (
                <div
                  key={s.id}
                  onClick={() => addWorker(s)}
                  onMouseEnter={() => setHighlighted(i)}
                  style={{ padding: '8px 10px', fontSize: 14, cursor: 'pointer', background: i === highlighted ? '#ebf8ff' : 'white' }}
                >
                  {s.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {saving && <div style={{ color: '#718096', fontSize: 12, marginBottom: 8 }}>Saving...</div>}
        {error && <div style={{ color: '#e53e3e', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      </div>
    </div>
  );
}
