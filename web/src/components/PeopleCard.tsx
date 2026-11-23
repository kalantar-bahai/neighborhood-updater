'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PersonSrpDot } from './SrpBadge';
import type { AgeCategory, PermissionSet, PersonDetails } from '@/lib/clusterNotebook';
import {
  AGE_FILTERS, AGE_LABELS, DEVOTIONAL_HOST, FACILITATES, KNOWN_ROLES, PARTICIPATES, activityLines, activitySummary, courseGroups, hideNote, hideRolesLine, peopleCountLabel, RESIDENT, canEditRole, detailLines, detailsView, filterPeople, isMoving, moveResultError,
  nextRoleIds, peopleFilters, placePath, roleLabel, rolesToClear, sortPeople, sortRoles, syncNote, type MoveTarget,
  type ChipState, type PersonRow,
} from '@/lib/people';

// People card (specs: docs/superpowers/specs/2026-11-18-people-card-design.md, phase 1, and
// 2026-11-19-people-card-moves-design.md, phase 2). Everyone connected to the nucleus: role holders
// here, plus residents on a home nucleus. Ticking Resident moves someone here; unticking moves them out.
// Phases A and B (2026-11-20-people-card-details-design.md): activity, devotional host and age marks, and a panel
// any reader can open: the person's activities, then their details when cluster-notebook lets the caller see them.

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
  // Picked while hidden here through "+ Add": Save unhides them first (picking says they belong here).
  unhideFirst: boolean;
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
      {row.facilitates && <span role="img" aria-label={FACILITATES.label} title={FACILITATES.label}>{FACILITATES.icon}</span>}
      {row.participates && <span role="img" aria-label={PARTICIPATES.label} title={PARTICIPATES.label}>{PARTICIPATES.icon}</span>}
      {row.devotionalHost && (() => {
        const label = row.devotionalHost === 'CO_HOST' ? 'Devotional co-host' : DEVOTIONAL_HOST.label;
        return <span role="img" aria-label={label} title={label}>{DEVOTIONAL_HOST.icon}</span>;
      })()}
      {row.ageCategory && <span title={AGE_LABELS[row.ageCategory]} style={TAG}>{AGE_LABELS[row.ageCategory]}</span>}
      {row.hidden && <span title="Hidden here" style={TAG}>Hidden</span>}
    </span>
  );
}

// Set one person on or off a role's list at a nucleus (full-list replace, as /api/workers expects).
// Reads and writes include hidden holders so that unticking a hidden person's role actually removes
// them (a default write keeps hidden holders missing from the list). See
// docs/superpowers/specs/2026-11-23-hide-people-design.md, "Calls made by the builder".
async function writeRole(nucleus: string, role: string, personId: string, on: boolean) {
  const res = await fetch(`/api/workers?nucleus=${encodeURIComponent(nucleus)}&type=${encodeURIComponent(role)}&includeHidden=1`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Failed to load ${roleLabel(role).label}`);
  const currentIds = (data.workers as { id: string }[]).map(w => w.id);
  const personIds = nextRoleIds(currentIds, personId, on, SINGLE_ROLES.includes(role));
  const post = await fetch('/api/workers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nucleus, type: role, personIds, includesHidden: true }),
  });
  const postData = await post.json();
  if (!post.ok) throw new Error(postData.error || `Failed to save ${roleLabel(role).label}`);
}

// Hide or unhide one person at a nucleus (spec: 2026-11-23-hide-people-design.md).
async function postHide(nucleus: string, individualId: string, hidden: boolean, reason?: string) {
  const res = await fetch('/api/hide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nucleus, individualId, hidden, ...(reason ? { reason } : {}) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || (hidden ? "Couldn't hide" : "Couldn't unhide"));
  }
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
  const [age, setAge] = useState<'all' | AgeCategory>('all');
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
  // The open "Hide…" confirm (its reason as typed), and a Hide/Unhide error, for the open person.
  const [hideConfirm, setHideConfirm] = useState<{ personId: string; reason: string } | null>(null);
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [courseOpen, setCourseOpen] = useState<string | null>(null);
  const [fullListFor, setFullListFor] = useState<string | null>(null);
  const [hideError, setHideError] = useState('');

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
    setHideConfirm(null);
    setHideError('');
    setActivitiesOpen(false);
    setCourseOpen(null);
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
    placePath: placePath(r.place), homeNucleus: r.place?.homeNucleus ?? null, unhideFirst: false,
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
    if (!moveWanted && changed.length === 0 && !target.unhideFirst) { close(); return; }

    for (const role of changed) {
      if (!SINGLE_ROLES.includes(role) || !ticked.includes(role)) continue;
      const current = (rows ?? []).find(r => r.id !== target.id && r.roles.includes(role));
      if (current && !window.confirm(`This replaces ${current.name} as ${roleLabel(role).label.toLowerCase()}.`)) return;
    }

    if (target.unhideFirst) {
      // Picked while hidden through "+ Add": unhide first; if that fails, write nothing.
      setSaving(true);
      setSaveError('');
      try {
        await postHide(nucleus, target.id, false);
      } catch (e: unknown) {
        if (editingId.current === target.id) setSaveError(e instanceof Error ? e.message : String(e));
        return;
      } finally {
        setSaving(false);
      }
      // Show them as unhidden at once (and under All, so their open row stays in view), then re-read.
      setRows(rs => rs && rs.map(r => r.id === target.id ? { ...r, hidden: false, hide: null } : r));
      setFilter(f => f === 'hidden' ? 'all' : f);
      setReloads(n => n + 1);
      if (target.roles.length > 0) onRolesChanged(target.roles);
      if (editingId.current !== target.id) return;
      target = { ...target, unhideFirst: false };
      setEditing(target);
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

  // Hide (with an optional reason) or unhide the open person, then close the panel and re-read.
  async function setHidden(target: Editing, hidden: boolean, reason?: string) {
    const held = rows?.find(r => r.id === target.id)?.roles ?? [];
    setSaving(true);
    setHideError('');
    try {
      await postHide(nucleus, target.id, hidden, reason?.trim() || undefined);
      if (editingId.current === target.id) close();
      setHideConfirm(null);
      // Hidden role holders drop out of the page's name lists (and come back on unhide).
      if (held.length > 0) onRolesChanged(held);
    } catch (e: unknown) {
      if (editingId.current === target.id) setHideError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
      setReloads(n => n + 1);
    }
  }

  if (loadError) return <div style={{ fontSize: 13, color: '#c53030' }}>{loadError}</div>;
  if (!rows) return <div style={{ fontSize: 13, color: '#718096' }}>Loading people…</div>;

  const filters = peopleFilters(rows, isHome);
  const activeFilter = filters.some(f => f.key === filter) ? filter : 'all';
  // Sorting by first name until the owner decides what sort they want (2026-11-21).
  const shown = sortPeople(filterPeople(rows, activeFilter, search, age), 'first');

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

  // Activities come with the list, so they show at once. One summary line; a click opens the course chips
  // (layout A), and "Full list" under them opens every activity in a dialog (owner, 2026-11-23).
  // Chips: one row per activity type; blue ◐ in it now, green ✓ completed, grey ended without completing (or
  // unknown), white only facilitated; 🎓 facilitated. Tap a chip for its entries (see courseGroups).
  const CHIP_STYLE: Record<ChipState, { background: string; color: string; border: string; mark: string }> = {
    current: { background: '#bee3f8', color: '#2a4365', border: '#90cdf4', mark: ' ◐' },
    completed: { background: '#c6f6d5', color: '#22543d', border: '#9ae6b4', mark: ' ✓' },
    ended: { background: '#edf2f7', color: '#4a5568', border: '#e2e8f0', mark: '' },
    none: { background: 'white', color: '#4a5568', border: '#e2e8f0', mark: '' },
  };
  const activitiesSection = (personId: string) => {
    const participation = rows?.find(r => r.id === personId)?.participation ?? [];
    const summary = activitySummary(participation);
    const groups = courseGroups(participation);
    const open = groups.flatMap(g => g.chips.map(c => ({ ...c, id: `${g.type}:${c.key}` }))).find(c => c.id === courseOpen);
    return (
      <div style={{ padding: '6px 0 2px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#4a5568' }}>Activities</div>
        {participation.length === 0 ? (
          <div style={{ fontSize: 13, color: '#718096' }}>{summary}</div>
        ) : (
          <button type="button" onClick={() => setActivitiesOpen(o => !o)} aria-expanded={activitiesOpen}
            style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'none', border: 'none', padding: 0, fontSize: 13, color: '#2d3748', cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ fontSize: 11, color: '#718096' }}>{activitiesOpen ? '▼' : '▶'}</span>{summary}
          </button>
        )}
        {activitiesOpen && groups.map(g => (
          <div key={g.type}>
            <div style={{ fontSize: 12, color: '#4a5568' }}>{g.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
              {g.chips.map(c => {
                const id = `${g.type}:${c.key}`;
                const st = CHIP_STYLE[c.state];
                return (
                  <button key={id} type="button" aria-pressed={courseOpen === id} title={c.title ?? c.label}
                    onClick={() => setCourseOpen(o => (o === id ? null : id))}
                    style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, cursor: 'pointer', background: st.background, color: st.color,
                      border: `1px solid ${courseOpen === id ? '#2b6cb0' : st.border}` }}>
                    {c.label}{st.mark}{c.facilitated && ' 🎓'}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {activitiesOpen && open && (
          <div style={{ fontSize: 12, color: '#4a5568' }}>
            <div style={{ fontWeight: 600 }}>{open.title ?? open.label}</div>
            {open.lines.map((l, k) => <div key={k}>{l}</div>)}
          </div>
        )}
        {activitiesOpen && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: 11, color: '#718096' }}>
            <span>◐ in it now · ✓ completed · grey: didn&apos;t complete · 🎓 facilitated</span>
            <button type="button" onClick={() => setFullListFor(personId)}
              style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: '#2b6cb0', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Full list
            </button>
          </div>
        )}
      </div>
    );
  };

  // Every activity, one line each, in a dialog over the page (portal: cards clip with overflow hidden).
  const fullListDialog = () => {
    const row = fullListFor ? rows?.find(r => r.id === fullListFor) : undefined;
    if (!row) return null;
    const lines = activityLines(row.participation);
    return createPortal(
      <div onClick={() => setFullListFor(null)}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
        <div role="dialog" aria-modal="true" aria-label={`${row.name}: activities`} onClick={ev => ev.stopPropagation()}
          style={{ background: 'white', borderRadius: 8, width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{row.name}: activities</div>
            <button type="button" onClick={() => setFullListFor(null)}
              style={{ background: 'none', border: 'none', fontSize: 13, color: '#2b6cb0', cursor: 'pointer' }}>Close</button>
          </div>
          <div style={{ overflowY: 'auto', padding: '8px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lines.map(l => (
              <div key={l.key} style={{ display: 'flex', gap: 6, fontSize: 13 }}>
                <span aria-hidden="true">{l.icon}</span>
                <div>
                  <div>{l.title}</div>
                  {l.detail && <div style={{ fontSize: 12, color: '#718096' }}>{l.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>,
      document.body,
    );
  };

  // Editors (canWrite) only: Hide… with its confirm, or for a hidden person who/when/why and Unhide.
  const hideSection = (e: Editing) => {
    const row = rows?.find(r => r.id === e.id);
    if (!permissions.canWrite || !row) return null;
    const confirm = hideConfirm?.personId === e.id ? hideConfirm : null;
    const rolesLine = hideRolesLine(e.name, row.roles);
    return (
      <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 4, padding: '8px 0 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {row.hidden ? (
          <>
            {row.hide && <div style={{ fontSize: 13, color: '#4a5568' }}>{hideNote(row.hide)}</div>}
            <div>
              <button type="button" disabled={saving} onClick={() => setHidden(e, false)} style={btn('white', '#4a5568', '#cbd5e0')}>
                {saving ? 'Unhiding…' : 'Unhide'}
              </button>
            </div>
          </>
        ) : confirm ? (
          <div style={{ border: '1px solid #e2e8f0', background: '#f7fafc', borderRadius: 6, padding: 8, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontWeight: 600 }}>Hide {e.name} from {nucleus}?</div>
            <div>Stays in SRP; a CSO can review and archive.</div>
            {rolesLine && <div>{rolesLine}</div>}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              Reason (optional)
              {/* Explicit border and background: the page's CSS reset leaves a bare input invisible (owner, 2026-11-23). */}
              <input type="text" value={confirm.reason} disabled={saving} placeholder="e.g. moved away"
                onChange={ev => setHideConfirm({ personId: e.id, reason: ev.target.value })}
                style={{ border: '1px solid #cbd5e0', borderRadius: 6, background: 'white', padding: '6px 8px', fontSize: 16, color: '#2d3748' }} />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, justifyContent: 'flex-end' }}>
              <button type="button" disabled={saving} onClick={() => setHideConfirm(null)} style={btn('white', '#4a5568', '#cbd5e0')}>Cancel</button>
              <button type="button" disabled={saving} onClick={() => setHidden(e, true, confirm.reason)} style={btn('#c53030', 'white')}>
                {saving ? 'Hiding…' : 'Hide'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button type="button" disabled={saving || Boolean(pendingMove)} onClick={() => { setHideError(''); setHideConfirm({ personId: e.id, reason: '' }); }}
              style={btn('white', '#4a5568', '#cbd5e0')}>Hide…</button>
          </div>
        )}
        {hideError && <div style={{ fontSize: 12, color: '#c53030' }}>{hideError}</div>}
      </div>
    );
  };

  // The panel under an existing person's row: details when permitted, activities, the editor or a Close
  // button, then (for editors) Hide or Unhide.
  const panel = (e: Editing) => (
    <div>
      {detailsSection(e.id)}
      {activitiesSection(e.id)}
      {canEditPerson ? (
        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 4 }}>
          {editor(e)}
        </div>
      ) : (
        <div style={{ marginTop: 6 }}>
          <button type="button" onClick={close} style={btn('white', '#4a5568', '#cbd5e0')}>Close</button>
        </div>
      )}
      {hideSection(e)}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <select value={activeFilter} onChange={e => setFilter(e.target.value)} aria-label="Filter people" style={{ width: 'auto' }}>
          {filters.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <select value={age} onChange={e => setAge(e.target.value as 'all' | AgeCategory)} aria-label="Filter by age" style={{ width: 'auto' }}>
          {AGE_FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
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
          hiddenIds={rows.filter(r => r.hidden).map(r => r.id)}
          onPick={p => {
            const existing = rows.find(r => r.id === p.id);
            // Their row must be visible for its editor to show (a hidden person's only under Hidden).
            if (existing) { setFilter(existing.hidden ? 'hidden' : 'all'); setAge('all'); setSearch(''); }
            startEdit(existing
              ? { ...fromRow(existing), unhideFirst: existing.hidden }
              : { id: p.id, name: p.name, roles: [], isResident: false, isNew: true, placePath: p.place, homeNucleus: p.homeNucleus, unhideFirst: false });
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
                  onClick={!saving ? () => (editing?.id === r.id ? close() : startEdit(fromRow(r))) : undefined}
                  // The open person's name sticks to the top of the list while their panel scrolls, so a
                  // click on it can always close the panel (owner, 2026-11-21).
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
                    ...(editing?.id === r.id ? { position: 'sticky', top: 0, zIndex: 1, background: 'white', padding: '4px 0', borderBottom: '1px solid #e2e8f0' } : {}),
                  }}
                >
                  <span style={{ fontSize: 14 }}>{r.name}<PersonSrpDot inSrp={r.inSrp} /></span>
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
      {/* Outside the scrolling list, so it stays put (owner, 2026-11-21). */}
      {rows.length > 0 && (
        <div style={{ fontSize: 12, color: '#718096', borderTop: '1px solid #e2e8f0', paddingTop: 4, marginTop: 2 }}>
          {peopleCountLabel(shown.length, rows.filter(r => r.hidden === (activeFilter === 'hidden')).length, activeFilter === 'hidden')}
        </div>
      )}
      {fullListDialog()}
    </div>
  );
}

function btn(background: string, color: string, border = background): React.CSSProperties {
  return { padding: '4px 10px', borderRadius: 6, border: `1px solid ${border}`, background, color, fontSize: 13, cursor: 'pointer' };
}

// Search everyone in the cluster (name and place path), or create a new person.
function AddPerson({ nucleus, hiddenIds, onPick }: { nucleus: string; hiddenIds: string[]; onPick: (p: Found) => void }) {
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
