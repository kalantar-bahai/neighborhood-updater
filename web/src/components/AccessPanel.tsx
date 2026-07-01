'use client';

import { useState, useEffect } from 'react';
import type { AccessEntry, Role } from '@/types';

interface Props {
  nucleus?: string;
  roleMap: Record<string, Role>;
}

const ROLES: Role[] = ['read', 'read-write', 'admin'];

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
    const res = await fetch('/api/access', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: entry.email, nucleus: entry.nucleus }),
    });
    if (!res.ok) { setOpError('Failed to remove entry'); return; }
    setEntries(prev => prev.filter(e => !(e.email === entry.email && e.nucleus === entry.nucleus)));
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
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={`${e.email}-${e.nucleus}`} style={{ borderBottom: '1px solid #f7fafc' }}>
                <td style={{ padding: '4px 8px' }}>{e.name}</td>
                <td style={{ padding: '4px 8px', color: '#718096' }}>{e.email}</td>
                <td style={{ padding: '4px 8px' }}>{e.role}</td>
                <td style={{ padding: '4px 8px', color: '#718096' }}>{e.nucleus}</td>
                <td style={{ padding: '4px 8px' }}>
                  <button
                    onClick={() => handleRemove(e)}
                    style={{ fontSize: 12, color: '#e53e3e', background: 'none', border: '1px solid #fed7d7', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
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
