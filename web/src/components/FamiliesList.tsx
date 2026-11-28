'use client';

import { useEffect, useState } from 'react';
import { PersonSrpDot } from './SrpBadge';
import FamilyPicker from './FamilyPicker';
import { addCandidates, moveConfirmText, canRemoveMember, filterFamilies, hiddenText, sizeText, sortFamilies, srpBadge, srpProblemText, startCandidates, type Candidate, type FamilyEntry, type FamilySort } from '@/lib/households';

// The Families card's list: households (and people with no household), searchable by anyone in them.
type PickerState = { entry: FamilyEntry; mode: 'add' | 'start' };
type FamilyAction =
  | { action: 'create'; contactId: string; memberIds: string[] }
  | { action: 'add'; householdId: string; individualId: string; fromHouseholdId?: string }
  | { action: 'remove'; householdId: string; individualId: string }
  | { action: 'contact'; householdId: string; individualId: string }
  | { action: 'retry'; householdId: string }
  | { action: 'take'; householdId: string };

const smallBtn = (disabled: boolean) => ({ minHeight: 44, padding: '4px 12px', borderRadius: 6, fontSize: 13, cursor: disabled ? 'default' : 'pointer', border: '1px solid #cbd5e0', background: 'white', color: disabled ? '#a0aec0' : '#2a4365' }) as const;

export default function FamiliesList({ nucleus, refreshKey, canEdit, onChanged }: { nucleus: string; refreshKey: number; canEdit: boolean; onChanged: () => void }) {
  const [families, setFamilies] = useState<FamilyEntry[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<FamilySort>('name');
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(new Set());
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});

  async function run(key: string, body: FamilyAction, personName?: string) {
    setSavingKey(key);
    setErrors(prev => ({ ...prev, [key]: '' }));
    try {
      const res = await fetch('/api/families', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nucleus, ...(personName ? { personName } : {}), ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setErrors(prev => ({ ...prev, [key]: data.error || 'Could not save that change.' }));
      onChanged();
    } catch (e: unknown) {
      setErrors(prev => ({ ...prev, [key]: e instanceof Error ? e.message : String(e) }));
      onChanged();
    }
    // The busy key stays set until the list re-reads (see the fetch effect), so buttons never act on stale data.
  }

  function pick(c: Candidate) {
    if (!picker || !families) return;
    const { entry, mode } = picker;
    setPicker(null);
    if (mode === 'start') {
      run(entry.key, { action: 'create', contactId: entry.members[0].id, memberIds: [c.id] });
      return;
    }
    if (c.fromHouseholdId && c.familyTitle !== c.name && !window.confirm(moveConfirmText(c.name, c.familyTitle))) return;
    run(entry.key, { action: 'add', householdId: entry.householdId!, individualId: c.id, ...(c.fromHouseholdId ? { fromHouseholdId: c.fromHouseholdId } : {}) }, c.name);
  }

  useEffect(() => {
    let live = true;
    fetch(`/api/families?nucleus=${encodeURIComponent(nucleus)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load families');
        if (live) { setFamilies(data.families); setLoadError(''); setSavingKey(null); }
      })
      .catch((e: unknown) => { if (live) { setLoadError(e instanceof Error ? e.message : String(e)); setSavingKey(null); } });
    return () => { live = false; };
  }, [nucleus, refreshKey]);

  if (loadError) return <div style={{ fontSize: 13, color: '#c53030', marginTop: 12 }}>{loadError}</div>;
  if (!families) return <div style={{ fontSize: 13, color: '#718096', marginTop: 12 }}>Loading families…</div>;

  const shown = sortFamilies(filterFamilies(families, query), sortBy);

  return (
    <div style={{ marginTop: 16 }}>
      <input
        type="search"
        aria-label="Find a family by anyone in it"
        placeholder="Find a family by anyone in it"
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }}
      />
      <div role="group" aria-label="Sort by" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span style={{ fontSize: 12, color: '#718096' }}>Sort by</span>
        {([['name', 'Family name'], ['address', 'Address']] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={sortBy === value}
            onClick={() => setSortBy(value)}
            style={{ minHeight: 44, padding: '4px 14px', borderRadius: 22, fontSize: 13, cursor: 'pointer', border: '1px solid #cbd5e0', background: sortBy === value ? '#bee3f8' : 'white', color: sortBy === value ? '#2a4365' : '#4a5568', fontWeight: sortBy === value ? 700 : 400 }}
          >{label}</button>
        ))}
      </div>
      {shown.length === 0 && query.trim() && (
        <div style={{ fontSize: 13, color: '#718096', marginTop: 10 }}>No family has anyone by that name.</div>
      )}
      {families.length === 0 && !query.trim() && (
        <div style={{ fontSize: 13, color: '#718096', marginTop: 10 }}>No people in this nucleus yet.</div>
      )}
      <div style={{ marginTop: 8 }}>
        {shown.map(f => {
          const open = openKeys.has(f.key);
          const hidden = hiddenText(f.hidden);
          const badge = srpBadge(f.srpState);
          const busy = savingKey === f.key;
          const isHousehold = f.householdId !== null;
          return (
            <div key={f.key} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenKeys(prev => { const next = new Set(prev); if (!next.delete(f.key)) next.add(f.key); return next; })}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: '6px 4px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
              >
                <span style={{ fontSize: 11, color: '#4a5568' }}>{open ? '▼' : '▶'}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, color: '#2d3748' }}>{f.title}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#718096' }}>{f.address ?? 'No address in SRP'}</span>
                  {f.srpProblem && <span style={{ display: 'block', fontSize: 12, color: '#c53030' }}>{srpProblemText(f.srpProblem)}</span>}
                </span>
                {badge && <span style={{ fontSize: 11, color: '#744210', background: '#fefcbf', borderRadius: 8, padding: '1px 6px', whiteSpace: 'nowrap' }}>{badge}</span>}
                <span style={{ fontSize: 11, color: '#4a5568', background: '#edf2f7', borderRadius: 8, padding: '1px 6px', whiteSpace: 'nowrap' }}>{sizeText(f.size)}</span>
              </button>
              {open && (
                <div style={{ padding: '0 4px 10px 23px', fontSize: 13, color: '#4a5568' }}>
                  {f.members.map(m => {
                    const removable = canRemoveMember(f, m.id);
                    return (
                      <div key={m.id} style={{ padding: '2px 0' }}>
                        {m.isContact ? '★ ' : ''}{m.name}<PersonSrpDot inSrp={m.inSrp} />
                        {canEdit && isHousehold && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                            {!m.isContact && (
                              <button type="button" disabled={busy} style={smallBtn(busy)}
                                onClick={() => run(f.key, { action: 'contact', householdId: f.householdId!, individualId: m.id }, m.name)}>Make contact</button>
                            )}
                            <button type="button" disabled={busy || !removable} style={smallBtn(busy || !removable)}
                              onClick={() => run(f.key, { action: 'remove', householdId: f.householdId!, individualId: m.id }, m.name)}>Remove</button>
                            {!removable && (
                              <span style={{ fontSize: 12, color: '#718096' }}>To remove {m.name}, make someone else the contact first.</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {hidden && <div style={{ color: '#718096', marginTop: 2 }}>{hidden}</div>}
                  {canEdit && (
                    <button type="button" disabled={busy} style={{ ...smallBtn(busy), marginTop: 6 }}
                      onClick={() => setPicker({ entry: f, mode: isHousehold ? 'add' : 'start' })}>
                      {isHousehold ? 'Add someone…' : 'Start a family with…'}
                    </button>
                  )}
                  {canEdit && isHousehold && f.srpProblem && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                      <button type="button" disabled={busy} style={smallBtn(busy)}
                        onClick={() => run(f.key, { action: 'retry', householdId: f.householdId! })}>
                        {f.srpProblem === 'SRP_CONFLICT' ? 'Keep ours' : 'Send again'}
                      </button>
                      <button type="button" disabled={busy} style={smallBtn(busy)}
                        onClick={() => { if (window.confirm('Drop the changes made here? The family will match SRP after the next read.')) run(f.key, { action: 'take', householdId: f.householdId! }); }}>
                        Use SRP&apos;s version
                      </button>
                    </div>
                  )}
                  {errors[f.key] && <div role="alert" style={{ color: '#c53030', marginTop: 6 }}>{errors[f.key]}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {picker && (
        <FamilyPicker
          note={picker.mode === 'start' ? 'Only people not yet in a family are listed.' : undefined}
          title={picker.mode === 'add' ? 'Add someone' : `Start a family with ${picker.entry.title}`}
          candidates={picker.mode === 'add' ? addCandidates(families, picker.entry.key) : startCandidates(families, picker.entry.key)}
          onPick={pick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
