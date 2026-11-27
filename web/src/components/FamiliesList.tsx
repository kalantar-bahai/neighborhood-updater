'use client';

import { useEffect, useState } from 'react';
import { PersonSrpDot } from './SrpBadge';
import { filterFamilies, hiddenText, sizeText, sortFamilies, type FamilyEntry, type FamilySort } from '@/lib/households';

// The Families card's list: households (and people with no household), searchable by anyone in them.
export default function FamiliesList({ nucleus, refreshKey }: { nucleus: string; refreshKey: number }) {
  const [families, setFamilies] = useState<FamilyEntry[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<FamilySort>('name');
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let live = true;
    fetch(`/api/families?nucleus=${encodeURIComponent(nucleus)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load families');
        if (live) { setFamilies(data.families); setLoadError(''); }
      })
      .catch((e: unknown) => { if (live) setLoadError(e instanceof Error ? e.message : String(e)); });
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
      <div style={{ marginTop: 8 }}>
        {shown.map(f => {
          const open = openKeys.has(f.key);
          const hidden = hiddenText(f.hidden);
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
                </span>
                <span style={{ fontSize: 11, color: '#4a5568', background: '#edf2f7', borderRadius: 8, padding: '1px 6px', whiteSpace: 'nowrap' }}>{sizeText(f.size)}</span>
              </button>
              {open && (
                <div style={{ padding: '0 4px 10px 23px', fontSize: 13, color: '#4a5568' }}>
                  {f.members.map(m => (
                    <div key={m.id} style={{ padding: '2px 0' }}>
                      {m.isContact ? '★ ' : ''}{m.name}<PersonSrpDot inSrp={m.inSrp} />
                    </div>
                  ))}
                  {hidden && <div style={{ color: '#718096', marginTop: 2 }}>{hidden}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
