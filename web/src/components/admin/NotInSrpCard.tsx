'use client';

import { useRef, useState } from 'react';
import type { AdminPerson } from '@/lib/clusterNotebook';
import { adminPersonLine, adminPersonTags, createdNote, findPeople } from '@/lib/admin';

const INPUT: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '6px 8px', border: '1px solid #a0aec0', borderRadius: 6 };
const TAG: React.CSSProperties = { fontSize: 11, color: '#4a5568', background: '#edf2f7', borderRadius: 8, padding: '1px 6px', whiteSpace: 'nowrap' };

const SHOWN = 20;

// People placed in one cluster who have no SRP link (spec: admin page, People not in SRP card). A review list, not a
// daily task, so the card starts collapsed and reads on first open. Keyed by cluster in AdminClient.
export default function NotInSrpCard({ cluster }: { cluster: string }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<AdminPerson[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  // Latest read; an older read never overwrites a newer one.
  const readSeq = useRef(0);

  const load = async () => {
    const seq = ++readSeq.current;
    setLoadError('');
    try {
      const res = await fetch(`/api/admin/not-in-srp?cluster=${encodeURIComponent(cluster)}`);
      const data = await res.json();
      if (seq !== readSeq.current) return;
      if (!res.ok || data.error) { setLoadError(data.error || "Couldn't load this list."); return; }
      setPeople(data.people);
    } catch {
      if (seq === readSeq.current) setLoadError("Couldn't load this list. Please try again.");
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // First open (or a retry after a failed read): fetch here, in the click, not in an effect.
    if (next && !people) void load();
  };

  const found = people && people.length > 0 ? findPeople(people, search, SHOWN) : null;
  const title = people ? `People not in SRP (${people.length})` : 'People not in SRP';

  return (
    <div className="card">
      <div className="card-header" onClick={toggle} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <span><span style={{ fontSize: 11, marginRight: 6 }}>{open ? '▼' : '▶'}</span>{title}</span>
      </div>
      {open && (
        <div className="card-body">
          {loadError && <div style={{ color: '#c53030', fontSize: 13 }}>{loadError}</div>}
          {!people && !loadError && <div style={{ fontSize: 12, color: '#718096' }}>Loading…</div>}
          {people && people.length === 0 && <div style={{ fontSize: 13, color: '#718096' }}>No one here is missing from SRP.</div>}
          {people && people.length > 0 && (
            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or place…" aria-label="Search people not in SRP" style={{ ...INPUT, marginBottom: 6 }} />
          )}
          {found && found.matched === 0 && <div style={{ fontSize: 13, color: '#718096' }}>No one matches.</div>}
          {found && found.matched > found.shown.length && (
            <div style={{ fontSize: 12, color: '#718096' }}>Showing {found.shown.length} of {found.matched}. Search to find others.</div>
          )}
          {found && found.shown.map(p => {
            return (
              <div key={p.individual.id} style={{ padding: '8px 0', borderTop: '1px solid #edf2f7', fontSize: 14, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span>{adminPersonLine(p)}</span>
                {adminPersonTags(p).map(t => <span key={t} style={TAG}>{t}</span>)}
                {createdNote(p) && <div style={{ width: '100%', fontSize: 12, color: '#718096' }}>{createdNote(p)}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
