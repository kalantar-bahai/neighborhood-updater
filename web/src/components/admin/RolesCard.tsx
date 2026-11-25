'use client';

import { useRef, useState } from 'react';
import type { AdminPerson, PersonDetails, RoleHolding } from '@/lib/clusterNotebook';
import { endRoleConfirm, holdingLabel } from '@/lib/admin';
import { individualDisplayName } from '@/lib/personName';
import PersonFinder from './PersonFinder';
import PlaceRolePicker, { type PlaceRole } from './PlaceRolePicker';
import { PersonPanel, personDetailsView } from '../PersonPanel';

type Loaded = { details: PersonDetails | null; roles: RoleHolding[] };
// The "+ role" form: the picker's current choice (null until place and role are both chosen) and the save flag.
type Form = { value: PlaceRole | null; saving: boolean };

const BTN: React.CSSProperties = { fontSize: 13, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid #cbd5e0', background: 'white', color: '#4a5568' };
const NEW_FORM: Form = { value: null, saving: false };

// Roles on one person at a time (spec: docs/superpowers/specs/, admin page). The card is keyed by cluster in
// AdminClient, so switching cluster remounts it and clears the pick and any open form.
export default function RolesCard({ cluster }: { cluster: string }) {
  const [open, setOpen] = useState(true);
  const [person, setPerson] = useState<AdminPerson | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [ending, setEnding] = useState<string | null>(null); // role id whose end request is in flight

  // Id of the person now picked. A reply for anyone else is dropped, so a late answer for A never lands under B.
  const pickedId = useRef<string | null>(null);

  const name = person ? individualDisplayName(person.individual) : '';
  // No details from cluster-notebook reads as "not in SRP".
  const detailsState = loading ? { status: 'loading' as const }
    : loaded ? { status: 'ready' as const, view: loaded.details ? personDetailsView(loaded.details) : { inSrp: false as const } }
    : null;

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
    setPerson(p); setEnding(null); setLoaded(null); setError(''); setForm(null); setLoading(true);
    await read(p.individual.id);
    if (pickedId.current === p.individual.id) setLoading(false);
  };

  const changePerson = () => { pickedId.current = null; setEnding(null); setPerson(null); setLoaded(null); setError(''); setForm(null); };

  const endRole = async (h: RoleHolding) => {
    if (!person || !window.confirm(endRoleConfirm(name, h))) return;
    if (ending) return;
    const id = person.individual.id;
    setError(''); setEnding(h.id);
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roleId: h.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (pickedId.current !== id) return;
      if (!res.ok || data.error) { setError(data.error || "Couldn't end the role."); setEnding(null); return; }
    } catch {
      if (pickedId.current === id) { setError("Couldn't end the role. Please try again."); setEnding(null); }
      return;
    }
    await read(id);
    if (pickedId.current === id) setEnding(null);
  };

  const openForm = () => { setError(''); setForm({ ...NEW_FORM }); };

  const saveRole = async () => {
    if (!person || !form?.value || form.saving) return;
    const id = person.individual.id;
    setError('');
    setForm(f => f && { ...f, saving: true });
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ individualId: id, role: form.value.role, entityId: form.value.entityId }),
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
      <PlaceRolePicker cluster={cluster} onChange={v => setForm(x => x && { ...x, value: v && v !== 'none' ? v : null })} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={!f.value || f.saving} onClick={saveRole}
          style={{ ...BTN, background: '#3182ce', color: 'white', border: '1px solid #3182ce', opacity: !f.value || f.saving ? 0.5 : 1 }}>
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
      {(
        <div className="card-body" style={{ display: open ? undefined : 'none' }}>
          {!person ? <PersonFinder cluster={cluster} onPick={pick} /> : (
            <PersonPanel name={name} details={detailsState}
              action={<button type="button" onClick={changePerson} style={{ ...BTN, border: 'none', background: 'none', color: '#2b6cb0', minHeight: 36 }}>Change</button>}>
              {loaded && (
                <div className="pd-section" style={{ gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div className="pd-section-label">Roles{loaded.roles.length > 0 && ` · ${loaded.roles.length}`}</div>
                    {!form && (
                      <button type="button" onClick={openForm}
                        style={{ ...BTN, border: '1px solid #3182ce', color: '#2b6cb0', fontWeight: 600, minHeight: 32 }}>+ Add role</button>
                    )}
                  </div>
                  {loaded.roles.length === 0 && <div className="pd-muted">No roles.</div>}
                  {loaded.roles.length > 0 && (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                      {loaded.roles.map((h, i) => (
                        <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 4px 12px', borderTop: i > 0 ? '1px solid #edf2f7' : undefined }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexGrow: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{holdingLabel(h)}</div>
                            {h.entity && <div style={{ fontSize: 12, color: '#4a5568' }}>{h.entity.name}</div>}
                          </div>
                          <button type="button" onClick={() => endRole(h)} aria-label={endRoleConfirm(name, h)} title="End this role" disabled={ending !== null}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#c53030', minWidth: 44, minHeight: 44, padding: '0 8px', opacity: ending !== null ? 0.4 : 1 }}>
                            {ending === h.id ? 'Ending…' : 'End'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {form && formView(form)}
                </div>
              )}
              {error && <div style={{ color: '#c53030', fontSize: 13 }}>{error}</div>}
            </PersonPanel>
          )}
        </div>
      )}
    </div>
  );
}
