'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminPerson } from '@/lib/clusterNotebook';
import { adminPersonLine, adminPersonTags, findPeople, roleHoldingLine } from '@/lib/admin';

const BTN: React.CSSProperties = { fontSize: 13, padding: '4px 10px', minHeight: 44, borderRadius: 6, cursor: 'pointer', border: '1px solid #cbd5e0', background: 'white', color: '#4a5568' };
const INPUT: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '6px 8px', border: '1px solid #a0aec0', borderRadius: 6 };
const TAG: React.CSSProperties = { fontSize: 11, color: '#4a5568', background: '#edf2f7', borderRadius: 8, padding: '1px 6px', whiteSpace: 'nowrap' };

const SHOWN = 20;

// People who hold a role in one cluster but cannot sign in yet (spec: admin page, No account yet card). Invite… hands
// the person to the Invite card. `version` goes up when an invitation is sent, so the list re-reads and shows "invited".
// Keyed by cluster in AdminClient.
export default function NoAccountCard({ cluster, version, onInvite }: { cluster: string; version: number; onInvite: (p: AdminPerson) => void }) {
  const [open, setOpen] = useState(true);
  const [people, setPeople] = useState<AdminPerson[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  // Latest read; an older read never overwrites a newer one.
  const readSeq = useRef(0);

  // A re-read (version changed) keeps the list showing; only a first read shows "Loading…".
  useEffect(() => {
    const seq = ++readSeq.current;
    fetch(`/api/admin/no-account?cluster=${encodeURIComponent(cluster)}`)
      .then(async res => {
        const data = await res.json();
        if (seq !== readSeq.current) return;
        if (!res.ok || data.error) { setLoadError(data.error || "Couldn't load this list."); return; }
        setLoadError(''); setPeople(data.people);
      })
      .catch(() => { if (seq === readSeq.current) setLoadError("Couldn't load this list. Please try again."); });
  }, [cluster, version]);

  const found = people && people.length > 0 ? findPeople(people, search, SHOWN) : null;
  const title = people ? `No account yet (${people.length})` : 'No account yet';

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <span><span style={{ fontSize: 11, marginRight: 6 }}>{open ? '▼' : '▶'}</span>{title}</span>
      </div>
      {open && (
        <div className="card-body">
          {loadError && <div style={{ color: '#c53030', fontSize: 13 }}>{loadError}</div>}
          {!people && !loadError && <div style={{ fontSize: 12, color: '#718096' }}>Loading…</div>}
          {people && people.length === 0 && <div style={{ fontSize: 13, color: '#718096' }}>Everyone with a role here can sign in.</div>}
          {people && people.length > 0 && (
            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or place…" aria-label="Search people with no account" style={{ ...INPUT, marginBottom: 6 }} />
          )}
          {found && found.matched === 0 && <div style={{ fontSize: 13, color: '#718096' }}>No one matches.</div>}
          {found && found.matched > found.shown.length && (
            <div style={{ fontSize: 12, color: '#718096' }}>Showing {found.shown.length} of {found.matched}. Search to find others.</div>
          )}
          {found && found.shown.map(p => (
            <div key={p.individual.id} style={{ padding: '8px 0', borderTop: '1px solid #edf2f7' }}>
              <div style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span>{adminPersonLine(p)}</span>
                {adminPersonTags(p).map(t => <span key={t} style={TAG}>{t}</span>)}
              </div>
              {p.roles && p.roles.length > 0 && (
                <div style={{ fontSize: 13, color: '#718096', marginTop: 2 }}>{p.roles.map(roleHoldingLine).join('; ')}</div>
              )}
              <button type="button" onClick={() => onInvite(p)} style={{ ...BTN, marginTop: 6 }}>Invite…</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
