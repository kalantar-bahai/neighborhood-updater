'use client';

import { useRef, useState } from 'react';
import type { LogEntry } from '@/lib/clusterNotebook';
import { logHeadline, logChanges, logRefusal, nextLogCursor, mergeLogPages } from '@/lib/admin';

const BTN: React.CSSProperties = { fontSize: 13, padding: '4px 12px', minHeight: 44, borderRadius: 6, cursor: 'pointer', border: '1px solid #cbd5e0', background: 'white', color: '#4a5568' };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// Every change in one cluster, newest first, 100 at a time. Starts collapsed and reads on first open.
// Keyed by cluster in AdminClient.
export default function LogCard({ cluster }: { cluster: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  // The last page fetched: decides whether Older shows.
  const [lastPage, setLastPage] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const readSeq = useRef(0);

  // Fetch one page; the first page (no cursor) replaces nothing, Older appends and keeps what is shown if it fails.
  const load = async (cursor: { before: string; beforeId: string } | null) => {
    const seq = ++readSeq.current;
    setError('');
    setLoading(true);
    try {
      const qs = new URLSearchParams({ cluster });
      if (cursor) { qs.set('before', cursor.before); qs.set('beforeId', cursor.beforeId); }
      const res = await fetch(`/api/admin/log?${qs}`);
      const data = await res.json();
      if (seq !== readSeq.current) return;
      if (!res.ok || data.error) { setError(data.error || "Couldn't load the log."); return; }
      const page: LogEntry[] = data.entries;
      setEntries(prev => (cursor && prev ? mergeLogPages(prev, page) : page));
      setLastPage(page);
    } catch {
      if (seq === readSeq.current) setError("Couldn't load the log. Please try again.");
    } finally {
      if (seq === readSeq.current) setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Every open re-reads page one, in the click, not in an effect. Old rows stay until the new page lands.
    if (next) void load(null);
  };

  const toggleRow = (id: string) =>
    setExpanded(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });

  const cursor = nextLogCursor(lastPage);

  return (
    <div className="card">
      <div className="card-header" onClick={toggle} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <span><span style={{ fontSize: 11, marginRight: 6 }}>{open ? '▼' : '▶'}</span>Log</span>
      </div>
      {open && (
        <div className="card-body">
          {entries && entries.length === 0 && <div style={{ fontSize: 13, color: '#718096' }}>No changes logged in this cluster.</div>}
          {entries && entries.map(e => {
            const isOpen = expanded.has(e.id);
            return (
              <div key={e.id} style={{ borderTop: '1px solid #edf2f7' }}>
                <div onClick={() => toggleRow(e.id)} style={{ padding: '8px 0', cursor: 'pointer', fontSize: 14 }}>
                  <div style={{ fontSize: 12, color: '#718096' }}>{when(e.occurredAt)}</div>
                  <div style={{ overflowWrap: 'anywhere' }}>{logHeadline(e)}</div>
                  {logRefusal(e) && <div style={{ fontSize: 12, color: '#c53030' }}>{logRefusal(e)}</div>}
                </div>
                {isOpen && (
                  logChanges(e).length === 0 ? (
                    <div style={{ fontSize: 12, color: '#718096', marginBottom: 8 }}>No field changes.</div>
                  ) : (
                  <table style={{ fontSize: 12, width: '100%', marginBottom: 8, borderCollapse: 'collapse' }}>
                    <tbody>
                      {logChanges(e).map(c => (
                        <tr key={c.field}>
                          <td style={{ padding: '2px 8px 2px 0', color: '#4a5568', verticalAlign: 'top', overflowWrap: 'anywhere' }}>{c.field}</td>
                          <td style={{ padding: '2px 0', overflowWrap: 'anywhere' }}>{c.old} → {c.new}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  )
                )}
              </div>
            );
          })}
          {entries && entries.length > 0 && (
            cursor ? (
              <button type="button" disabled={loading} onClick={() => void load(cursor)} style={{ ...BTN, marginTop: 6 }}>
                {loading ? 'Loading…' : 'Older'}
              </button>
            ) : (
              <div style={{ fontSize: 12, color: '#718096', marginTop: 6 }}>No older changes.</div>
            )
          )}
          {!entries && loading && <div style={{ fontSize: 12, color: '#718096' }}>Loading…</div>}
          {error && (
            <div style={{ color: '#c53030', fontSize: 13, marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>{error}</span>
              {!entries && <button type="button" onClick={() => void load(null)} style={BTN}>Try again</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
