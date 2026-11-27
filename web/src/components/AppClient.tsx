'use client';

import { useState, useEffect, useRef } from 'react';
import { InitialData, NucleusDetail, NucleusSummary } from '@/types';
import { parentOptions } from '@/lib/nucleusIdentity';
import { nucleusFromUrl, nucleusHref } from '@/lib/nucleusUrl';
import type { PermissionSet } from '@/lib/access';
import { effectivePermissions, reloadOutcome } from '@/lib/srp';
import { readViewState, writeViewState } from '@/lib/viewState';
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
  // What is open on each page (cards and bars on a nucleus, clusters/localities/bars on the list; key '' is the
  // list) and where it was scrolled, so going to a child and coming back (in-app or browser Back) finds the page
  // as it was (owner, 2026-11-27). Saved in the tab's sessionStorage (lib/viewState.ts), so a reload does too.
  // Also survives the remount on an in-place reload. viewRef is the page shown now (null until the first shows);
  // restoreRef the page whose scroll to put back once it shows ('' at first: a reload on the list).
  const [openByView, setOpenByView] = useState<Record<string, Record<string, boolean>>>(
    () => typeof window === 'undefined' ? {} : readViewState().open);
  const scrollByView = useRef<Record<string, number> | null>(null);
  const viewRef = useRef<string | null>(null);
  const restoreRef = useRef<string | null>('');
  const openRef = useRef(openByView);
  openRef.current = openByView;

  function scrolls(): Record<string, number> {
    if (scrollByView.current === null) scrollByView.current = readViewState().scroll;
    return scrollByView.current;
  }

  // The page shown now's scroll, then everything, into the tab's storage.
  function saveViewState() {
    if (viewRef.current !== null) scrolls()[viewRef.current] = window.scrollY;
    writeViewState({ open: openRef.current, scroll: scrolls() });
  }

  function setOpen(view: string, key: string, open: boolean) {
    setOpenByView(v => ({ ...v, [view]: { ...v[view], [key]: open } }));
  }

  // Leaving the page shown now for `next`: remember its scroll, and put back `next`'s once it shows.
  function goToView(next: string) {
    saveViewState();
    viewRef.current = null;
    restoreRef.current = next;
  }
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

  useEffect(() => {
    // We put the scroll back ourselves (below), after the page's data is in; the browser would do it too early.
    window.history.scrollRestoration = 'manual';
    loadInitialData();
    // A reload or closing the tab: keep where the page is scrolled.
    window.addEventListener('pagehide', saveViewState);
    return () => window.removeEventListener('pagehide', saveViewState);
  }, []);

  useEffect(() => { writeViewState({ open: openByView, scroll: scrolls() }); }, [openByView]);

  useEffect(() => {
    const view = restoreRef.current;
    if (view === null) return;
    const shown = view === '' ? initialData !== null && selectedNucleus === null : detail !== null && !loadingDetail;
    if (!shown) return;
    restoreRef.current = null;
    viewRef.current = view;
    const y = scrolls()[view] ?? 0;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }, [initialData, selectedNucleus, detail, loadingDetail]);

  // Browser back/forward: open whatever the address now names, or go to the list.
  useEffect(() => {
    const onPop = () => {
      pushedRef.current = false;
      const target = nucleusFromUrl(window.location.search, rowsRef.current);
      if (target.kind === 'open') loadNucleus(target.name);
      else showList();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function loadNucleus(name: string) {
    goToView(name);
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
    goToView('');
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
        onOpenNucleus={(name) => { setAddress(name, initialData.rows, 'push'); loadNucleus(name); }}
        canCreateInCluster={initialData.clusterNames.includes(detail.row.cluster)}
        allNucleusNames={initialData.rows.map(r => r.nucleus)}
        parentChoices={parentOptions(initialData.rows, selectedNucleus, detail.row.cluster)}
        childCount={initialData.rows.filter(r => r.parentNucleus === selectedNucleus).length}
        rows={initialData.rows}
        cardOpen={openByView[selectedNucleus] ?? {}}
        onCardOpenChange={(key, open) => setOpen(selectedNucleus, key, open)}
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
        onSelect={(name) => { setAddress(name, initialData.rows, 'push'); loadNucleus(name); }}
        openState={{ open: openByView[''] ?? {}, onOpenChange: (key, open) => setOpen('', key, open) }}
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
