'use client';

import React, { useState } from 'react';
import { NucleusSummary } from '@/types';

interface Props {
  rows: NucleusSummary[];
  email: string;
  onSelect: (name: string) => void;
  onSignOut: () => void;
  onAdd?: () => void;
}

function typeBadgeStyle(nucleusType: string): React.CSSProperties {
  const t = (nucleusType || '').toLowerCase();
  if (t === 'neighborhood') return { background: '#bee3f8', color: '#2c5282' };
  if (t === 'network')      return { background: '#c6f6d5', color: '#276749' };
  if (t === 'population')   return { background: '#e9d8fd', color: '#553c9a' };
  return {};
}

// Backs the rollup shown on each Cluster/Locality bar, 2026-10-08 -- same totals
// the bottom-of-page type cards used to show (totalAct/totalPart/totalFof, already
// on every NucleusSummary row), just rolled up by cluster/locality instead of by
// nucleus type. Those cards are gone now that every bar in the hierarchy carries
// its own rollup.
function rollup(rowsIn: NucleusSummary[]) {
  return rowsIn.reduce((acc, r) => ({
    count: acc.count + 1,
    act: acc.act + (r.totalAct || 0),
    part: acc.part + (r.totalPart || 0),
    fof: acc.fof + (r.totalFof || 0),
  }), { count: 0, act: 0, part: 0, fof: 0 });
}

function RollupSummary({ rows: rowsIn }: { rows: NucleusSummary[] }) {
  const s = rollup(rowsIn);
  return (
    <span className="cluster-count">
      {s.count} nucle{s.count !== 1 ? 'i' : 'us'} · {s.act} act · {s.part} part · {s.fof} FoF
    </span>
  );
}

export default function Picker({ rows, email, onSelect, onSignOut, onAdd }: Props) {
  const [openClusters, setOpenClusters] = useState<Set<string>>(new Set());
  const [openPockets, setOpenPockets] = useState<Set<string>>(new Set());
  const [openLocalities, setOpenLocalities] = useState<Set<string>>(new Set());

  function toggleCluster(key: string) {
    setOpenClusters(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }

  function togglePocket(key: string) {
    setOpenPockets(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }

  function toggleLocality(key: string) {
    setOpenLocalities(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }

  function NeighborhoodItem({ r, isPocket }: { r: NucleusSummary; isPocket: boolean }) {
    return (
      <div className={`picker-item${isPocket ? ' pocket-item' : ''}`} onClick={() => onSelect(r.nucleus)}>
        <div>
          <div className="name">{r.nucleus}</div>
          <div className="sub">{r.locality}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {r.stage && <span className="stage-badge" style={typeBadgeStyle(r.nucleusType)}>{r.stage}</span>}
        </div>
      </div>
    );
  }

  function renderClusterContent(clusterRows: NucleusSummary[], keyPrefix: string) {
    const parentMap: Record<string, NucleusSummary[]> = {};
    const parentOrder: string[] = [];
    const standaloneMap: Record<string, NucleusSummary> = {};

    clusterRows.forEach(r => {
      const p = (r.parentNucleus || '').trim();
      if (!p) {
        standaloneMap[r.nucleus] = r;
      } else {
        if (!parentMap[p]) { parentMap[p] = []; parentOrder.push(p); }
        parentMap[p].push(r);
      }
    });
    parentOrder.forEach(p => delete standaloneMap[p]);

    const entries: Array<{ type: 'standalone'; row: NucleusSummary } | { type: 'parent'; name: string }> = [];
    Object.values(standaloneMap).forEach(row => entries.push({ type: 'standalone', row }));
    parentOrder.forEach(name => entries.push({ type: 'parent', name }));
    entries.sort((a, b) => a.type === 'standalone' && b.type === 'standalone'
      ? a.row.nucleus.localeCompare(b.row.nucleus)
      : (a.type === 'standalone' ? a.row.nucleus : a.name)
          .localeCompare(b.type === 'standalone' ? b.row.nucleus : b.name));

    return entries.map(entry => {
      if (entry.type === 'standalone') {
        return <NeighborhoodItem key={entry.row.nucleus} r={entry.row} isPocket={false} />;
      }
      const parentName = entry.name;
      const pocketKey = `${keyPrefix}__${parentName}`;
      const isPocketOpen = openPockets.has(pocketKey);
      const parentRow = clusterRows.find(r => r.nucleus === parentName && !r.parentNucleus);

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
            {parentRow?.stage && <span className="stage-badge" style={typeBadgeStyle(parentRow.nucleusType)}>{parentRow.stage}</span>}
          </div>
          <div className={`pocket-rows${isPocketOpen ? ' open' : ''}`}>
            {parentMap[parentName].map(r => (
              <NeighborhoodItem key={r.nucleus} r={r} isPocket />
            ))}
          </div>
        </div>
      );
    });
  }

  // New locality level, 2026-10-08, sitting between Cluster and the existing
  // parent/pocket nesting above: no-locality nuclei first, then real localities
  // alphabetically. A pocket buckets under its PARENT's locality, not its own --
  // cluster-notebook recommends a pocket have no locality at all (it's meant to be
  // covered by the parent's), so bucketing it by its own locality would split it
  // from the very parent it's supposed to nest under. Falls back to the pocket's
  // own locality if the parent isn't found in this same cluster (shouldn't happen
  // for real data). Each bucket still gets passed whole into renderClusterContent,
  // so that function's own parent/pocket nesting needs no changes at all.
  function renderLocalityGroups(clusterRows: NucleusSummary[], keyPrefix: string) {
    function effectiveLocality(r: NucleusSummary): string {
      const parentName = (r.parentNucleus || '').trim();
      if (!parentName) return (r.locality || '').trim();
      const parent = clusterRows.find(p => p.nucleus === parentName);
      return ((parent ? parent.locality : r.locality) || '').trim();
    }

    const localityOrder: string[] = [];
    const localityMap: Record<string, NucleusSummary[]> = {};
    clusterRows.forEach(r => {
      const loc = effectiveLocality(r);
      if (!localityMap[loc]) { localityMap[loc] = []; localityOrder.push(loc); }
      localityMap[loc].push(r);
    });
    localityOrder.sort((a, b) => {
      if (a === '' || b === '') return a === b ? 0 : (a === '' ? -1 : 1);
      return a.localeCompare(b);
    });
    // Same reasoning as the single-cluster case above -- one locality bucket
    // (very likely in practice: every nucleus with no locality set lands in one
    // "(No Locality)" bucket) shouldn't need a click to reveal, since there's
    // nothing to filter between.
    const isSingleLocality = localityOrder.length === 1;

    return localityOrder.map(loc => {
      const localityRows = localityMap[loc];
      const localityKey = `${keyPrefix}__loc_${loc || '(none)'}`;
      const isOpen = isSingleLocality || openLocalities.has(localityKey);
      return (
        <div key={localityKey}>
          <div
            className="cluster-header"
            onClick={isSingleLocality ? undefined : () => toggleLocality(localityKey)}
            style={isSingleLocality ? { paddingLeft: 20, cursor: 'default' } : { paddingLeft: 20 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!isSingleLocality && <span className={`cluster-arrow${isOpen ? ' open' : ''}`}>▶</span>}
              <span className="cluster-name">{loc || '(No Locality)'}</span>
            </div>
            <RollupSummary rows={localityRows} />
          </div>
          <div className={`cluster-rows${isOpen ? ' open' : ''}`}>
            {renderClusterContent(localityRows, localityKey)}
          </div>
        </div>
      );
    });
  }

  // Build grouping → cluster → rows hierarchy
  const groupingOrder: string[] = [];
  const groupingMap: Record<string, { clusterOrder: string[]; clusterMap: Record<string, NucleusSummary[]> }> = {};

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
    Object.values(g.clusterMap).forEach(arr => arr.sort((a, b) => a.nucleus.localeCompare(b.nucleus)));
  });

  // Separate from the cluster-level change below -- grouping is its own, pre-
  // existing concept (unaffected by that change), and keeps its existing "don't
  // bother labeling it when there's only one" behavior.
  const isSingleGrouping = new Set(rows.map(r => (r.grouping || '').trim())).size <= 1;
  // With cluster bars now always rendered (see below), the common single-cluster
  // case (cluster-notebook deployments are one cluster each by design) would
  // otherwise start collapsed behind an extra, pointless click -- collapsing the
  // only option filters nothing. So a single cluster renders as a plain,
  // non-interactive summary bar, always open; multiple clusters keep the
  // existing click-to-expand behavior, collapsed by default.
  const isSingleCluster = new Set(rows.map(r => (r.cluster || '').trim())).size <= 1;

  return (
    <div className="picker-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div className="picker-title">My Nuclei</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {onAdd && (
            <button onClick={onAdd} style={{ fontSize: 12, color: '#2b6cb0', background: '#ebf4ff', border: '1px solid #bee3f8', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
              + Add
            </button>
          )}
          <button onClick={onSignOut} style={{ fontSize: 12, color: '#718096', background: 'none', border: '1px solid #cbd5e0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </div>
      <div className="picker-sub">{email}</div>

      {groupingOrder.map(gName => {
        const gEntry = groupingMap[gName];
        return (
          <div key={gName}>
            {/* Cluster bars now always show, with their own rollup (2026-10-08) --
                previously skipped entirely whenever there was only one cluster
                (the common case: cluster-notebook deployments are one cluster
                each by design), which meant no cluster-level summary ever
                appeared at all in practice. */}
            {!isSingleGrouping && <div className="grouping-label">{gName}</div>}
            {gEntry.clusterOrder.map(clusterName => {
              const clusterRows = gEntry.clusterMap[clusterName];
              const clusterKey = `${gName}__${clusterName}`;
              const isClusterOpen = isSingleCluster || openClusters.has(clusterKey);

              return (
                <div key={clusterKey}>
                  <div
                    className="cluster-header"
                    onClick={isSingleCluster ? undefined : () => toggleCluster(clusterKey)}
                    style={isSingleCluster ? { cursor: 'default' } : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {!isSingleCluster && <span className={`cluster-arrow${isClusterOpen ? ' open' : ''}`}>▶</span>}
                      <span className="cluster-name">{clusterName}</span>
                    </div>
                    <RollupSummary rows={clusterRows} />
                  </div>

                  <div className={`cluster-rows${isClusterOpen ? ' open' : ''}`}>
                    {renderLocalityGroups(clusterRows, clusterKey)}
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
