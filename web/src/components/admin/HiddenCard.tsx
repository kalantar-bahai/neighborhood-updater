'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminPlace, HiddenPerson } from '@/lib/clusterNotebook';
import { moveTargets, placeTree } from '@/lib/admin';
import { hideNote } from '@/lib/people';
import { individualDisplayName } from '@/lib/personName';
import { householdMove, type HouseholdMove } from '@/lib/households';
import { HouseholdMoveNote } from '../HouseholdMoveNote';

// The inline "Move…" form for one row: pick a locality or setting, then Move.
type MoveForm = { key: string; places: AdminPlace[] | null; filter: string; place: AdminPlace | null };

const BTN: React.CSSProperties = { fontSize: 13, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid #cbd5e0', background: 'white', color: '#4a5568' };
const INPUT: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '6px 8px', border: '1px solid #a0aec0', borderRadius: 6 };

// A person can be hidden in more than one nucleus, so a row is person + nucleus.
const rowKey = (h: HiddenPerson) => `${h.individual.id}|${h.nucleusName}`;

// People hidden from nuclei in one cluster. The card is keyed by cluster in AdminClient, so switching
// cluster remounts it. The place-tree picker mirrors RolesCard's (that one is tied to its form state,
// so it is not shared).
export default function HiddenCard({ cluster }: { cluster: string }) {
  const [open, setOpen] = useState(true);
  const [hidden, setHidden] = useState<HiddenPerson[] | null>(null);
  const [loadError, setLoadError] = useState('');
  // Busy and error are per row (keyed by rowKey), so a reply always clears and reports on its own row even if
  // another row was acted on meanwhile.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [move, setMove] = useState<MoveForm | null>(null);
  const [busy, setBusy] = useState<Record<string, 'unhide' | 'move'>>({});

  // Row whose Move form is open. A places reply for any other row (or after the form was closed) is dropped.
  const moveKey = useRef<string | null>(null);
  // Latest list read; an older read never overwrites a newer one.
  const readSeq = useRef(0);

  const reload = async (): Promise<boolean> => {
    const seq = ++readSeq.current;
    try {
      const res = await fetch(`/api/admin/hidden?cluster=${encodeURIComponent(cluster)}`);
      const data = await res.json();
      if (seq !== readSeq.current) return false;
      if (!res.ok || data.error) { setLoadError(data.error || "Couldn't load hidden people."); return false; }
      setLoadError(''); setHidden(data.hidden);
      return true;
    } catch {
      if (seq === readSeq.current) setLoadError("Couldn't load hidden people. Please try again.");
      return false;
    }
  };

  useEffect(() => {
    const seq = ++readSeq.current;
    fetch(`/api/admin/hidden?cluster=${encodeURIComponent(cluster)}`)
      .then(async res => {
        const data = await res.json();
        if (seq !== readSeq.current) return;
        if (!res.ok || data.error) { setLoadError(data.error || "Couldn't load hidden people."); return; }
        setHidden(data.hidden);
      })
      .catch(() => { if (seq === readSeq.current) setLoadError("Couldn't load hidden people. Please try again."); });
  }, [cluster]);

  const setBusyFor = (key: string, what: 'unhide' | 'move' | null) =>
    setBusy(b => { const n = { ...b }; if (what) n[key] = what; else delete n[key]; return n; });
  const setErrorFor = (key: string, text: string) =>
    setRowErrors(e => { const n = { ...e }; if (text) n[key] = text; else delete n[key]; return n; });

  const unhide = async (h: HiddenPerson) => {
    const key = rowKey(h);
    if (busy[key]) return;
    setBusyFor(key, 'unhide'); setErrorFor(key, '');
    if (moveKey.current === key) { moveKey.current = null; setMove(null); }
    let failure = '';
    try {
      const res = await fetch('/api/admin/hidden', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster, individualId: h.individual.id, nucleusName: h.nucleusName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) failure = data.error || "Couldn't unhide this person.";
    } catch {
      failure = "Couldn't unhide this person. Please try again.";
    }
    if (failure) { setErrorFor(key, failure); setBusyFor(key, null); return; }
    await reload();
    setBusyFor(key, null);
  };

  const openMove = async (h: HiddenPerson) => {
    const key = rowKey(h);
    moveKey.current = key; setErrorFor(key, '');
    setMove({ key, places: null, filter: '', place: null });
    try {
      const res = await fetch(`/api/admin/places?cluster=${encodeURIComponent(cluster)}`);
      const data = await res.json();
      if (moveKey.current !== key) return;
      if (!res.ok || data.error) { setErrorFor(key, data.error || "Couldn't load places."); moveKey.current = null; setMove(null); return; }
      setMove(m => m && m.key === key ? { ...m, places: moveTargets(data.places) } : m);
    } catch {
      if (moveKey.current !== key) return;
      setErrorFor(key, "Couldn't load places. Please try again."); moveKey.current = null; setMove(null);
    }
  };

  const closeMove = () => { moveKey.current = null; setMove(null); setRowErrors({}); };

  const doMove = async (h: HiddenPerson) => {
    const key = rowKey(h);
    if (!move || move.key !== key || !move.place || busy[key]) return;
    const place = move.place;
    setErrorFor(key, ''); setBusyFor(key, 'move');
    let failure = '';
    try {
      const res = await fetch('/api/admin/move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster, individualId: h.individual.id, locationId: place.id }),
      });
      const data = await res.json().catch(() => ({}));
      // The route answers { error: string | null }; a non-null error is a refusal in words.
      if (!res.ok || data.error) failure = data.error || "Couldn't move this person.";
    } catch {
      failure = "Couldn't move this person. Please try again.";
    }
    if (failure) { setErrorFor(key, failure); setBusyFor(key, null); return; }
    if (moveKey.current === key) { moveKey.current = null; setMove(null); }
    await reload();
    setBusyFor(key, null);
  };

  const moveLabel = (hm: HouseholdMove | null) => (hm ? `Move all ${hm.total} people` : 'Move');

  const moveView = (h: HiddenPerson, m: MoveForm, saving: boolean) => {
    const hm = householdMove(h.individual.household, h.individual.id);
    return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 8, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!m.place ? (
        <>
          <input type="text" value={m.filter} onChange={e => { const v = e.target.value; setMove(x => x && { ...x, filter: v }); }}
            placeholder="Filter places…" aria-label="Filter places" style={INPUT} />
          {m.places === null ? <div style={{ fontSize: 12, color: '#718096' }}>Loading…</div> : (
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {placeTree(m.places, m.filter).map(({ place, depth }) => (
                <button key={place.id} type="button" onClick={() => setMove(x => x && { ...x, place })}
                  style={{ textAlign: 'left', background: 'none', border: 'none', padding: `4px 4px 4px ${4 + depth * 12}px`, fontSize: 14, cursor: 'pointer' }}>
                  {place.name}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 13 }}>
          Move to: <strong>{m.place.name}</strong>{' '}
          <button type="button" disabled={saving} onClick={() => setMove(x => x && { ...x, place: null })}
            style={{ ...BTN, padding: '1px 6px', fontSize: 12 }}>Change</button>
        </div>
      )}
      {hm && <HouseholdMoveNote move={hm} name={individualDisplayName(h.individual)} />}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={!m.place || saving} onClick={() => doMove(h)}
          style={{ ...BTN, background: '#3182ce', color: 'white', border: '1px solid #3182ce', opacity: !m.place || saving ? 0.5 : 1 }}>
          {saving ? 'Moving…' : moveLabel(hm)}
        </button>
        <button type="button" disabled={saving} onClick={closeMove} style={BTN}>Cancel</button>
      </div>
    </div>
    );
  };

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <span><span style={{ fontSize: 11, marginRight: 6 }}>{open ? '▼' : '▶'}</span>Hidden people{hidden ? ` (${hidden.length})` : ''}</span>
      </div>
      {open && (
        <div className="card-body">
          {loadError && <div style={{ color: '#c53030', fontSize: 13 }}>{loadError}</div>}
          {!hidden && !loadError && <div style={{ fontSize: 12, color: '#718096' }}>Loading…</div>}
          {hidden && hidden.length === 0 && <div style={{ fontSize: 13, color: '#718096' }}>No one is hidden in this cluster.</div>}
          {hidden && hidden.map(h => {
            const key = rowKey(h);
            const rowBusy = !!busy[key];
            return (
              <div key={key} style={{ padding: '8px 0', borderTop: '1px solid #edf2f7' }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{individualDisplayName(h.individual)}</div>
                <div style={{ fontSize: 13, color: '#4a5568' }}>from {h.nucleusName}</div>
                <div style={{ fontSize: 12, color: '#718096' }}>{hideNote(h.hide)}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <button type="button" disabled={rowBusy} onClick={() => unhide(h)} style={BTN}>{busy[key] === 'unhide' ? 'Unhiding…' : 'Unhide'}</button>
                  <button type="button" disabled={rowBusy || move?.key === key} onClick={() => openMove(h)} style={BTN}>Move…</button>
                  <button type="button" disabled title="Coming later" style={{ ...BTN, opacity: 0.5, cursor: 'not-allowed' }}>Archive</button>
                </div>
                {move?.key === key && moveView(h, move, busy[key] === 'move')}
                {rowErrors[key] && <div style={{ color: '#c53030', fontSize: 13, marginTop: 6 }}>{rowErrors[key]}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
