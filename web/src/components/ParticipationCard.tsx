'use client';

import { useEffect, useRef, useState } from 'react';
import type { ParticipationSpace, SpaceKind } from '@/lib/clusterNotebook';
import { spaceRowSummary } from '@/lib/participation';
import SpaceFormModal from './SpaceFormModal';

interface Props {
  nucleus: string;
  canWrite: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSpace: (spaceId: string) => void;
  // Changes when something elsewhere (a space's page) may have changed the spaces; re-read if already loaded.
  refreshKey: number;
}

export default function ParticipationCard({ nucleus, canWrite, open, onOpenChange, onOpenSpace, refreshKey }: Props) {
  const [spaces, setSpaces] = useState<ParticipationSpace[] | null>(null);
  const [kinds, setKinds] = useState<SpaceKind[]>([]);
  const [loadError, setLoadError] = useState('');
  const [adding, setAdding] = useState(false);
  const started = useRef(false);

  async function load() {
    try {
      const res = await fetch(`/api/participation/spaces?nucleus=${encodeURIComponent(nucleus)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load spaces.');
      setSpaces(data.spaces ?? []);
      setKinds(data.kinds ?? []);
      setLoadError('');
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }

  // Fetch the first time the card is open (it may start open, from a remembered state).
  useEffect(() => {
    if (!open || started.current) return;
    started.current = true;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount, when first open
  }, [open]);

  // Re-read on a new refreshKey, but only once loaded: a card never opened still fetches on first open.
  const seenKey = useRef(refreshKey);
  useEffect(() => {
    if (seenKey.current === refreshKey) return;
    seenKey.current = refreshKey;
    if (started.current) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the key changes
  }, [refreshKey]);

  return (
    <div className="card">
      <div className="card-header" onClick={() => onOpenChange(!open)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <span><span style={{ fontSize: 11, marginRight: 6 }}>{open ? '▼' : '▶'}</span>Gatherings</span>
      </div>
      {open && <div className="card-body">
        {loadError && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: '#e53e3e', fontSize: 13, marginBottom: 8 }}>{loadError}</div>
            <button
              onClick={() => { setLoadError(''); void load(); }}
              style={{ minHeight: 44, padding: '4px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer', border: '1px solid #cbd5e0', background: 'white', color: '#2a4365' }}
            >
              Try again
            </button>
          </div>
        )}
        {!loadError && spaces === null && <div style={{ fontSize: 13, color: '#718096' }}>Loading…</div>}
        {spaces?.length === 0 && <div style={{ fontSize: 13, color: '#718096' }}>No spaces yet.</div>}
        {spaces?.map(space => {
          const s = spaceRowSummary(space);
          return (
            <button
              key={space.id}
              onClick={() => onOpenSpace(space.id)}
              style={{ display: 'flex', width: '100%', minHeight: 44, alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 4px', background: 'none', border: 'none', borderBottom: '1px solid #edf2f7', cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#2d3748' }}>
                  {space.name}
                  {space.mode === 'RUNNING' && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#2b6cb0', background: '#ebf8ff', borderRadius: 10, padding: '1px 8px' }}>Count</span>}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: '#718096' }}>{s.detail}</span>
              </span>
              <span style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: '#2d3748' }}>{s.value}</span>
                {s.caption && <span style={{ display: 'block', fontSize: 11, color: '#718096' }}>{s.caption}</span>}
              </span>
            </button>
          );
        })}
        {canWrite && spaces && (
          <button
            onClick={() => setAdding(true)}
            style={{ minHeight: 44, marginTop: 8, padding: '4px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer', border: '1px solid #cbd5e0', background: 'white', color: '#2a4365' }}
          >
            + Add a space
          </button>
        )}
      </div>}
      {adding && (
        <SpaceFormModal
          nucleus={nucleus}
          kinds={kinds}
          existingNames={(spaces ?? []).map(s => s.name)}
          onClose={() => setAdding(false)}
          onSaved={space => {
            setSpaces(prev => [...(prev ?? []), space].sort((a, b) => a.name.localeCompare(b.name)));
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
