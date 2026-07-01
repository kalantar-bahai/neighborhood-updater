'use client';

import { useState, useEffect } from 'react';
import type { AccessEntry, Role } from '@/types';

interface Props {
  nucleus?: string;
  roleMap: Record<string, Role>;
}

const ROLES: Role[] = ['read', 'read-write', 'collaborator', 'admin'];

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
    <button
      onClick={onClick}
      title={title}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: '2px 4px', display: 'inline-flex', alignItems: 'center' }}
    >
      {children}
    </button>
  );
}

export default function AccessPanel({ nucleus, roleMap }: Props) {
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<Role>('read');
  const [newNucleus, setNewNucleus] = useState(nucleus ?? '');
  const [saving, setSaving] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AccessEntry | null>(null);
  const [editOriginal, setEditOriginal] = useState<AccessEntry | null>(null);

  const hasGlobalAdmin = roleMap['*'] === 'admin';
  const nucleusFixed = nucleus !== undefined;

  useEffect(() => {
    const url = nucleus ? `/api/access?nucleus=${encodeURIComponent(nucleus)}` : '/api/access';
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setEntries(data.entries);
      })
      .catch(() => setError('Failed to load access entries.'))
      .finally(() => setLoading(false));
  }, [nucleus]);

  async function handleAdd() {
    if (!newName.trim() || !newEmail.trim()) return;
    setSaving(true);
    setOpError(null);
    try {
      const entry: AccessEntry = {
        name: newName.trim(),
        email: newEmail.trim(),
        role: newRole,
        nucleus: newNucleus,
      };
      const res = await fetch('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      const data = await res.json();
      if (!res.ok) { setOpError(data.error || 'Failed to add'); return; }
      setEntries(prev => [...prev, entry]);
      setNewName('');
      setNewEmail('');
      setNewRole('read');
      setNewNucleus(nucleus ?? '');
    } catch {
      setOpError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(entry: AccessEntry) {
    setOpError(null);
    const res = await fetch('/api/access', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: entry.email, nucleus: entry.nucleus }),
    });
    if (!res.ok) { setOpError('Failed to remove entry'); return; }
    setEntries(prev => prev.filter(e => !(e.email === entry.email && e.nucleus === entry.nucleus)));
  }

  function startEdit(entry: AccessEntry) {
    setEditKey(`${entry.email}-${entry.nucleus}`);
    setEditForm({ ...entry });
    setEditOriginal({ ...entry });
    setOpError(null);
  }

  function cancelEdit() {
    setEditKey(null);
    setEditForm(null);
    setEditOriginal(null);
  }

  async function handleSaveEdit() {
    if (!editForm || !editOriginal) return;
    setSaving(true);
    setOpError(null);
    try {
      const delRes = await fetch('/api/access', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: editOriginal.email, nucleus: editOriginal.nucleus }),
      });
      if (!delRes.ok) { setOpError('Failed to update entry'); return; }

      const addRes = await fetch('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const addData = await addRes.json();
      if (!addRes.ok) { setOpError(addData.error || 'Failed to update entry'); return; }

      setEntries(prev => prev.map(e =>
        e.email === editOriginal.email && e.nucleus === editOriginal.nucleus ? { ...editForm } : e
      ));
      cancelEdit();
    } catch {
      setOpError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ fontSize: 13, color: '#718096', padding: '8px 0' }}>Loading access...</div>;
  if (error) return <div style={{ fontSize: 13, color: '#e53e3e', padding: '8px 0' }}>{error}</div>;

  return (
    <div style={{ marginTop: 12 }}>
      {entries.length === 0 ? (
        <div style={{ fontSize: 13, color: '#718096', marginBottom: 12 }}>No access entries yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#4a5568' }}>Name</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#4a5568' }}>Email</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#4a5568' }}>Role</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#4a5568' }}>Nucleus</th>
              <th style={{ width: 56 }}></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const key = `${e.email}-${e.nucleus}`;
              const isEditing = editKey === key;
              return (
                <tr key={key} style={{ borderBottom: '1px solid #f7fafc' }}>
                  {isEditing && editForm ? (
                    <>
                      <td style={{ padding: '4px 8px' }}>
                        <input value={editForm.name} onChange={ev => setEditForm(f => f && ({ ...f, name: ev.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input value={editForm.email} onChange={ev => setEditForm(f => f && ({ ...f, email: ev.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <select value={editForm.role} onChange={ev => setEditForm(f => f && ({ ...f, role: ev.target.value as Role }))} style={{ fontSize: 13 }}>
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        {!nucleusFixed && hasGlobalAdmin
                          ? <input value={editForm.nucleus} onChange={ev => setEditForm(f => f && ({ ...f, nucleus: ev.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                          : <span style={{ color: '#718096' }}>{e.nucleus}</span>
                        }
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        {iconBtn(handleSaveEdit, 'Save', '#276749', <IcoCheck />)}
                        {iconBtn(cancelEdit, 'Cancel', '#718096', <IcoX />)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: '4px 8px' }}>{e.name}</td>
                      <td style={{ padding: '4px 8px', color: '#718096' }}>{e.email}</td>
                      <td style={{ padding: '4px 8px' }}>{e.role}</td>
                      <td style={{ padding: '4px 8px', color: '#718096' }}>{e.nucleus}</td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        {iconBtn(() => startEdit(e), 'Edit', '#3182ce', <IcoPencil />)}
                        {iconBtn(() => handleRemove(e), 'Remove', '#e53e3e', <IcoTrash />)}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '1 1 140px', margin: 0 }}>
          <label style={{ fontSize: 12 }}>Name</label>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name" style={{ fontSize: 13 }} />
        </div>
        <div className="field" style={{ flex: '1 1 180px', margin: 0 }}>
          <label style={{ fontSize: 12 }}>Email</label>
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@example.com" style={{ fontSize: 13 }} />
        </div>
        <div className="field" style={{ flex: '0 1 120px', margin: 0 }}>
          <label style={{ fontSize: 12 }}>Role</label>
          <select value={newRole} onChange={e => setNewRole(e.target.value as Role)} style={{ fontSize: 13 }}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {!nucleusFixed && hasGlobalAdmin && (
          <div className="field" style={{ flex: '0 1 160px', margin: 0 }}>
            <label style={{ fontSize: 12 }}>Nucleus</label>
            <input type="text" value={newNucleus} onChange={e => setNewNucleus(e.target.value)} placeholder="name or *" style={{ fontSize: 13 }} />
          </div>
        )}
        <button
          onClick={handleAdd}
          disabled={saving || !newName.trim() || !newEmail.trim()}
          style={{ fontSize: 13, color: 'white', background: '#3182ce', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', alignSelf: 'flex-end', marginBottom: 1 }}
        >
          Add
        </button>
      </div>
      {opError && <div style={{ fontSize: 13, color: '#e53e3e', marginTop: 6 }}>{opError}</div>}
    </div>
  );
}
