'use client';

import React, { useState } from 'react';
import { NucleusSummary } from '@/types';
import StaggeredConcentricDiagram, { type AlignedLabel } from './StaggeredConcentricDiagram';

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

// Exact styling the old bottom-of-page by-type cards used (removed 2026-10-08) --
// now shown per Cluster/Locality group instead of once for the whole page.
const TYPE_META: Record<string, { label: string; bg: string; color: string; border: string }> = {
  neighborhood: { label: 'Neighborhood', bg: '#bee3f8', color: '#2c5282', border: '#90cdf4' },
  network:      { label: 'Network',      bg: '#c6f6d5', color: '#276749', border: '#9ae6b4' },
  population:   { label: 'Population',   bg: '#e9d8fd', color: '#553c9a', border: '#d6bcfa' },
};

// A bar's own single line just shows the nucleus count -- act/part/FoF moved into
// RollupCards below, broken down by type, shown only once a group is expanded
// (rather than crowding the always-visible bar with four numbers per type).
function nucleusCountLabel(rowsIn: NucleusSummary[]): string {
  return `${rowsIn.length} nucle${rowsIn.length !== 1 ? 'i' : 'us'}`;
}

const NINE_FIELD_KEYS = [
  'totalPop', 'inConversation', 'inCommunityActivities', 'protagonists', 'devotionalHosts',
  'inEducationalActivities', 'educationalFacilitators', 'helpingOthers', 'accompanying',
] as const;
type NineFieldKey = typeof NINE_FIELD_KEYS[number];

// The Overview card's nine fields, summed across a set of rows for the popup
// diagram. Every row is added -- nuclei sharing a Setting are separate groups
// of people working the same neighbourhood, and SRP itself sums every nucleus
// at a Setting (confirmed with cluster-notebook 2026-10-08: that's exactly
// what gets sent to SRP), so there's no overlap to dedupe there. See
// findOverlappingPockets below for the one overlap that IS a real open
// question -- a pocket vs. its own parentNucleus, not Setting-sharing.
//
// Per field, also tracks whether ANY row in the set has ever had it set at all
// (confirmed with cluster-notebook 2026-10-08: most nuclei in dev data have
// never set any of these nine, so a group containing only never-set nuclei
// must read as "not set", not as a real, reported 0 -- see
// nineFieldsToStaggeredLabels below for where that distinction surfaces).
function sumNineFields(rowsIn: NucleusSummary[]) {
  const sums = {} as Record<NineFieldKey, number>;
  const everSet = {} as Record<NineFieldKey, boolean>;
  NINE_FIELD_KEYS.forEach(key => { sums[key] = 0; everSet[key] = false; });
  rowsIn.forEach(r => {
    NINE_FIELD_KEYS.forEach(key => {
      const v = r[key];
      if (v != null) { sums[key] += v; everSet[key] = true; }
    });
  });
  return { sums, everSet };
}

// Whether a pocket's people are already counted in its parent's own numbers is
// a modelling question cluster-notebook has put to Michael, not something
// either side should assume (2026-10-08) -- so rather than drop one side's
// numbers (which could just as easily be wrong), flag any nucleus in this set
// whose parentNucleus is ALSO in this set, and let the popup show a warning
// instead of silently misstating the total.
function findOverlappingPockets(rowsIn: NucleusSummary[]): string[] {
  const names = new Set(rowsIn.map(r => r.nucleus));
  return rowsIn
    .filter(r => r.parentNucleus && names.has(r.parentNucleus))
    .map(r => r.nucleus);
}

// Same inner -> outer order as DetailView's own staggeredLabels, minus the
// per-nucleus worker-list onClicks (those drill into one nucleus's own
// workers; a rollup across several nuclei has no single worker list to show).
// A field nobody in the group ever set renders as '' -- formatNum already
// turns that into "____", the same "not set" look DetailView itself uses for
// one nucleus's own unset fields, so a never-set group reads as unset rather
// than as a suspiciously-precise 0.
function nineFieldsToStaggeredLabels({ sums, everSet }: ReturnType<typeof sumNineFields>): AlignedLabel[] {
  const v = (key: NineFieldKey) => everSet[key] ? String(sums[key]) : '';
  return [
    { label: 'Accompanying',                          value: v('accompanying') },
    { label: 'Helping Others',                         value: v('helpingOthers') },
    { label: 'Facilitating Ed. Act.',                  value: v('educationalFacilitators') },
    { label: 'Participating in Ed. Act.',              value: v('inEducationalActivities') },
    { label: 'Hosting Devotional Meetings/Gatherings', value: v('devotionalHosts') },
    { label: 'Protagonists/Promoting',                 value: v('protagonists') },
    { label: 'Participating',                          value: v('inCommunityActivities') },
    { label: 'In Conversation',                        value: v('inConversation') },
    { label: 'Population/Residing',                    value: v('totalPop') },
  ];
}

function rollupByType(rowsIn: NucleusSummary[]) {
  // Population pre-seeded so its card always renders (2026-10-08), even at 0 --
  // every other type only shows up when at least one nucleus has it.
  const totals: Record<string, { count: number; act: number; part: number; fof: number; rows: NucleusSummary[] }> = {
    population: { count: 0, act: 0, part: 0, fof: 0, rows: [] },
  };
  rowsIn.forEach(r => {
    const key = (r.nucleusType || '').toLowerCase().trim() || 'neighborhood';
    if (!totals[key]) totals[key] = { count: 0, act: 0, part: 0, fof: 0, rows: [] };
    totals[key].count += 1;
    totals[key].act   += r.totalAct  || 0;
    totals[key].part  += r.totalPart || 0;
    totals[key].fof   += r.totalFof  || 0;
    totals[key].rows.push(r);
  });
  return (['neighborhood', 'network', 'population'] as const)
    .filter(key => key in totals)
    .map(key => [key, totals[key]] as const);
}

// Neutral styling for the "All" card (2026-10-08) -- deliberately not one of
// TYPE_META's type colors, since it spans every type rather than belonging to
// one.
const ALL_TYPES_META = { label: 'All', bg: '#edf2f7', color: '#2d3748', border: '#cbd5e0' };

// One small card per nucleus type actually present in this group (population
// always included, even at 0 -- see rollupByType), plus one "All" card first
// summing every type together. A group with only Neighborhoods shows two
// cards (All, Neighborhood, Population); a mixed one shows up to four.
// Clicking a card (2026-10-08) opens a popup rollup diagram of all the
// nuclei it summarizes; groupLabel names that group (a locality or cluster
// name) for the popup's title.
function RollupCards({ rows: rowsIn, groupLabel, onCardClick }: {
  rows: NucleusSummary[];
  groupLabel: string;
  onCardClick: (title: string, rows: NucleusSummary[]) => void;
}) {
  const summaries = rollupByType(rowsIn);
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0 8px 20px' }}>
      <div
        className="card" style={{ flex: '0 1 150px', margin: 0, cursor: 'pointer' }}
        onClick={() => onCardClick(`${ALL_TYPES_META.label} — ${groupLabel}`, rowsIn)}
      >
        <div className="card-header" style={{ background: ALL_TYPES_META.bg, color: ALL_TYPES_META.color, borderBottom: `1px solid ${ALL_TYPES_META.border}`, fontSize: 12, padding: '4px 10px' }}>
          {ALL_TYPES_META.label}
        </div>
        <div className="card-body" style={{ padding: '6px 10px' }}>
          {/* Thumbnail of the same diagram the popup shows full-size -- compact
              drops the labels, which would shrink to illegible at this size. */}
          <div style={{ width: 70, margin: '0 auto' }}>
            <StaggeredConcentricDiagram labels={nineFieldsToStaggeredLabels(sumNineFields(rowsIn))} compact />
          </div>
          <div style={{ fontSize: 12, textAlign: 'center', color: '#718096', marginTop: 2 }}>{nucleusCountLabel(rowsIn)}</div>
        </div>
      </div>
      {summaries.map(([key, s]) => {
        const meta = TYPE_META[key];
        return (
          <div
            key={key} className="card" style={{ flex: '0 1 150px', margin: 0, cursor: 'pointer' }}
            onClick={() => onCardClick(`${meta.label} — ${groupLabel}`, s.rows)}
          >
            <div className="card-header" style={{ background: meta.bg, color: meta.color, borderBottom: `1px solid ${meta.border}`, fontSize: 12, padding: '4px 10px' }}>
              {meta.label}
            </div>
            <div className="card-body" style={{ fontSize: 12, padding: '6px 10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px' }}>
                <span style={{ color: '#718096', textAlign: 'right' }}>Nuclei</span>       <span style={{ fontWeight: 600 }}>{s.count}</span>
                <span style={{ color: '#718096', textAlign: 'right' }}>Activities</span>   <span style={{ fontWeight: 600 }}>{s.act}</span>
                <span style={{ color: '#718096', textAlign: 'right' }}>Participants</span> <span style={{ fontWeight: 600 }}>{s.part}</span>
                <span style={{ color: '#718096', textAlign: 'right' }}>FoF</span>          <span style={{ fontWeight: 600 }}>{s.fof}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Picker({ rows, email, onSelect, onSignOut, onAdd }: Props) {
  const [openClusters, setOpenClusters] = useState<Set<string>>(new Set());
  const [openPockets, setOpenPockets] = useState<Set<string>>(new Set());
  const [openLocalities, setOpenLocalities] = useState<Set<string>>(new Set());
  // Rollup-card popup (2026-10-08) -- null when closed. `rows` are the exact
  // nuclei the clicked card already summed, re-summed here into the nine-field
  // totals the staggered diagram needs (the card itself only shows nuclei/act/
  // part/FoF, not the nine fields, so this is computed on click, not upfront).
  const [popup, setPopup] = useState<{ title: string; rows: NucleusSummary[] } | null>(null);

  function openRollupPopup(title: string, rowsIn: NucleusSummary[]) {
    setPopup({ title, rows: rowsIn });
  }

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
            <span className="cluster-count">{nucleusCountLabel(localityRows)}</span>
          </div>
          <div className={`cluster-rows${isOpen ? ' open' : ''}`}>
            {isOpen && <RollupCards rows={localityRows} groupLabel={loc || '(No Locality)'} onCardClick={openRollupPopup} />}
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
    <>
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
                    <span className="cluster-count">{nucleusCountLabel(clusterRows)}</span>
                  </div>

                  <div className={`cluster-rows${isClusterOpen ? ' open' : ''}`}>
                    {isClusterOpen && <RollupCards rows={clusterRows} groupLabel={clusterName} onCardClick={openRollupPopup} />}
                    {renderLocalityGroups(clusterRows, clusterKey)}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>

    {/* Rollup-card popup (2026-10-08) -- same click-outside-to-close overlay
        pattern as CreateNucleusModal/WorkerListModal. */}
    {popup && (
      <div
        onClick={() => setPopup(null)}
        onKeyDown={e => { if (e.key === 'Escape') setPopup(null); }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{ background: 'white', borderRadius: 12, padding: '20px 24px', maxWidth: 560, width: '100%' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#2d3748' }}>{popup.title}</div>
            <button onClick={() => setPopup(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#718096', lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ fontSize: 12, color: '#718096', marginBottom: 8 }}>{nucleusCountLabel(popup.rows)}</div>
          {(() => {
            const overlapping = findOverlappingPockets(popup.rows);
            return overlapping.length > 0 && (
              <div style={{ fontSize: 12, color: '#975a16', background: '#fefcbf', border: '1px solid #faf089', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
                Totals may double-count: {overlapping.join(', ')} {overlapping.length === 1 ? 'is' : 'are'} also counted under {overlapping.length === 1 ? 'its' : 'their'} parent nucleus, and whether its numbers overlap is still an open question.
              </div>
            );
          })()}
          <StaggeredConcentricDiagram labels={nineFieldsToStaggeredLabels(sumNineFields(popup.rows))} />
        </div>
      </div>
    )}
    </>
  );
}
