'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { inFamilyText, matchesCandidate, sortCandidates, type Candidate, type FamilySort } from '@/lib/households';

// A bottom sheet for choosing a person to add to, or start, a family. Portaled because cards clip overflow.
export default function FamilyPicker({ title, note, candidates, onPick, onClose }: {
  title: string; note?: string; candidates: Candidate[]; onPick: (c: Candidate) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<FamilySort>('name');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { searchRef.current?.focus(); }, []);
  const q = query.trim().toLowerCase();
  const shown = sortCandidates(q ? candidates.filter(c => matchesCandidate(c, q)) : candidates, sortBy);

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }} style={{ position: 'relative', background: 'white', borderRadius: '12px 12px 0 0', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#2d3748' }}>{title}</div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ minWidth: 44, minHeight: 44, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#4a5568' }}>×</button>
        </div>
        {note && <div style={{ fontSize: 12, color: '#718096', marginBottom: 6 }}>{note}</div>}
        <input
          ref={searchRef}
          type="search"
          aria-label="Search by name"
          placeholder="Search by name"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 16 }}
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
        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', marginTop: 8 }}>
          {shown.length === 0 && <div style={{ fontSize: 13, color: '#718096', padding: 8 }}>No one to choose.</div>}
          {shown.map(c => {
            const second = c.fromHouseholdId && c.familyTitle ? inFamilyText(c.familyTitle) : c.address;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c)}
                style={{ display: 'block', width: '100%', minHeight: 44, padding: '6px 4px', background: 'none', border: 'none', borderBottom: '1px solid #e2e8f0', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
              >
                <span style={{ display: 'block', fontSize: 14, color: '#2d3748' }}>{c.name}</span>
                {second && <span style={{ display: 'block', fontSize: 12, color: '#718096' }}>{second}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
