'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminPerson } from '@/lib/clusterNotebook';
import { adminPersonLine } from '@/lib/admin';

const DEBOUNCE_MS = 300;
const TAG: React.CSSProperties = { fontSize: 11, color: '#4a5568', background: '#edf2f7', borderRadius: 8, padding: '1px 6px', whiteSpace: 'nowrap' };

// Search people in one cluster. Every result shows age and place path so same-named people can be told
// apart; the caller gets the whole AdminPerson and must use its individual id from then on, never the name.
export default function PersonFinder({ cluster, onPick }: { cluster: string; onPick: (p: AdminPerson) => void }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<AdminPerson[] | null>(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the latest search may write results, so a slow early response can't replace a newer one.
  const seq = useRef(0);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const search = async (q: string, n: number) => {
    try {
      const res = await fetch(`/api/admin/people?cluster=${encodeURIComponent(cluster)}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (n !== seq.current) return;
      if (!res.ok || data.error) { setError(data.error || 'Search failed.'); setResults(null); }
      else { setError(''); setResults(data.people); }
    } catch {
      if (n !== seq.current) return;
      setError('Search failed. Please try again.'); setResults(null);
    }
    if (n === seq.current) setSearching(false);
  };

  const onChange = (value: string) => {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    const n = ++seq.current;
    if (!q) { setResults(null); setError(''); setSearching(false); return; }
    setSearching(true);
    timer.current = setTimeout(() => { void search(q, n); }, DEBOUNCE_MS);
  };

  return (
    <div>
      <input
        type="text"
        value={text}
        onChange={e => onChange(e.target.value)}
        placeholder="Find a person in this cluster…"
        aria-label="Find a person in this cluster"
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '6px 8px', border: '1px solid #a0aec0', borderRadius: 6 }}
      />
      {error && <div style={{ color: '#c53030', fontSize: 13, marginTop: 6 }}>{error}</div>}
      {searching && <div style={{ fontSize: 12, color: '#718096', marginTop: 6 }}>Searching…</div>}
      {!searching && results && results.length === 0 && <div style={{ fontSize: 13, color: '#718096', marginTop: 6 }}>No one found.</div>}
      {results && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          {results.map(p => (
            <button
              key={p.individual.id}
              type="button"
              onClick={() => onPick(p)}
              style={{ textAlign: 'left', background: 'white', border: '1px solid #cbd5e0', borderRadius: 6, padding: '6px 8px', fontSize: 14, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
            >
              <span>{adminPersonLine(p)}</span>
              {p.hasAccess && <span style={TAG}>has access</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
