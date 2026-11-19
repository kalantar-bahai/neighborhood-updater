'use client';

import { useEffect, useRef, useState } from 'react';
import type { PermissionSet } from '@/lib/clusterNotebook';
import {
  KNOWN_ROLES, RESIDENT, canEditRole, filterPeople, nextRoleIds, peopleFilters, roleLabel, sortRoles,
  type PersonRow,
} from '@/lib/people';

// People card, phase 1 (spec: docs/superpowers/specs/2026-11-18-people-card-design.md).
// Everyone connected to the nucleus: role holders here, plus residents on a home nucleus.
// Residency is read-only until phase 2 can move people in SRP.

interface Props {
  nucleus: string;
  isHome: boolean;
  permissions: PermissionSet;
  refreshKey: number;
  onRolesChanged: () => void;
}

type Found = { id: string; name: string; place: string };
// The person whose roles are being edited: an existing row, or someone just found or created.
type Editing = { id: string; name: string; roles: string[]; isResident: boolean; isNew: boolean };

const SINGLE_ROLES = ['contact'];

function RoleMarks({ row, isHome }: { row: PersonRow; isHome: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {isHome && row.isResident && <span role="img" aria-label={RESIDENT.label} title={RESIDENT.label}>{RESIDENT.icon}</span>}
      {sortRoles(row.roles).map(role => {
        const { label, icon } = roleLabel(role);
        return icon
          ? <span key={role} role="img" aria-label={label} title={label}>{icon}</span>
          : <span key={role} title={label} style={{ fontSize: 11, color: '#4a5568', background: '#edf2f7', borderRadius: 8, padding: '1px 6px' }}>{label}</span>;
      })}
    </span>
  );
}

export default function PeopleCard({ nucleus, isHome, permissions, refreshKey, onRolesChanged }: Props) {
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [adding, setAdding] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(`/api/people?nucleus=${encodeURIComponent(nucleus)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load people');
        if (live) { setRows(data.people); setLoadError(''); }
      })
      .catch((e: unknown) => { if (live) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [nucleus, refreshKey, reloads]);

  const anyEditable = permissions.canAssignRoles;
  const canAdd = permissions.canWrite && permissions.canAssignRoles;

  function startEdit(e: Editing) {
    setEditing(e);
    setTicked(e.roles);
    setSaveError('');
    setAdding(false);
  }

  // Roles offered in the editor: the known ones plus any this person already holds.
  function editorRoles(e: Editing): string[] {
    return sortRoles([...KNOWN_ROLES, ...e.roles]);
  }

  async function save(target: Editing, nextRoles: string[]) {
    const changed = editorRoles(target).filter(role =>
      canEditRole(permissions, role) && target.roles.includes(role) !== nextRoles.includes(role));
    if (changed.length === 0) { setEditing(null); return; }

    for (const role of changed) {
      if (!SINGLE_ROLES.includes(role) || !nextRoles.includes(role)) continue;
      const current = (rows ?? []).find(r => r.id !== target.id && r.roles.includes(role));
      if (current && !window.confirm(`This replaces ${current.name} as ${roleLabel(role).label.toLowerCase()}.`)) return;
    }

    setSaving(true);
    setSaveError('');
    try {
      for (const role of changed) {
        const res = await fetch(`/api/workers?nucleus=${encodeURIComponent(nucleus)}&type=${encodeURIComponent(role)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to load ${roleLabel(role).label}`);
        const currentIds = (data.workers as { id: string }[]).map(w => w.id);
        const personIds = nextRoleIds(currentIds, target.id, nextRoles.includes(role), SINGLE_ROLES.includes(role));
        const post = await fetch('/api/workers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nucleus, type: role, personIds }),
        });
        const postData = await post.json();
        if (!post.ok) throw new Error(postData.error || `Failed to save ${roleLabel(role).label}`);
      }
      setEditing(null);
      setSaving(false);
      // Re-read the whole nucleus so the card and the Overview lists both show what was saved.
      onRolesChanged();
    } catch (e: unknown) {
      // Keep the error on screen: re-read only this card (earlier roles may have saved).
      setSaveError(e instanceof Error ? e.message : String(e));
      setSaving(false);
      setReloads(n => n + 1);
    }
  }

  if (loadError) return <div style={{ fontSize: 13, color: '#c53030' }}>{loadError}</div>;
  if (!rows) return <div style={{ fontSize: 13, color: '#718096' }}>Loading people…</div>;

  const filters = peopleFilters(rows, isHome);
  const activeFilter = filters.some(f => f.key === filter) ? filter : 'all';
  const shown = filterPeople(rows, activeFilter, search);

  const editor = (e: Editing) => (
    <div style={{ padding: '8px 0 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {isHome && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#a0aec0' }}>
          <input type="checkbox" checked={e.isResident} disabled readOnly />
          {RESIDENT.icon} {RESIDENT.label} <span style={{ fontSize: 11 }}>(set in SRP for now)</span>
        </label>
      )}
      {editorRoles(e).map(role => {
        const { label, icon } = roleLabel(role);
        const editable = canEditRole(permissions, role);
        return (
          <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: editable ? undefined : '#a0aec0' }}>
            <input
              type="checkbox"
              checked={ticked.includes(role)}
              disabled={!editable || saving}
              onChange={ev => setTicked(t => ev.target.checked ? [...t, role] : t.filter(r => r !== role))}
            />
            {icon} {label}
          </label>
        );
      })}
      {saveError && <div style={{ fontSize: 12, color: '#c53030' }}>{saveError}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="button" disabled={saving} onClick={() => save(e, ticked)} style={btn('#3182ce', 'white')}>{saving ? 'Saving…' : 'Save'}</button>
        {!e.isNew && e.roles.some(r => canEditRole(permissions, r)) && (
          <button type="button" disabled={saving} onClick={() => save(e, e.roles.filter(r => !canEditRole(permissions, r)))} style={btn('white', '#c53030', '#feb2b2')}>Remove</button>
        )}
        <button type="button" disabled={saving} onClick={() => setEditing(null)} style={btn('white', '#4a5568', '#cbd5e0')}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <select value={activeFilter} onChange={e => setFilter(e.target.value)} aria-label="Filter people" style={{ width: 'auto' }}>
          {filters.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search names…" aria-label="Search names" style={{ flex: 1, minWidth: 120 }} />
        {canAdd && (
          <button type="button" onClick={() => { setAdding(a => !a); setEditing(null); }} style={btn('#3182ce', 'white')}>+ Add</button>
        )}
      </div>

      {adding && (
        <AddPerson
          nucleus={nucleus}
          onPick={p => {
            const existing = rows.find(r => r.id === p.id);
            startEdit(existing
              ? { ...existing, isNew: false }
              : { id: p.id, name: p.name, roles: [], isResident: false, isNew: true });
          }}
        />
      )}
      {editing?.isNew && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{editing.name}</div>
          {editor(editing)}
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: '#718096' }}>No one is connected to this nucleus yet.</div>
      ) : (
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {shown.map(r => (
            <div key={r.id} style={{ borderBottom: '1px solid #f7fafc', padding: '6px 0' }}>
              <div
                onClick={anyEditable ? () => (editing?.id === r.id ? setEditing(null) : startEdit({ ...r, isNew: false })) : undefined}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: anyEditable ? 'pointer' : 'default' }}
              >
                <span style={{ fontSize: 14 }}>{r.name}</span>
                <RoleMarks row={r} isHome={isHome} />
              </div>
              {editing && !editing.isNew && editing.id === r.id && editor(editing)}
            </div>
          ))}
          {shown.length === 0 && <div style={{ fontSize: 13, color: '#718096' }}>No matches.</div>}
        </div>
      )}
    </div>
  );
}

function btn(background: string, color: string, border = background): React.CSSProperties {
  return { padding: '4px 10px', borderRadius: 6, border: `1px solid ${border}`, background, color, fontSize: 13, cursor: 'pointer' };
}

// Search everyone in the cluster (name and place path), or create a new person.
function AddPerson({ nucleus, onPick }: { nucleus: string; onPick: (p: { id: string; name: string }) => void }) {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<Found[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const query = input.trim();
    if (!query) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/individuals?nucleus=${encodeURIComponent(nucleus)}&search=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (mine !== seq.current) return;
        if (!res.ok) throw new Error(data.error || 'Search failed');
        setResults(data.individuals);
        setMore(Boolean(data.more));
        setError('');
      } catch (e: unknown) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : String(e));
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [input, nucleus]);

  async function create(name: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/individuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nucleus, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      setInput('');
      setResults([]);
      onPick({ id: data.id, name: data.name });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const query = input.trim();
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 8, marginBottom: 8 }}>
      <input
        autoFocus
        value={input}
        onChange={e => { setInput(e.target.value); setResults([]); setMore(false); }}
        placeholder="Find a person in this cluster…"
        aria-label="Find a person"
      />
      {query && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column' }}>
          {results.map(p => (
            <button key={p.id} type="button" onClick={() => { setInput(''); setResults([]); onPick(p); }}
              style={{ textAlign: 'left', background: 'none', border: 'none', padding: '4px 2px', cursor: 'pointer', fontSize: 13 }}>
              {p.name}{p.place && <span style={{ color: '#718096' }}> · {p.place}</span>}
            </button>
          ))}
          {more && <div style={{ fontSize: 12, color: '#718096', padding: '2px' }}>Keep typing to narrow the list.</div>}
          <button type="button" disabled={busy} onClick={() => create(query)}
            style={{ textAlign: 'left', background: 'none', border: 'none', padding: '4px 2px', cursor: 'pointer', fontSize: 13, color: '#3182ce' }}>
            Create “{query}”
          </button>
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: '#c53030', marginTop: 4 }}>{error}</div>}
    </div>
  );
}
