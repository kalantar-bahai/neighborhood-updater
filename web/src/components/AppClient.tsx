'use client';

import { useState, useEffect } from 'react';
import { InitialData, NucleusDetail } from '@/types';
import type { PermissionSet } from '@/lib/access';
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
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);

  function loadInitialData() {
    fetch('/api/initial-data')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setInitialData(data);
        if (data.rows.length === 1) loadNucleus(data.rows[0].nucleus);
      })
      .catch(() => setError('Failed to load. Please refresh.'));
  }

  useEffect(() => { loadInitialData(); }, []);

  function loadNucleus(name: string) {
    setLoadingDetail(true);
    setSelectedNucleus(name);
    setDetail(null);
    fetch(`/api/nucleus?name=${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setDetail(data);
      })
      .catch(() => setError('Failed to load nucleus.'))
      .finally(() => setLoadingDetail(false));
  }

  function handleBack() {
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
    const permissions = initialData.access.permissions[norm(selectedNucleus)] ?? NO_ACCESS;
    return (
      <DetailView
        detail={detail}
        permissions={permissions}
        email={initialData.email}
        showBack={initialData.rows.length > 1}
        onBack={handleBack}
        onSaved={() => {}}
        allNucleusNames={initialData.rows.map(r => r.nucleus)}
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
      {/* The bottom-of-page by-nucleus-type summary cards (Neighborhood/Network/
          Population) are gone, 2026-10-08 -- every bar in Picker's own hierarchy
          (cluster, locality) now carries its own activities/participants/FoF
          rollup, making a separate by-type summary redundant. */}
      <Picker
        rows={initialData.rows}
        email={initialData.email}
        onSelect={loadNucleus}
        onSignOut={() => window.location.href = '/signout'}
        onAdd={canCreateNucleus ? () => setCreatingNew(true) : undefined}
      />

      {creatingNew && (
        <CreateNucleusModal
          clusterNames={initialData.clusterNames}
          onClose={() => setCreatingNew(false)}
          onCreated={(name) => { setCreatingNew(false); loadNucleus(name); }}
        />
      )}
    </>
  );
}
