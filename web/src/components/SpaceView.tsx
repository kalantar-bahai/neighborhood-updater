'use client';

import { useEffect, useState } from 'react';
import type { ParticipationRecord, SpaceDetail, SpaceKind } from '@/lib/clusterNotebook';
import { individualDisplayName } from '@/lib/personName';
import { canRecord, namedLabel, shortDate } from '@/lib/participation';
import RecordModal from './RecordModal';
import SpaceFormModal from './SpaceFormModal';

interface Props {
  nucleus: string;
  spaceId: string;
  canWrite: boolean;
  onBack: () => void;
}

const PAGE = 20;
const BTN: React.CSSProperties = { minHeight: 44, padding: '4px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer', border: '1px solid #cbd5e0', background: 'white', color: '#2a4365' };
const PRIMARY: React.CSSProperties = { ...BTN, fontWeight: 600, border: 'none', background: '#2b6cb0', color: 'white' };

export default function SpaceView({ nucleus, spaceId, canWrite, onBack }: Props) {
  const [space, setSpace] = useState<SpaceDetail | null>(null);
  const [kinds, setKinds] = useState<SpaceKind[]>([]);
  const [records, setRecords] = useState<ParticipationRecord[]>([]);
  const [lastPage, setLastPage] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState<ParticipationRecord | null>(null);
  const [editingSpace, setEditingSpace] = useState(false);

  const url = `/api/participation/spaces?nucleus=${encodeURIComponent(nucleus)}&space=${encodeURIComponent(spaceId)}`;

  async function fetchPage(offset: number) {
    const res = await fetch(offset ? `${url}&offset=${offset}` : url);
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(data.error || 'Could not load this space.');
    return data as { space: SpaceDetail; kinds: SpaceKind[] };
  }

  function applyFirst(data: { space: SpaceDetail; kinds: SpaceKind[] } | null) {
    if (!data) { setNotFound(true); return; }
    setSpace(data.space);
    setKinds(data.kinds ?? []);
    setRecords(data.space.records);
    setLastPage(data.space.records.length);
    setLoadError('');
  }
  const applyError = (e: unknown) => setLoadError(e instanceof Error ? e.message : String(e));

  // The first page, replacing everything shown (retry, and after any save or delete).
  function load() {
    return fetchPage(0).then(applyFirst, applyError);
  }

  useEffect(() => {
    void fetchPage(0).then(applyFirst, applyError);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per space
  }, [nucleus, spaceId]);

  async function showMore() {
    setLoadingMore(true);
    setMoreError('');
    try {
      const data = await fetchPage(records.length);
      if (data) {
        setRecords([...records, ...data.space.records]);
        setLastPage(data.space.records.length);
      }
    } catch (e: unknown) {
      setMoreError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }

  function saved() {
    setRecording(false);
    setEditing(null);
    setEditingSpace(false);
    void load();
  }

  const header = (
    <div className="page-header">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
        <button className="back-btn" onClick={onBack} style={{ minHeight: 44 }}>← Back</button>
        <div style={{ minWidth: 0 }}>
          <h1>{space?.name ?? 'Participation'}</h1>
          <div className="meta">{nucleus}</div>
        </div>
      </div>
    </div>
  );

  if (notFound) {
    return (
      <>
        {header}
        <div className="container"><div className="card"><div className="card-body">
          <div style={{ fontSize: 14, color: '#4a5568', marginBottom: 12 }}>That space wasn&apos;t found.</div>
          <button onClick={onBack} style={BTN}>Back</button>
        </div></div></div>
      </>
    );
  }

  if (!space) {
    return (
      <>
        {header}
        <div className="container"><div className="card"><div className="card-body">
          {loadError ? (
            <>
              <div style={{ color: '#e53e3e', fontSize: 13, marginBottom: 8 }}>{loadError}</div>
              <button onClick={() => { setLoadError(''); void load(); }} style={BTN}>Try again</button>
            </>
          ) : <div style={{ fontSize: 13, color: '#718096' }}>Loading…</div>}
        </div></div></div>
      </>
    );
  }

  const running = space.mode === 'RUNNING';
  const mayRecord = canRecord(space, canWrite);
  const people = space.people.people;

  return (
    <>
      {header}
      <div className="container">
        {loadError && (
          <div style={{ color: '#e53e3e', fontSize: 13 }}>
            {loadError} <button onClick={() => { setLoadError(''); void load(); }} style={BTN}>Try again</button>
          </div>
        )}

        <div className="card"><div className="card-body">
          {space.archivedAt && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, color: '#4a5568', marginBottom: 8 }}>This space is archived.</div>
              {canWrite && <button onClick={() => setEditingSpace(true)} style={BTN}>Restore space</button>}
            </div>
          )}
          {running && (
            <div style={{ marginBottom: mayRecord ? 12 : 0 }}>
              <span style={{ fontSize: 36, fontWeight: 700, color: '#2d3748' }}>{space.recordCount === 0 ? '—' : space.total}</span>
              <span style={{ fontSize: 13, color: '#718096', marginLeft: 8 }}>since {shortDate(space.createdAt.slice(0, 10))}</span>
            </div>
          )}
          {mayRecord && (
            <button onClick={() => setRecording(true)} style={{ ...PRIMARY, width: '100%' }}>
              {running ? '+ Add to the count' : '+ Record a gathering'}
            </button>
          )}
          {!running && !mayRecord && !space.archivedAt && space.recordCount === 0 && (
            <div style={{ fontSize: 13, color: '#718096' }}>Nothing recorded yet.</div>
          )}
        </div></div>

        <div className="card">
          <div className="card-header"><span>Who&apos;s been coming · 12 weeks</span></div>
          <div className="card-body">
            {people.length === 0 && <div style={{ fontSize: 13, color: '#718096' }}>No one named yet.</div>}
            {people.map(p => (
              <div key={p.individual.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, minHeight: 36, alignItems: 'center', borderBottom: '1px solid #edf2f7', fontSize: 14, color: '#2d3748' }}>
                <span>{individualDisplayName(p.individual)}</span>
                <span style={{ fontSize: 12, color: '#718096', flexShrink: 0 }}>{p.records} of {space.people.recordCount}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span>Records</span></div>
          <div className="card-body">
            {records.length === 0 && <div style={{ fontSize: 13, color: '#718096' }}>Nothing recorded yet.</div>}
            {records.map(r => {
              const named = namedLabel(r.people.length, r.count);
              const inner = (
                <>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#2d3748' }}>{shortDate(r.date)}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#2d3748' }}>{r.count}</span>
                  </span>
                  {named && <span style={{ display: 'block', fontSize: 12, color: '#718096' }}>{named}</span>}
                  {r.note && <span style={{ display: 'block', fontSize: 12, color: '#4a5568' }}>{r.note}</span>}
                </>
              );
              const style: React.CSSProperties = { display: 'block', width: '100%', minHeight: 44, padding: '8px 4px', background: 'none', border: 'none', borderBottom: '1px solid #edf2f7', textAlign: 'left', boxSizing: 'border-box' };
              return mayRecord
                ? <button key={r.id} onClick={() => setEditing(r)} style={{ ...style, cursor: 'pointer' }}>{inner}</button>
                : <div key={r.id} style={style}>{inner}</div>;
            })}
            {moreError && <div style={{ color: '#e53e3e', fontSize: 13, marginTop: 8 }}>{moreError}</div>}
            {lastPage >= PAGE && (
              <button onClick={() => void showMore()} disabled={loadingMore} style={{ ...BTN, marginTop: 8 }}>{loadingMore ? 'Loading…' : 'Show more'}</button>
            )}
          </div>
        </div>

        {canWrite && !space.archivedAt && (
          <div><button onClick={() => setEditingSpace(true)} style={BTN}>Edit space</button></div>
        )}
      </div>

      {(recording || editing) && (
        <RecordModal nucleus={nucleus} space={space} record={editing ?? undefined} onClose={() => { setRecording(false); setEditing(null); }} onSaved={saved} />
      )}
      {editingSpace && (
        <SpaceFormModal nucleus={nucleus} kinds={kinds} existingNames={[]} initial={space} onClose={() => setEditingSpace(false)} onSaved={saved} />
      )}
    </>
  );
}
