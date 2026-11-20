'use client';

import { useEffect, useRef, useState } from 'react';
import { PersonSrpDot } from './SrpBadge';
import type { PermissionSet, PersonDetails } from '@/lib/clusterNotebook';
import {
  AGE_LABELS, DEVOTIONAL_HOST, KNOWN_ROLES, RESIDENT, canEditRole, detailLines, detailsView, filterPeople, isMoving, moveResultError,
  nextRoleIds, peopleFilters, placePath, roleLabel, rolesToClear, sortPeople, sortRoles, syncNote, type MoveTarget,
  type PeopleSort, type PersonRow,
} from '@/lib/people';

// People card (specs: docs/superpowers/specs/2026-11-18-people-card-design.md, phase 1, and
// 2026-11-19-people-card-moves-design.md, phase 2). Everyone connected to the nucleus: role holders
// here, plus residents on a home nucleus. Ticking Resident moves someone here; unticking moves them out.
// Phase A (2026-11-20-people-card-details-design.md): age and devotional host marks, and a panel any reader
// can open, with the person's details when cluster-notebook lets the caller see them.

interface Props {
  nucleus: string;
  isHome: boolean;
  permissions: PermissionSet;
  refreshKey: number;
  // Called with the roles that were written here (even after a partial failure), so the page can
  // re-read those name lists.
  onRolesChanged: (roles: string[]) => void;
}

type Found = { id: string; name: string; place: string; homeNucleus: string | null };
// The person being edited: an existing row, or someone just found or created.
type Editing = {
  id: string; name: string; roles: string[]; isResident: boolean; isNew: boolean;
  placePath: string; homeNucleus: string | null;
};
// A move waiting for the person to confirm it.
type PendingMove = {
  personId: string; kind: 'in' | 'out'; to: MoveTarget;
  // The nucleus they are leaving, its roles they hold that the caller may clear, and whether to keep them.
  oldNucleus: string | null; oldName: string; oldRoles: string[]; keep: boolean;
};
type Moves = { here: MoveTarget | null; out: MoveTarget | null };
// The open person's details. 'none' (a 404: not permitted, or not one of this nucleus's people) shows nothing.
type Details = { personId: string; status: 'loading' | 'none' | 'error' | 'ok'; details?: PersonDetails; error?: string };

const SINGLE_ROLES = ['contact'];
const POLL_MS = 10_000;
const TAG: React.CSSProperties = { fontSize: 11, color: '#4a5568', background: '#edf2f7', borderRadius: 8, padding: '1px 6px' };

// Today's local date as YYYY-MM-DD, to compare with SRP's ISO dates.
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function RoleMarks({ row, isHome }: { row: PersonRow; isHome: boolean }) {
  const note = syncNote(row.placeSync);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {isHome && row.isResident && <span role="img" aria-label={RESIDENT.label} title={RESIDENT.label}>{RESIDENT.icon}</span>}
      {note?.tone === 'wait' && <span role="img" aria-label={note.text} title={note.text}>⏳</span>}
      {sortRoles(row.roles).map(role => {
        const { label, icon } = roleLabel(role);
        return icon
          ? <span key={role} role="img" aria-label={label} title={label}>{icon}</span>
          : <span key={role} title={label} style={TAG}>{label}</span>;
      })}
      {row.devotionalHost && (() => {
        const label = row.devotionalHost === 'CO_HOST' ? 'Devotional co-host' : DEVOTIONAL_HOST.label;
        return <span role="img" aria-label={label} title={label}>{DEVOTIONAL_HOST.icon}</span>;
      })()}
      {row.ageCategory && <span title={AGE_LABELS[row.ageCategory]} style={TAG}>{AGE_LABELS[row.ageCategory]}</span>}
    </span>
  );
}

// Set one person on or off a role's list at a nucleus (full-list replace, as /api/workers expects).
async function writeRole(nucleus: string, role: string, personId: string, on: boolean) {
  const res = await fetch(`/api/workers?nucleus=${encodeURIComponent(nucleus)}&type=${encodeURIComponent(role)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Failed to load ${roleLabel(role).label}`);
  const currentIds = (data.workers as { id: string }[]).map(w => w.id);
  const personIds = nextRoleIds(currentIds, personId, on, SINGLE_ROLES.includes(role));
  const post = await fetch('/api/workers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nucleus, type: role, personIds }),
  });
  const postData = await post.json();
  if (!post.ok) throw new Error(postData.error || `Failed to save ${roleLabel(role).label}`);
}

// The roles a person holds at another nucleus that the caller may clear there. Empty when that
// nucleus can't be read (the question is then skipped and their roles stay).
async function rolesAt(nucleus: string, personId: string): Promise<string[]> {
  try {
    const res = await fetch(`/api/people?nucleus=${encodeURIComponent(nucleus)}`);
    if (!res.ok) return [];
    const data = await res.json() as { people: PersonRow[]; editableRoles: string[] };
    const held = data.people.find(p => p.id === personId)?.roles ?? [];
    return rolesToClear(held, r => data.editableRoles.includes(r), false);
  } catch {
    return [];
  }
}

export default function PeopleCard({ nucleus, isHome, permissions, refreshKey, onRolesChanged }: Props) {
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [moves, setMoves] = useState<Moves>({ here: null, out: null });
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState<PeopleSort>('first');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [resident, setResident] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [cardError, setCardError] = useState('');
  const [adding, setAdding] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [details, setDetails] = useState<Details | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/people?nucleus=${encodeURIComponent(nucleus)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load people');
        if (live) { setRows(data.people); setMoves(data.move ?? { here: null, out: null }); setLoadError(''); }
      })
      .catch((e: unknown) => { if (live) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [nucleus, refreshKey, reloads]);

  // While a move is on its way to SRP, re-read every 10 s until it lands (or the card closes).
  const moving = rows ? isMoving(rows) : false;
  useEffect(() => {
    if (!moving) return;
    const timer = setInterval(() => setReloads(n => n + 1), POLL_MS);
    return () => clearInterval(timer);
  }, [moving]);

  const canMove = isHome && permissions.canWrite;
  // Only these callers get the Resident and roles editor in a person's panel.
  const canEditPerson = permissions.canAssignRoles || canMove;
  // Phase A: details are tier 1 (anyone who can edit the nucleus), so a plain reader's panel would be empty.
  // Phase B opens the panel to every reader, with Activities.
  const rowsClickable = canEditPerson || permissions.canWrite;
  const canAdd = permissions.canWrite && canEditPerson;

  // The person whose editor is open, read by async work that must not land on someone else.
  const editingId = useRef<string | null>(null);

  function startEdit(e: Editing) {
    if (saving) return;
    editingId.current = e.id;
    setEditing(e);
    setTicked(e.roles);
    setResident(e.isResident);
    setPendingMove(null);
    setSaveError('');
    setCardError('');
    setAdding(false);
    // Read details on each open; a new person isn't one of this nucleus's people yet, so has none here.
    if (e.isNew) { setDetails(null); return; }
    setDetails({ personId: e.id, status: 'loading' });
    loadDetails(e.id);
  }

  async function loadDetails(personId: string) {
    let next: Details;
    try {
      const res = await fetch(`/api/person-details?nucleus=${encodeURIComponent(nucleus)}&individualId=${encodeURIComponent(personId)}`);
      if (res.status === 404) {
        next = { personId, status: 'none' };
      } else if (res.ok) {
        next = { personId, status: 'ok', details: (await res.json()).details };
      } else {
        const data = await res.json().catch(() => ({}));
        next = { personId, status: 'error', error: data.error || "Couldn't load details" };
      }
    } catch (e: unknown) {
      next = { personId, status: 'error', error: e instanceof Error ? e.message : String(e) };
    }
    // Drop the answer if the panel has closed or switched to someone else meanwhile.
    if (editingId.current === personId) setDetails(next);
  }

  function close() {
    editingId.current = null;
    setEditing(null);
  }

  const fromRow = (r: PersonRow): Editing => ({
    id: r.id, name: r.name, roles: r.roles, isResident: r.isResident, isNew: false,
    placePath: placePath(r.place), homeNucleus: r.place?.homeNucleus ?? null,
  });

  // Roles offered in the editor: the known ones plus any this person already holds.
  function editorRoles(e: Editing): string[] {
    return sortRoles([...KNOWN_ROLES, ...e.roles]);
  }

  // Resident can be ticked or unticked only where there is somewhere to move them.
  function residentEnabled(e: Editing): boolean {
    return canMove && Boolean(e.isResident ? moves.out : moves.here);
  }

  async function save(target: Editing) {
    const changed = editorRoles(target).filter(role =>
      canEditRole(permissions, role) && target.roles.includes(role) !== ticked.includes(role));
    const moveWanted = resident !== target.isResident;
    if (!moveWanted && changed.length === 0) { close(); return; }

    for (const role of changed) {
      if (!SINGLE_ROLES.includes(role) || !ticked.includes(role)) continue;
      const current = (rows ?? []).find(r => r.id !== target.id && r.roles.includes(role));
      if (current && !window.confirm(`This replaces ${current.name} as ${roleLabel(role).label.toLowerCase()}.`)) return;
    }

    if (moveWanted) {
      // Ask first: where they go, and whether they keep their roles where they are leaving.
      setSaveError('');
      if (target.isResident && moves.out) {
        setPendingMove({
          personId: target.id, kind: 'out', to: moves.out, oldNucleus: nucleus, oldName: moves.here?.name ?? nucleus,
          oldRoles: ticked.filter(r => canEditRole(permissions, r)), keep: true,
        });
      } else if (!target.isResident && moves.here) {
        const old = target.homeNucleus && target.homeNucleus !== nucleus ? target.homeNucleus : null;
        setSaving(true);
        const oldRoles = old ? await rolesAt(old, target.id) : [];
        setSaving(false);
        // Drop the answer if the person switched to someone else while we were asking.
        if (editingId.current !== target.id) return;
        setPendingMove({ personId: target.id, kind: 'in', to: moves.here, oldNucleus: old, oldName: old ?? '', oldRoles, keep: true });
      }
      return;
    }
    await finish(target, null);
  }

  // Move (if confirmed), then role changes. A move refused at once stops everything.
  async function finish(target: Editing, move: PendingMove | null) {
    setSaving(true);
    setSaveError('');
    const written: string[] = [];
    let moved = false;
    try {
      let rolesHere = ticked;
      if (move) {
        const res = await fetch('/api/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nucleus, individualId: target.id, locationId: move.to.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'The move failed');
        const refused = moveResultError(data.result);
        if (refused) throw new Error(refused);
        moved = true;
        const clear = rolesToClear(move.oldRoles, () => true, move.keep);
        if (move.kind === 'out') {
          rolesHere = ticked.filter(r => !clear.includes(r));
        } else if (move.oldNucleus) {
          for (const role of clear) await writeRole(move.oldNucleus, role, target.id, false);
        }
      }
      for (const role of editorRoles(target)) {
        if (!canEditRole(permissions, role) || target.roles.includes(role) === rolesHere.includes(role)) continue;
        await writeRole(nucleus, role, target.id, rolesHere.includes(role));
        written.push(role);
      }
      close();
      setPendingMove(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setPendingMove(null);
      if (moved) {
        // The editor no longer matches the person (they have moved); close it and say what didn't save.
        close();
        setCardError(`${target.name} was moved, but a role change didn't save: ${message}`);
      } else {
        setSaveError(message);
      }
    } finally {
      setSaving(false);
      // Re-read this card, and the page's name lists for whatever did save.
      setReloads(n => n + 1);
      if (written.length > 0) onRolesChanged(written);
    }
  }

  if (loadError) return <div style={{ fontSize: 13, color: '#c53030' }}>{loadError}</div>;
  if (!rows) return <div style={{ fontSize: 13, color: '#718096' }}>Loading people…</div>;

  const filters = peopleFilters(rows, isHome);
  const activeFilter = filters.some(f => f.key === filter) ? filter : 'all';
  const shown = sortPeople(filterPeople(rows, activeFilter, search), sortBy);

  const confirmMove = (e: Editing, m: PendingMove) => (
    <div style={{ border: '1px solid #bee3f8', background: '#ebf8ff', borderRadius: 6, padding: 8, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontWeight: 600 }}>{m.kind === 'in' ? `Move ${e.name} here?` : `Move ${e.name} out of ${m.oldName}?`}</div>
      <div>{m.kind === 'in' ? `Lives in: ${e.placePath || 'not recorded'}` : `To: ${m.to.path}`}</div>
      {m.oldRoles.length > 0 && (
        <>
          <div>
            {e.name} is {m.oldRoles.map(r => `${roleLabel(r).label} ${roleLabel(r).icon ?? ''}`.trim()).join(' and ')}{' '}
            {m.kind === 'in' ? `at ${m.oldName}.` : 'here.'}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={m.keep} disabled={saving} onChange={ev => setPendingMove({ ...m, keep: ev.target.checked })} />
            {m.kind === 'in' ? `Keep roles at ${m.oldName} (still working there)` : 'Keep roles here (still working in this nucleus)'}
          </label>
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="button" disabled={saving} onClick={() => finish(e, m)} style={btn('#3182ce', 'white')}>{saving ? 'Moving…' : 'Move'}</button>
        <button type="button" disabled={saving} onClick={() => setPendingMove(null)} style={btn('white', '#4a5568', '#cbd5e0')}>Cancel</button>
      </div>
    </div>
  );

  const editor = (e: Editing) => (
    <div style={{ padding: '8px 0 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {isHome && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: residentEnabled(e) ? undefined : '#a0aec0' }}>
          <input type="checkbox" checked={resident} disabled={!residentEnabled(e) || saving || Boolean(pendingMove)}
            onChange={ev => setResident(ev.target.checked)} />
          {RESIDENT.icon} {RESIDENT.label}
        </label>
      )}
      {editorRoles(e).map(role => {
        const { label, icon } = roleLabel(role);
        const editable = canEditRole(permissions, role);
        return (
          <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: editable ? undefined : '#a0aec0' }}>
            <input
              type="checkbox"
              checked={ticked.includes(role)}
              disabled={!editable || saving || Boolean(pendingMove)}
              onChange={ev => setTicked(t => ev.target.checked ? [...t, role] : t.filter(r => r !== role))}
            />
            {icon} {label}
          </label>
        );
      })}
      {saveError && <div style={{ fontSize: 12, color: '#c53030' }}>{saveError}</div>}
      {pendingMove?.personId === e.id ? confirmMove(e, pendingMove) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" disabled={saving} onClick={() => save(e)} style={btn('#3182ce', 'white')}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" disabled={saving} onClick={close} style={btn('white', '#4a5568', '#cbd5e0')}>Cancel</button>
        </div>
      )}
    </div>
  );

  // Nothing (not even a heading) until details arrive; a 404 stays silent.
  const detailsSection = (personId: string) => {
    if (!details || details.personId !== personId || details.status === 'none') return null;
    if (details.status === 'loading') return <div style={{ fontSize: 12, color: '#718096', paddingTop: 6 }}>Loading…</div>;
    if (details.status === 'error' || !details.details) {
      return <div style={{ fontSize: 12, color: '#c53030', paddingTop: 6 }}>{details.error || "Couldn't load details"}</div>;
    }
    const v = detailsView(details.details, localToday());
    let body: React.ReactNode;
    if (!v.inSrp) {
      body = <div style={{ fontSize: 13, color: '#718096' }}>Not in SRP; nothing synced</div>;
    } else {
      const { lines, comments } = detailLines(v);
      body = (
        <>
          {lines.map((parts, i) => (
            <div key={i} style={{ fontSize: 13 }}>
              {parts.map((p, j) => (
                <span key={j}>
                  {j > 0 && ' · '}
                  <span style={p.danger ? { color: '#c53030' } : undefined}>{p.text}</span>
                </span>
              ))}
            </div>
          ))}
          {comments && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>SRP comments: {comments}</div>}
        </>
      );
    }
    return (
      <div style={{ padding: '6px 0 2px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#4a5568' }}>Details</div>
        {body}
      </div>
    );
  };

  // The panel under an existing person's row: details when permitted, then the editor or a Close button.
  const panel = (e: Editing) => (
    <div>
      {detailsSection(e.id)}
      {canEditPerson ? (
        <div style={{ borderTop: details?.personId === e.id && details.status !== 'none' ? '1px solid #e2e8f0' : undefined, marginTop: 4 }}>
          {editor(e)}
        </div>
      ) : (
        <div style={{ marginTop: 6 }}>
          <button type="button" onClick={close} style={btn('white', '#4a5568', '#cbd5e0')}>Close</button>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <select value={activeFilter} onChange={e => setFilter(e.target.value)} aria-label="Filter people" style={{ width: 'auto' }}>
          {filters.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as PeopleSort)} aria-label="Sort people" style={{ width: 'auto' }}>
          <option value="first">First name</option>
          <option value="family">Family name</option>
        </select>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search names…" aria-label="Search names" style={{ flex: 1, minWidth: 120 }} />
        {canAdd && (
          <button type="button" disabled={saving} onClick={() => { setAdding(a => !a); close(); }} style={btn('#3182ce', 'white')}>+ Add</button>
        )}
      </div>

      {cardError && <div style={{ fontSize: 12, color: '#c53030', marginBottom: 6 }}>{cardError}</div>}
      {adding && (
        <AddPerson
          nucleus={nucleus}
          onPick={p => {
            const existing = rows.find(r => r.id === p.id);
            // Their row must be visible for its editor to show.
            if (existing) { setFilter('all'); setSearch(''); }
            startEdit(existing
              ? fromRow(existing)
              : { id: p.id, name: p.name, roles: [], isResident: false, isNew: true, placePath: p.place, homeNucleus: p.homeNucleus });
          }}
        />
      )}
      {editing?.isNew && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{editing.name}</div>
          {editing.placePath && <div style={{ fontSize: 12, color: '#718096' }}>{editing.placePath}</div>}
          {editor(editing)}
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: '#718096' }}>No one is connected to this nucleus yet.</div>
      ) : (
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {shown.map(r => {
            const note = syncNote(r.placeSync);
            return (
              <div key={r.id} style={{ borderBottom: '1px solid #f7fafc', padding: '6px 0' }}>
                <div
                  onClick={rowsClickable && !saving ? () => (editing?.id === r.id ? close() : startEdit(fromRow(r))) : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: rowsClickable ? 'pointer' : 'default' }}
                >
                  <span style={{ fontSize: 14 }}>{sortBy === 'family' ? r.familyFirst : r.name}<PersonSrpDot inSrp={r.inSrp} /></span>
                  <RoleMarks row={r} isHome={isHome} />
                </div>
                {note?.tone === 'error' && <div style={{ fontSize: 12, color: '#c53030' }}>{note.text}</div>}
                {editing && !editing.isNew && editing.id === r.id && panel(editing)}
              </div>
            );
          })}
          {shown.length === 0 && <div style={{ fontSize: 13, color: '#718096' }}>No matches.</div>}
        </div>
      )}
    </div>
  );
}

function btn(background: string, color: string, border = background): React.CSSProperties {
  return { padding: '4px 10px', borderRadius: 6, border: `1px solid ${border}`, background, color, fontSize: 13, cursor: 'pointer' };
}

// Search everyone in the cluster (name and place path), or create a new person.
function AddPerson({ nucleus, onPick }: { nucleus: string; onPick: (p: Found) => void }) {
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
        placeholder="Find a person in this cluster…"
        aria-label="Find a person"
      />
      {query && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column' }}>
          {results.map(p => (
            <button key={p.id} type="button" onClick={() => { setInput(''); setResults([]); onPick(p); }}
              style={{ textAlign: 'left', background: 'none', border: 'none', padding: '4px 2px', cursor: 'pointer', fontSize: 13 }}>
              {p.name}{p.place && <span style={{ color: '#718096' }}> · {p.place}</span>}
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
