'use client';

import { useState } from 'react';
import { NeighborhoodSummary } from '@/types';

interface Props {
  rows: NeighborhoodSummary[];
  email: string;
  srpNames: string[];
  onSelect: (name: string) => void;
  onSignOut: () => void;
}

export default function Picker({ rows, email, srpNames, onSelect, onSignOut }: Props) {
  const [openClusters, setOpenClusters] = useState<Set<string>>(new Set());
  const [openPockets, setOpenPockets] = useState<Set<string>>(new Set());

  function inSrp(r: NeighborhoodSummary) {
    const name = (r.neighborhood || '').toLowerCase().trim();
    if (srpNames.includes(name)) return true;
    if (r.parentNeighborhood) {
      const combined = (r.parentNeighborhood + ' - ' + r.neighborhood).toLowerCase().trim();
      if (srpNames.includes(combined)) return true;
    }
    return false;
  }

  function toggleCluster(key: string) {
    setOpenClusters(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }

  function togglePocket(key: string) {
    setOpenPockets(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }

  function NeighborhoodItem({ r, isPocket }: { r: NeighborhoodSummary; isPocket: boolean }) {
    return (
      <div className={`picker-item${isPocket ? ' pocket-item' : ''}`} onClick={() => onSelect(r.neighborhood)}>
        <div>
          <div className="name">{r.neighborhood}</div>
          <div className="sub">{r.locality}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!inSrp(r) && <span className="no-srp-badge">SRP</span>}
          {r.stage && <span className="stage-badge">{r.stage}</span>}
        </div>
      </div>
    );
  }

  function renderClusterContent(clusterRows: NeighborhoodSummary[], keyPrefix: string) {
    const parentMap: Record<string, NeighborhoodSummary[]> = {};
    const parentOrder: string[] = [];
    const standaloneMap: Record<string, NeighborhoodSummary> = {};

    clusterRows.forEach(r => {
      const p = (r.parentNeighborhood || '').trim();
      if (!p) {
        standaloneMap[r.neighborhood] = r;
      } else {
        if (!parentMap[p]) { parentMap[p] = []; parentOrder.push(p); }
        parentMap[p].push(r);
      }
    });
    parentOrder.forEach(p => delete standaloneMap[p]);

    const entries: Array<{ type: 'standalone'; row: NeighborhoodSummary } | { type: 'parent'; name: string }> = [];
    Object.values(standaloneMap).forEach(row => entries.push({ type: 'standalone', row }));
    parentOrder.forEach(name => entries.push({ type: 'parent', name }));
    entries.sort((a, b) => a.type === 'standalone' && b.type === 'standalone'
      ? a.row.neighborhood.localeCompare(b.row.neighborhood)
      : (a.type === 'standalone' ? a.row.neighborhood : a.name)
          .localeCompare(b.type === 'standalone' ? b.row.neighborhood : b.name));

    return entries.map(entry => {
      if (entry.type === 'standalone') {
        return <NeighborhoodItem key={entry.row.neighborhood} r={entry.row} isPocket={false} />;
      }
      const parentName = entry.name;
      const pocketKey = `${keyPrefix}__${parentName}`;
      const isPocketOpen = openPockets.has(pocketKey);
      const parentRow = clusterRows.find(r => r.neighborhood === parentName && !r.parentNeighborhood);

      return (
        <div key={parentName}>
          <div className="parent-item">
            <span
              className={`parent-arrow${isPocketOpen ? ' open' : ''}`}
              onClick={() => togglePocket(pocketKey)}
            >▶</span>
            <span className="parent-name" onClick={() => parentRow && onSelect(parentName)}>
              {parentName}
            </span>
            {parentRow?.stage && <span className="stage-badge">{parentRow.stage}</span>}
          </div>
          <div className={`pocket-rows${isPocketOpen ? ' open' : ''}`}>
            {parentMap[parentName].map(r => (
              <NeighborhoodItem key={r.neighborhood} r={r} isPocket />
            ))}
          </div>
        </div>
      );
    });
  }

  // Build grouping → cluster → rows hierarchy
  const groupingOrder: string[] = [];
  const groupingMap: Record<string, { clusterOrder: string[]; clusterMap: Record<string, NeighborhoodSummary[]> }> = {};

  rows.forEach(r => {
    const g = (r.grouping || '').trim() || 'Unspecified';
    const c = (r.cluster || '').trim() || 'Unspecified';
    if (!groupingMap[g]) { groupingMap[g] = { clusterOrder: [], clusterMap: {} }; groupingOrder.push(g); }
    const gEntry = groupingMap[g];
    if (!gEntry.clusterMap[c]) { gEntry.clusterMap[c] = []; gEntry.clusterOrder.push(c); }
    gEntry.clusterMap[c].push(r);
  });

  groupingOrder.sort((a, b) => a.localeCompare(b));
  Object.values(groupingMap).forEach(g => {
    g.clusterOrder.sort((a, b) => a.localeCompare(b));
    Object.values(g.clusterMap).forEach(arr => arr.sort((a, b) => a.neighborhood.localeCompare(b.neighborhood)));
  });

  const uniqueClusters = new Set(rows.map(r => (r.cluster || '').trim()));
  const isSingleCluster = uniqueClusters.size <= 1;

  return (
    <div className="picker-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div className="picker-title">My Neighborhoods</div>
        <button onClick={onSignOut} style={{ fontSize: 12, color: '#718096', background: 'none', border: '1px solid #cbd5e0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
      <div className="picker-sub">{email}</div>

      {isSingleCluster ? (
        renderClusterContent(rows, 'flat')
      ) : groupingOrder.map(gName => {
        const gEntry = groupingMap[gName];
        return (
          <div key={gName}>
            <div className="grouping-label">{gName}</div>
            {gEntry.clusterOrder.map(clusterName => {
              const clusterRows = gEntry.clusterMap[clusterName];
              const clusterKey = `${gName}__${clusterName}`;
              const isClusterOpen = openClusters.has(clusterKey);

              return (
                <div key={clusterKey}>
                  <div className="cluster-header" onClick={() => toggleCluster(clusterKey)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`cluster-arrow${isClusterOpen ? ' open' : ''}`}>▶</span>
                      <span className="cluster-name">{clusterName}</span>
                    </div>
                    <span className="cluster-count">{clusterRows.length} neighborhood{clusterRows.length !== 1 ? 's' : ''}</span>
                  </div>

                  <div className={`cluster-rows${isClusterOpen ? ' open' : ''}`}>
                    {renderClusterContent(clusterRows, clusterKey)}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
