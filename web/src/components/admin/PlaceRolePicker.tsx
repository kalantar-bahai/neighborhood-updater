'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminPlace, RoleGrant } from '@/lib/clusterNotebook';
import { placeTree } from '@/lib/admin';
import { roleLabel } from '@/lib/people';

export type PlaceRole = { entityId: string; role: string };

const BTN: React.CSSProperties = { fontSize: 13, padding: '1px 6px', borderRadius: 6, cursor: 'pointer', border: '1px solid #cbd5e0', background: 'white', color: '#4a5568' };
const INPUT: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '6px 8px', border: '1px solid #a0aec0', borderRadius: 6 };

// Pick a place in the cluster, then a role offered at that place. onChange gets {entityId, role} whenever both are
// chosen and null whenever the choice is incomplete (or "No role" when optional). Mount it to start; it loads the
// places itself, and unmounting discards it.
export default function PlaceRolePicker({ cluster, onChange, optional = false }: {
  cluster: string; onChange: (v: PlaceRole | null) => void; optional?: boolean;
}) {
  const [places, setPlaces] = useState<AdminPlace[] | null>(null);
  const [filter, setFilter] = useState('');
  const [place, setPlace] = useState<AdminPlace | null>(null);
  const [grants, setGrants] = useState<RoleGrant[] | null>(null);
  const [role, setRole] = useState('');
  const [noRole, setNoRole] = useState(false);
  const [error, setError] = useState('');
  // Place now chosen; a roles reply for any other place is dropped.
  const placeId = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/places?cluster=${encodeURIComponent(cluster)}`);
        const data = await res.json();
        if (!live) return;
        if (!res.ok || data.error) { setError(data.error || "Couldn't load places."); return; }
        setPlaces(data.places);
      } catch {
        if (live) setError("Couldn't load places. Please try again.");
      }
    })();
    return () => { live = false; };
  }, [cluster]);

  const clearPlace = () => { placeId.current = null; setPlace(null); setGrants(null); setRole(''); onChange(null); };

  const choosePlace = async (p: AdminPlace) => {
    setError('');
    placeId.current = p.id; setPlace(p); setGrants(null); setRole('');
    onChange(null);
    try {
      const res = await fetch(`/api/admin/places?entityId=${encodeURIComponent(p.id)}`);
      const data = await res.json();
      if (placeId.current !== p.id) return;
      if (!res.ok || data.error) { setError(data.error || "Couldn't load the roles for this place."); clearPlace(); return; }
      const g: RoleGrant[] = data.roles;
      const first = g[0]?.role ?? '';
      setGrants(g); setRole(first);
      onChange(first ? { entityId: p.id, role: first } : null);
    } catch {
      if (placeId.current !== p.id) return;
      setError("Couldn't load the roles for this place. Please try again.");
      clearPlace();
    }
  };

  const chooseRole = (v: string) => { setRole(v); onChange(place && v ? { entityId: place.id, role: v } : null); };

  const toggleNoRole = (checked: boolean) => {
    setNoRole(checked);
    if (checked) { clearPlace(); setFilter(''); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {optional && (
        <label style={{ fontSize: 14 }}>
          <input type="checkbox" checked={noRole} onChange={e => toggleNoRole(e.target.checked)} /> No role
        </label>
      )}
      {!noRole && (!place ? (
        <>
          <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Filter places…" aria-label="Filter places" style={INPUT} />
          {places === null ? <div style={{ fontSize: 12, color: '#718096' }}>Loading…</div> : (
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {placeTree(places, filter).map(({ place: p, depth }) => (
                <button key={p.id} type="button" onClick={() => choosePlace(p)}
                  style={{ textAlign: 'left', background: 'none', border: 'none', padding: `4px 4px 4px ${4 + depth * 12}px`, fontSize: 14, cursor: 'pointer' }}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 13 }}>
            Place: <strong>{place.name}</strong>{' '}
            <button type="button" onClick={clearPlace} style={{ ...BTN, fontSize: 12 }}>Change</button>
          </div>
          {grants === null ? <div style={{ fontSize: 12, color: '#718096' }}>Loading…</div>
            : grants.length === 0 ? <div style={{ fontSize: 13, color: '#718096' }}>No roles can be given here.</div>
            : (
              <select value={role} onChange={e => chooseRole(e.target.value)} aria-label="Role" style={{ ...INPUT, width: 'auto' }}>
                {grants.map(g => <option key={g.role} value={g.role}>{roleLabel(g.role).label}</option>)}
              </select>
            )}
        </>
      ))}
      {error && <div style={{ color: '#c53030', fontSize: 13 }}>{error}</div>}
    </div>
  );
}
