'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface AdminCluster { id: string; name: string }

type State =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; clusters: AdminCluster[] };

const homeLink = { fontSize: 13, color: '#2b6cb0' };

export default function AdminClient() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  // The cluster being administered. Cards below are keyed by it, so switching
  // remounts them and clears any picked person or open role form.
  const [cluster, setCluster] = useState('');

  useEffect(() => {
    fetch('/api/admin/clusters')
      .then(async r => {
        if (r.status === 403) { setState({ kind: 'denied' }); return; }
        const data = await r.json();
        if (!r.ok || data.error) { setState({ kind: 'error', message: data.error || 'Failed to load.' }); return; }
        const clusters: AdminCluster[] = data.clusters;
        if (clusters.length === 0) { setState({ kind: 'denied' }); return; }
        setCluster(clusters[0].name);
        setState({ kind: 'ready', clusters });
      })
      .catch(() => setState({ kind: 'error', message: 'Failed to load. Please refresh.' }));
  }, []);

  if (state.kind === 'loading') return <div className="loading-state">Loading...</div>;

  if (state.kind === 'denied') {
    return (
      <div style={{ maxWidth: 880, margin: '0 auto', padding: 16 }}>
        <Link href="/" style={homeLink}>Home</Link>
        <h1 style={{ fontSize: 20, marginTop: 16 }}>Access denied</h1>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div style={{ maxWidth: 880, margin: '0 auto', padding: 16 }}>
        <Link href="/" style={homeLink}>Home</Link>
        <p style={{ color: '#c53030', marginTop: 16 }}>{state.message}</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '16px 16px 40px' }}>
      <Link href="/" style={homeLink}>Home</Link>
      <div style={{ fontSize: 12, color: '#718096', marginTop: 12 }}>Admin</div>
      {state.clusters.length === 1 ? (
        <h1 style={{ fontSize: 20, margin: '2px 0 16px' }}>{state.clusters[0].name}</h1>
      ) : (
        <select
          value={cluster}
          onChange={e => setCluster(e.target.value)}
          aria-label="Cluster"
          style={{ fontSize: 16, margin: '4px 0 16px', padding: '4px 8px', display: 'block' }}
        >
          {state.clusters.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      )}
      {/* Roles card: Task 5 */}
      {/* Hidden people card: Task 6 */}
    </div>
  );
}
