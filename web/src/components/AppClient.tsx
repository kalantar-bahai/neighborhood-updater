'use client';

import { useState, useEffect, useRef } from 'react';
import { InitialData, NucleusDetail, NucleusSummary } from '@/types';
import { parentOptions } from '@/lib/nucleusIdentity';
import { nucleusFromUrl, nucleusHref } from '@/lib/nucleusUrl';
import type { PermissionSet } from '@/lib/access';
import { effectivePermissions, reloadOutcome } from '@/lib/srp';
import Picker from './Picker';
import DetailView from './DetailView';
import CreateNucleusModal from './CreateNucleusModal';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

const NO_ACCESS: PermissionSet = {
  canRead: false, canWrite: false, canChangeIdentity: false, canDelete: false,
  canAssignRoles: false, assignableRoles: [], createableEntityTypes: [],
};

export default function AppClient() {
  const [initialData, setInitialData] = useState<InitialData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<NucleusDetail | null>(null);
  const [selectedNucleus, setSelectedNucleus] = useState<string | null>(null);
  // Bumped on every successful (re)load so DetailView remounts with fresh form state.
  const [detailVersion, setDetailVersion] = useState(0);
  // A one-shot status for the DetailView a reload mounts (e.g. "3 moved in; SRP is being updated").
  const [reloadNotice, setReloadNotice] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  // Card open/closed state for the open nucleus. Kept here, not in DetailView, so it survives
  // the remount on an in-place reload; cleared when the user leaves the nucleus.
  const [cardOpen, setCardOpen] = useState<Record<string, boolean>>({});
  // Shown above the list when the address named a nucleus this user can't open (removed, or no access).
  const [urlNote, setUrlNote] = useState('');
  // The open nucleus is in the address (/?nucleus=<id>, see lib/nucleusUrl.ts) so refresh and the phone's back
  // button keep you on it. rowsRef is the latest list, for the popstate handler; pushedRef says the current
  // history entry is one we pushed, so the in-app Back can step back to the list instead of stacking a new entry.
  const rowsRef = useRef<NucleusSummary[]>([]);
  const pushedRef = useRef(false);

  function setAddress(name: string | null, rows: NucleusSummary[], mode: 'push' | 'replace') {
    const href = nucleusHref(name ? rows.find(r => r.nucleus === name)?.id ?? null : null);
    if (href === window.location.pathname + window.location.search) return;
    if (mode === 'push') { window.history.pushState(null, '', href); pushedRef.current = true; }
    else window.history.replaceState(null, '', href);
  }

  // openAfter: a nucleus to open once the fresh data (and its permissions) is in.
  // Used after creating a nucleus -- the permissions map loaded at startup has no
  // entry for it, so opening it straight away fell back to NO_ACCESS (read-only).
  function loadInitialData(openAfter?: string, mode: 'push' | 'replace' = 'replace') {
    fetch('/api/initial-data')
      .then(r => r.json())
      .then((data: InitialData & { error?: string }) => {
        if (data.error) { setError(data.error); return; }
        setInitialData(data);
        rowsRef.current = data.rows;
        if (openAfter) { setAddress(openAfter, data.rows, mode); loadNucleus(openAfter); return; }
        const fromUrl = nucleusFromUrl(window.location.search, data.rows);
        if (fromUrl.kind === 'open') { loadNucleus(fromUrl.name); return; }
        if (fromUrl.kind === 'missing') {
          setUrlNote("That nucleus wasn't found. It may have been removed, or you may not have access to it.");
          window.history.replaceState(null, '', nucleusHref(null));
        }
        if (data.rows.length === 1) { setAddress(data.rows[0].nucleus, data.rows, 'replace'); loadNucleus(data.rows[0].nucleus); }
      })
      .catch(() => setError('Failed to load. Please refresh.'));
  }

  useEffect(() => { loadInitialData(); }, []);

  // Browser back/forward: open whatever the address now names, or go to the list.
  useEffect(() => {
    const onPop = () => {
      pushedRef.current = false;
      const target = nucleusFromUrl(window.location.search, rowsRef.current);
      if (target.kind === 'open') { setCardOpen({}); loadNucleus(target.name); }
      else showList();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function loadNucleus(name: string) {
    setUrlNote('');
    setLoadingDetail(true);
    setSelectedNucleus(name);
    setDetail(null);
    setReloadNotice(null);
    fetch(`/api/nucleus?name=${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setDetail(data);
        setDetailVersion(v => v + 1);
      })
      .catch(() => setError('Failed to load nucleus.'))
      .finally(() => setLoadingDetail(false));
  }

  // In-place reload (Refresh, Push to SRP, Delete): no full-page "Loading..." flash.
  function reloadNucleus(name: string, notice?: string) {
    fetch(`/api/nucleus?name=${encodeURIComponent(name)}`)
      .then(async r => {
        const outcome = reloadOutcome(r.status);
        if (outcome === 'gone') { handleBack(); return; }
        const data = await r.json();
        if (outcome === 'error' || data.error) { setError(data.error || 'Failed to load nucleus.'); return; }
        setReloadNotice(notice ?? null);
        setDetail(data);
        setDetailVersion(v => v + 1);
      })
      .catch(() => setError('Failed to load nucleus.'));
  }

  // In-app Back (and a nucleus that has gone): if we pushed this entry, step back so the history stays tidy;
  // the popstate handler then shows the list. Otherwise (arrived by refresh or link) just clear the address.
  function handleBack() {
    if (pushedRef.current) { window.history.back(); return; }
    setAddress(null, rowsRef.current, 'replace');
    showList();
  }

  function showList() {
    setCardOpen({});
    setDetail(null);
    setSelectedNucleus(null);
    loadInitialData();
  }

  if (error) {
    return (
      <div className="error-state">
        <div>{error}</div>
        <button
          onClick={() => window.location.href = '/signout'}
          style={{ marginTop: 16, fontSize: 13, color: '#3182ce', background: 'none', border: '1px solid #bee3f8', borderRadius: 6, padding: '6px 16px', cursor: 'pointer' }}
        >
          Login with a different account
        </button>
      </div>
    );
  }

  if (!initialData || loadingDetail) {
    return <div className="loading-state">Loading...</div>;
  }

  if (detail && selectedNucleus) {
    const perms = initialData.access.permissions[norm(selectedNucleus)] ?? NO_ACCESS;
    const permissions = effectivePermissions(perms, detail.srp.state, detail.srp.action?.action);
    return (
      <DetailView
        key={`${selectedNucleus}:${detailVersion}`}
        detail={detail}
        permissions={permissions}
        email={initialData.email}
        showBack={initialData.rows.length > 1}
        onBack={handleBack}
        onSaved={() => {}}
        onReload={notice => reloadNucleus(selectedNucleus, notice)}
        initialNotice={reloadNotice}
        onRenamed={(newName) => { setDetail(null); setSelectedNucleus(newName); setLoadingDetail(true); loadInitialData(newName); }}
        onOpenNucleus={(name) => { setCardOpen({}); setAddress(name, initialData.rows, 'push'); loadNucleus(name); }}
        canCreateInCluster={initialData.clusterNames.includes(detail.row.cluster)}
        allNucleusNames={initialData.rows.map(r => r.nucleus)}
        parentChoices={parentOptions(initialData.rows, selectedNucleus, detail.row.cluster)}
        childCount={initialData.rows.filter(r => r.parentNucleus === selectedNucleus).length}
        rows={initialData.rows}
        cardOpen={cardOpen}
        onCardOpenChange={(key, open) => setCardOpen(c => ({ ...c, [key]: open }))}
      />
    );
  }

  // Gates "+Add nucleus" on whether there's any cluster this user can actually
  // create one under (2026-10-05) -- clusterNames is already filtered to exactly
  // those clusters (see /api/initial-data/route.ts), so this is the same check the
  // PUT route itself enforces, not a separate approximation of it. Replaces the
  // old isAdministrator-based gate, which hid this capability from anyone who
  // wasn't also a global Administrator -- a different, much rarer role.
  const canCreateNucleus = initialData.clusterNames.length > 0;

  return (
    <>
      {urlNote && (
        <div role="status" style={{ margin: '8px 0', padding: '8px 12px', fontSize: 13, color: '#744210', background: '#fffff0', border: '1px solid #f6e05e', borderRadius: 6, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <span>{urlNote}</span>
          <button type="button" onClick={() => setUrlNote('')} aria-label="Dismiss" style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#744210', minWidth: 32, minHeight: 32 }}>×</button>
        </div>
      )}
      {/* The bottom-of-page by-nucleus-type summary cards (Neighborhood/Network/
          Population) are gone, 2026-10-08 -- every bar in Picker's own hierarchy
          (cluster, locality) now carries its own activities/participants/FoF
          rollup, making a separate by-type summary redundant. */}
      <Picker
        rows={initialData.rows}
        email={initialData.email}
        onSelect={(name) => { setCardOpen({}); setAddress(name, initialData.rows, 'push'); loadNucleus(name); }}
        onAdd={canCreateNucleus ? () => setCreatingNew(true) : undefined}
        onAdmin={initialData.isAdmin ? () => window.location.href = '/admin' : undefined}
      />

      {creatingNew && (
        <CreateNucleusModal
          clusterNames={initialData.clusterNames}
          onClose={() => setCreatingNew(false)}
          onCreated={(name) => { setCreatingNew(false); loadInitialData(name, 'push'); }}
        />
      )}
    </>
  );
}
