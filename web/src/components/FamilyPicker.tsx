'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FAMILY_SORTS, inFamilyText, matchesCandidate, sortCandidates, type Candidate, type FamilySort } from '@/lib/households';

// The part of the screen the keyboard leaves visible. A phone keyboard covers a position: fixed sheet rather than
// pushing it up, which hid the matches (owner, 2026-11-28), so the sheet is laid out inside this area instead.
type VisibleArea = { top: number; height: number } | null;
function visibleArea(): VisibleArea {
  const vv = typeof window === 'undefined' ? null : window.visualViewport;
  return vv ? { top: vv.offsetTop, height: vv.height } : null;
}
function useVisibleArea(): VisibleArea {
  const [area, setArea] = useState<VisibleArea>(visibleArea);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setArea(visibleArea());
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);
  return area;
}

// A bottom sheet for choosing a person to add to, or start, a family. Portaled because cards clip overflow.
export default function FamilyPicker({ title, note, candidates, onPick, onClose }: {
  title: string; note?: string; candidates: Candidate[]; onPick: (c: Candidate) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<FamilySort>('name');
  const searchRef = useRef<HTMLInputElement>(null);
  const area = useVisibleArea();
  useEffect(() => { searchRef.current?.focus(); }, []);
  const q = query.trim().toLowerCase();
  const shown = sortCandidates(q ? candidates.filter(c => matchesCandidate(c, q)) : candidates, sortBy);

  return createPortal(
    <div style={{ position: 'fixed', left: 0, right: 0, ...(area ? { top: area.top, height: area.height } : { top: 0, bottom: 0 }), zIndex: 1000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }} style={{ position: 'relative', background: 'white', borderRadius: '12px 12px 0 0', maxHeight: '85%', display: 'flex', flexDirection: 'column', padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#2d3748' }}>{title}</div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ minWidth: 44, minHeight: 44, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#4a5568' }}>×</button>
        </div>
        {note && <div style={{ fontSize: 12, color: '#718096', marginBottom: 6 }}>{note}</div>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as FamilySort)} aria-label="Sort people" style={{ width: 'auto', minHeight: 44, fontSize: 16 }}>
            {FAMILY_SORTS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <input
            ref={searchRef}
            type="search"
            aria-label="Search names or addresses"
            placeholder="Search names or addresses…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1, minWidth: 120, boxSizing: 'border-box', minHeight: 44, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 16 }}
          />
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
