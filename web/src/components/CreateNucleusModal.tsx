'use client';

import { useState } from 'react';

interface Props {
  clusterNames: string[];
  onClose: () => void;
  onCreated: (name: string) => void;
}

// Only the two fields createNucleus actually needs (identity: name + cluster).
// Everything else -- population, activities, narrative, worker roles like
// Contact/Promoting/Helping/Accompanying/ABm Assistant -- can't be set until the
// nucleus exists in cluster-notebook anyway (those all query/mutate by nucleus
// name), so there's no point collecting them here. Once this succeeds we hand off
// to the normal DetailView for the newly created nucleus, where all of that works
// immediately, 2026-09-14.
export default function CreateNucleusModal({ clusterNames, onClose, onCreated }: Props) {
  const [nucleus, setNucleus] = useState('');
  const [cluster, setCluster] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const canCreate = nucleus.trim() !== '' && cluster.trim() !== '' && !creating;

  async function handleCreate() {
    if (!canCreate) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/nucleus', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData: { identity: { nucleus: nucleus.trim(), cluster } } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      onCreated(nucleus.trim());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  }

  return (
    <div
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 12, padding: '20px 24px', maxWidth: 420, width: '100%' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#2d3748' }}>New Neighborhood</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#718096', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <div className="field" style={{ marginBottom: 12 }}>
          <label>Nucleus Name</label>
          <input
            type="text"
            value={nucleus}
            onChange={e => setNucleus(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); }}
            autoFocus
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>

        <div className="field" style={{ marginBottom: 16 }}>
          <label>Cluster</label>
          <select
            value={cluster}
            onChange={e => setCluster(e.target.value)}
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', background: 'white' }}
          >
            <option value="">Select a cluster…</option>
            {clusterNames.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {error && <div style={{ color: '#e53e3e', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ fontSize: 13, color: '#718096', background: 'none', border: '1px solid #cbd5e0', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            style={{ fontSize: 13, fontWeight: 600, color: 'white', background: canCreate ? '#2b6cb0' : '#a0aec0', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: canCreate ? 'pointer' : 'default' }}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
