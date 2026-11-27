'use client';

import { useEffect, useRef, useState } from 'react';
import type { Household } from '@/lib/clusterNotebook';

export type Found = { id: string; name: string; place: string; homeNucleus: string | null; household?: Household | null };

// Search everyone in the cluster (name and place path), or create a new person.
export default function PersonSearch({ nucleus, hiddenIds, onPick, placeholder = 'Find a person in this cluster…' }: { nucleus: string; hiddenIds: string[]; onPick: (p: Found) => void; placeholder?: string }) {
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
      onPick({ id: data.id, name: data.name, place: '', homeNucleus: null });
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
        placeholder={placeholder}
        aria-label="Find a person"
      />
      {query && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column' }}>
          {results.map(p => (
            <button key={p.id} type="button" onClick={() => { setInput(''); setResults([]); onPick(p); }}
              style={{ textAlign: 'left', background: 'none', border: 'none', padding: '4px 2px', cursor: 'pointer', fontSize: 13 }}>
              {p.name}{hiddenIds.includes(p.id) && ' (hidden here)'}{p.place && <span style={{ color: '#718096' }}> · {p.place}</span>}
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
