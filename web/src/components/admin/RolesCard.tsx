'use client';

import { useRef, useState } from 'react';
import type { AdminPerson, AdminPlace, PersonDetails, RoleGrant, RoleHolding } from '@/lib/clusterNotebook';
import { endRoleConfirm, placeTree, roleHoldingLine } from '@/lib/admin';
import { roleLabel } from '@/lib/people';
import { individualDisplayName } from '@/lib/personName';
import PersonFinder from './PersonFinder';
import PersonDetailsBlock from '../PersonDetailsBlock';

type Loaded = { details: PersonDetails | null; roles: RoleHolding[] };
// The "+ role" form: pick a place, then a role offered at that place.
type Form = {
  places: AdminPlace[] | null; filter: string;
  place: AdminPlace | null; grants: RoleGrant[] | null; role: string; saving: boolean;
};

const BTN: React.CSSProperties = { fontSize: 13, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid #cbd5e0', background: 'white', color: '#4a5568' };
const INPUT: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '6px 8px', border: '1px solid #a0aec0', borderRadius: 6 };
const NEW_FORM: Form = { places: null, filter: '', place: null, grants: null, role: '', saving: false };

// Roles on one person at a time (spec: docs/superpowers/specs/, admin page). The card is keyed by cluster in
// AdminClient, so switching cluster remounts it and clears the pick and any open form.
export default function RolesCard({ cluster }: { cluster: string }) {
  const [open, setOpen] = useState(true);
  const [person, setPerson] = useState<AdminPerson | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<Form | null>(null);

  // Id of the person now picked. A reply for anyone else is dropped, so a late answer for A never lands under B.
  const pickedId = useRef<string | null>(null);

  const name = person ? individualDisplayName(person.individual) : '';

  // Reads by id, never by name. Returns whether it worked.
  const read = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/admin/person?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (pickedId.current !== id) return false;
      if (!res.ok || data.error) { setError(data.error || "Couldn't load this person."); return false; }
      setLoaded({ details: data.details, roles: data.roles });
      return true;
    } catch {
      if (pickedId.current !== id) return false;
      setError("Couldn't load this person. Please try again.");
      return false;
    }
  };

  const pick = async (p: AdminPerson) => {
    pickedId.current = p.individual.id;
    setPerson(p); setLoaded(null); setError(''); setForm(null); setLoading(true);
    await read(p.individual.id);
    if (pickedId.current === p.individual.id) setLoading(false);
  };

  const changePerson = () => { pickedId.current = null; setPerson(null); setLoaded(null); setError(''); setForm(null); };

  const endRole = async (h: RoleHolding) => {
    if (!person || !window.confirm(endRoleConfirm(name, h))) return;
    const id = person.individual.id;
    setError('');
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roleId: h.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (pickedId.current !== id) return;
      if (!res.ok || data.error) { setError(data.error || "Couldn't end the role."); return; }
    } catch {
      if (pickedId.current === id) setError("Couldn't end the role. Please try again.");
      return;
    }
    await read(id);
  };

  const openForm = async () => {
    setError('');
    setForm({ ...NEW_FORM });
    try {
      const res = await fetch(`/api/admin/places?cluster=${encodeURIComponent(cluster)}`);
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || "Couldn't load places."); setForm(null); return; }
      setForm(f => f && { ...f, places: data.places });
    } catch {
      setError("Couldn't load places. Please try again."); setForm(null);
    }
  };

  const choosePlace = async (place: AdminPlace) => {
    setError('');
    setForm(f => f && { ...f, place, grants: null, role: '' });
    try {
      const res = await fetch(`/api/admin/places?entityId=${encodeURIComponent(place.id)}`);
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || "Couldn't load the roles for this place."); setForm(f => f && { ...f, place: null }); return; }
      const grants: RoleGrant[] = data.roles;
      setForm(f => f && f.place?.id === place.id ? { ...f, grants, role: grants[0]?.role ?? '' } : f);
    } catch {
      setError("Couldn't load the roles for this place. Please try again.");
      setForm(f => f && { ...f, place: null });
    }
  };

  const saveRole = async () => {
    if (!person || !form?.place || !form.role) return;
    const id = person.individual.id;
    setError('');
    setForm(f => f && { ...f, saving: true });
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ individualId: id, role: form.role, entityId: form.place.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (pickedId.current !== id) return;
      if (!res.ok || data.error) { setError(data.error || "Couldn't add the role."); setForm(f => f && { ...f, saving: false }); return; }
    } catch {
      if (pickedId.current === id) { setError("Couldn't add the role. Please try again."); setForm(f => f && { ...f, saving: false }); }
      return;
    }
    setForm(null);
    await read(id);
  };

  const formView = (f: Form) => (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 8, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!f.place ? (
        <>
          <input type="text" value={f.filter} onChange={e => { const v = e.target.value; setForm(x => x && { ...x, filter: v }); }}
            placeholder="Filter places…" aria-label="Filter places" style={INPUT} />
          {f.places === null ? <div style={{ fontSize: 12, color: '#718096' }}>Loading…</div> : (
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {placeTree(f.places, f.filter).map(({ place, depth }) => (
                <button key={place.id} type="button" onClick={() => choosePlace(place)}
                  style={{ textAlign: 'left', background: 'none', border: 'none', padding: `4px 4px 4px ${4 + depth * 12}px`, fontSize: 14, cursor: 'pointer' }}>
                  {place.name}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 13 }}>
            Place: <strong>{f.place.name}</strong>{' '}
            <button type="button" onClick={() => setForm(x => x && { ...x, place: null, grants: null, role: '' })}
              style={{ ...BTN, padding: '1px 6px', fontSize: 12 }}>Change</button>
          </div>
          {f.grants === null ? <div style={{ fontSize: 12, color: '#718096' }}>Loading…</div>
            : f.grants.length === 0 ? <div style={{ fontSize: 13, color: '#718096' }}>No roles can be given here.</div>
            : (
              <select value={f.role} onChange={e => { const v = e.target.value; setForm(x => x && { ...x, role: v }); }}
                aria-label="Role" style={{ ...INPUT, width: 'auto' }}>
                {f.grants.map(g => <option key={g.role} value={g.role}>{roleLabel(g.role).label}</option>)}
              </select>
            )}
        </>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={!f.place || !f.role || f.saving} onClick={saveRole}
          style={{ ...BTN, background: '#3182ce', color: 'white', border: '1px solid #3182ce', opacity: !f.place || !f.role || f.saving ? 0.5 : 1 }}>
          {f.saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" disabled={f.saving} onClick={() => { setForm(null); setError(''); }} style={BTN}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <span><span style={{ fontSize: 11, marginRight: 6 }}>{open ? '▼' : '▶'}</span>Roles</span>
      </div>
      {open && (
        <div className="card-body">
          {!person ? <PersonFinder cluster={cluster} onPick={pick} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <strong style={{ fontSize: 16 }}>{name}</strong>
                <button type="button" onClick={changePerson} style={BTN}>Change person</button>
              </div>
              {loading && <div style={{ fontSize: 12, color: '#718096' }}>Loading…</div>}
              {loaded && (
                loaded.details
                  ? <PersonDetailsBlock details={loaded.details} />
                  : <div style={{ fontSize: 13, color: '#718096' }}>Not in SRP; nothing synced</div>
              )}
              {loaded && (
                <div style={{ paddingTop: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#4a5568' }}>Roles</div>
                  {loaded.roles.length === 0 && <div style={{ fontSize: 13, color: '#718096' }}>No roles.</div>}
                  {loaded.roles.map(h => (
                    <div key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, padding: '2px 0' }}>
                      <span>{roleHoldingLine(h)}</span>
                      <button type="button" onClick={() => endRole(h)} aria-label={endRoleConfirm(name, h)} title="End this role"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 2 }}>🗑</button>
                    </div>
                  ))}
                  {!form && <button type="button" onClick={openForm} style={{ ...BTN, marginTop: 6 }}>+ role</button>}
                  {form && formView(form)}
                </div>
              )}
              {error && <div style={{ color: '#c53030', fontSize: 13 }}>{error}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
