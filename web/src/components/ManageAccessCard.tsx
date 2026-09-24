'use client';

import { useState, useEffect, useRef } from 'react';
import type { RoleGrant } from '@/lib/clusterNotebook';
import type { Worker } from '@/types';

interface Props {
  nucleus: string;
}

// Accompanier/contact/abm-assistant already have their own dedicated UI
// elsewhere in DetailView (Overview and Identity cards) -- showing them here
// too would just be the same assignment reachable two confusing ways
// (2026-09-24, the user directly).
const EXCLUDED_ROLES = ['accompanier', 'contact', 'abm-assistant'];

interface Entry {
  id: string;
  name: string;
  role: string;
}

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

export default function ManageAccessCard({ nucleus }: Props) {
  // roleOptions: assignable roles here, minus EXCLUDED_ROLES -- both the set of
  // roles a new entry's dropdown offers, and the set of /api/workers GETs used
  // to build the flat (name, role) table below (one call per role, in parallel;
  // cluster-notebook has no single "everyone's role here" query).
  const [roleOptions, setRoleOptions] = useState<string[] | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  // loadError: the initial fetches have nothing else to show if they fail, so
  // this legitimately replaces the whole card. actionError: a failed add/remove
  // must NOT hide the table (and its own retry affordances) -- renders inline
  // instead (same split as the bug fixed in this card's first version).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [newRole, setNewRole] = useState('');
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<Worker[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    fetch(`/api/roles?nucleus=${encodeURIComponent(nucleus)}`)
      .then(r => r.json())
      .then(async (data: { error?: string; roles?: RoleGrant[] }) => {
        if (data.error) { setLoadError(data.error); return; }
        const options = (data.roles ?? [])
          .map(r => r.role)
          .filter(role => !EXCLUDED_ROLES.includes(role));
        setRoleOptions(options);
        setNewRole(options[0] ?? '');

        if (options.length === 0) { setEntries([]); return; }
        const results = await Promise.all(options.map(async role => {
          const res = await fetch(`/api/workers?nucleus=${encodeURIComponent(nucleus)}&type=${encodeURIComponent(role)}`);
          const workersData = await res.json();
          if (!res.ok) throw new Error(workersData.error || `Failed to load current ${role}s`);
          return (workersData.workers as Worker[]).map(w => ({ id: w.id, name: w.name, role }));
        }));
        setEntries(results.flat());
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Failed to load access roles.'));
  }, [nucleus]);

  useEffect(() => {
    const query = input.trim();
    if (!query) return;
    const seq = ++searchSeq.current;
    debounceRef.current = setTimeout(async () => {
      if (seq !== searchSeq.current) return;
      setSearching(true);
      try {
        const res = await fetch(`/api/individuals?nucleus=${encodeURIComponent(nucleus)}&search=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (seq !== searchSeq.current) return;
        if (!res.ok) throw new Error(data.error || 'Search failed');
        setSuggestions(data.individuals);
        setHighlighted(0);
      } catch (e: unknown) {
        if (seq === searchSeq.current) setActionError(e instanceof Error ? e.message : String(e));
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [input, nucleus]);

  function handleInputChange(value: string) {
    setInput(value);
    setSuggestions([]);
    if (!value.trim()) setSearching(false);
  }

  function idsForRole(role: string): string[] {
    return (entries ?? []).filter(e => e.role === role).map(e => e.id);
  }

  async function saveRole(role: string, personIds: string[]) {
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nucleus, type: role, personIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      const updated = (data.workers as Worker[]).map(w => ({ id: w.id, name: w.name, role }));
      setEntries(prev => [...(prev ?? []).filter(e => e.role !== role), ...updated]);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function addPerson(worker: Worker) {
    setInput('');
    setSuggestions([]);
    void saveRole(newRole, [...idsForRole(newRole), worker.id]);
  }

  async function createAndAdd(name: string) {
    setSaving(true);
    setActionError(null);
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
      await saveRole(newRole, [...idsForRole(newRole), data.id]);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  // Shared by Enter and the "Add" button -- both must prefer a matched
  // suggestion over creating a new Individual, so clicking "Add" after typing
  // an existing person's name (without pressing Enter or clicking the
  // suggestion) doesn't silently create a duplicate.
  function commitInput() {
    if (suggestions.length > 0) {
      addPerson(suggestions[highlighted]);
    } else if (input.trim()) {
      void createAndAdd(input.trim());
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitInput();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) setHighlighted(h => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length > 0) setHighlighted(h => (h - 1 + suggestions.length) % suggestions.length);
    }
  }

  function removeEntry(entry: Entry) {
    void saveRole(entry.role, idsForRole(entry.role).filter(id => id !== entry.id));
  }

  if (loadError) return <div style={{ fontSize: 13, color: '#e53e3e', padding: '8px 0' }}>{loadError}</div>;
  if (!roleOptions || !entries) return <div style={{ fontSize: 13, color: '#718096', padding: '8px 0' }}>Loading access...</div>;
  if (roleOptions.length === 0) return <div style={{ fontSize: 13, color: '#718096', padding: '8px 0' }}>No roles available to assign here.</div>;

  return (
    <div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 13, color: '#718096', marginBottom: 12 }}>No access entries yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ width: 32 }}></th>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#4a5568' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#4a5568' }}>Role</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={`${entry.role}-${entry.id}`} style={{ borderBottom: '1px solid #f7fafc' }}>
                  <td style={{ padding: '4px 8px' }}>
                    {iconBtn(() => removeEntry(entry), 'Remove', '#e53e3e', <IcoTrash />)}
                  </td>
                  <td style={{ padding: '4px 8px' }}>{entry.name}</td>
                  <td style={{ padding: '4px 8px', color: '#718096' }}>{entry.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end', position: 'relative' }}>
        <div className="field" style={{ flex: '1 1 180px', margin: 0, position: 'relative' }}>
          <label style={{ fontSize: 12 }}>Name</label>
          <input
            type="text"
            value={input}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search or type a new name..."
            disabled={saving}
            style={{ fontSize: 13 }}
          />
          {(suggestions.length > 0 || searching) && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, marginTop: 4, maxHeight: 180, overflowY: 'auto', zIndex: 1, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              {searching && suggestions.length === 0 && (
                <div style={{ padding: '8px 10px', fontSize: 13, color: '#a0aec0' }}>Searching...</div>
              )}
              {suggestions.map((s, i) => (
                <div
                  key={s.id}
                  onClick={() => addPerson(s)}
                  onMouseEnter={() => setHighlighted(i)}
                  style={{ padding: '8px 10px', fontSize: 14, cursor: 'pointer', background: i === highlighted ? '#ebf8ff' : 'white' }}
                >
                  {s.name}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="field" style={{ flex: '0 1 160px', margin: 0 }}>
          <label style={{ fontSize: 12 }}>Role</label>
          <select value={newRole} onChange={e => setNewRole(e.target.value)} disabled={saving} style={{ fontSize: 13 }}>
            {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button
          onClick={commitInput}
          disabled={saving || !input.trim()}
          style={{ fontSize: 13, color: 'white', background: '#3182ce', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', alignSelf: 'flex-end', marginBottom: 1 }}
        >
          Add
        </button>
      </div>
      {actionError && <div style={{ fontSize: 13, color: '#e53e3e', marginTop: 6 }}>{actionError}</div>}
    </div>
  );
}
