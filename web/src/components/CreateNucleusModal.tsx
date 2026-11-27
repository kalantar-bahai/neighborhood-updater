'use client';

import { useEffect, useRef, useState } from 'react';
import type { LocalityOption } from '@/lib/clusterNotebook';
import { createPayload, findNameClash } from '@/lib/srp';
import { presetLocalityId, type CreatePreset } from '@/lib/createPreset';

// A part the "+ Add" already filled in: shown, not editable.
const FIXED: React.CSSProperties = { padding: '6px 0', fontSize: 14, color: '#2d3748', fontWeight: 600 };

interface Props {
  clusterNames: string[];
  onClose: () => void;
  onCreated: (name: string) => void;
  // From a "+ Add" on a cluster, locality or parent: those parts are filled in and shown fixed (owner, 2026-11-27).
  preset?: CreatePreset;
}

// Only what createNucleus needs: name, cluster, a required locality and Create in SRP.
// Everything else -- population, activities, narrative, worker roles like
// Contact/Promoting/Helping/Accompanying/ABm Assistant -- can't be set until the
// nucleus exists in cluster-notebook anyway (those all query/mutate by nucleus
// name), so there's no point collecting them here. Once this succeeds we hand off
// to the normal DetailView for the newly created nucleus, where all of that works
// immediately, 2026-09-14.
export default function CreateNucleusModal({ clusterNames, onClose, onCreated, preset }: Props) {
  const [nucleus, setNucleus] = useState('');
  const [cluster, setCluster] = useState(preset?.cluster ?? '');
  // The chosen Locality's id: names may repeat across localities.
  const [localityId, setLocalityId] = useState('');
  const [localities, setLocalities] = useState<LocalityOption[]>([]);
  const [loadingLocalities, setLoadingLocalities] = useState(!!preset);
  const [localityError, setLocalityError] = useState('');
  const [createInSrp, setCreateInSrp] = useState(false);
  const latestCluster = useRef('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const selectedLocality = localities.find(l => l.id === localityId);
  const locality = selectedLocality?.name ?? '';
  const clash = findNameClash(nucleus, selectedLocality);
  const canCreate = nucleus.trim() !== '' && cluster.trim() !== '' && locality !== '' && !creating && !(createInSrp && clash);

  async function handleClusterChange(next: string) {
    setCluster(next);
    setLocalityId('');
    setLocalities([]);
    setCreateInSrp(false);
    setLocalityError('');
    latestCluster.current = next;
    if (!next) {
      setLoadingLocalities(false);
      return;
    }
    setLoadingLocalities(true);
    await loadLocalities(next);
  }

  // The cluster's localities; with a preset locality, that one chosen (when its name picks exactly one).
  async function loadLocalities(next: string, presetLocality?: string) {
    try {
      const res = await fetch(`/api/locations?cluster=${encodeURIComponent(next)}`);
      const data = await res.json();
      if (latestCluster.current !== next) return; // cluster changed again; stale response
      if (!res.ok) throw new Error(data.error || 'Could not load localities');
      const list: LocalityOption[] = data.localities ?? [];
      setLocalities(list);
      if (presetLocality) setLocalityId(presetLocalityId(list, presetLocality));
    } catch (e: unknown) {
      if (latestCluster.current !== next) return;
      setLocalityError(e instanceof Error ? e.message : String(e));
    }
    setLoadingLocalities(false);
  }

  // A preset cluster: load its localities straight away.
  useEffect(() => {
    if (!preset) return;
    latestCluster.current = preset.cluster;
    void loadLocalities(preset.cluster, preset.locality);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the preset the form opened with
  }, []);

  // The locality is fixed when the preset named one and it matched; otherwise the user picks.
  const localityFixed = !!preset?.locality && !!selectedLocality && selectedLocality.name === preset.locality;

  async function handleCreate() {
    if (!canCreate) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/nucleus', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData: createPayload({ name: nucleus, cluster, locality, localityId, createInSrp, parentId: preset?.parentId }) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      onCreated(nucleus.trim());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  }

  return (
    <div
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 12, padding: '20px 24px', maxWidth: 420, width: '100%' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#2d3748' }}>{preset?.parent ? 'New Child Neighborhood' : 'New Neighborhood'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#718096', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <div className="field" style={{ marginBottom: 12 }}>
          <label>Nucleus Name</label>
          <input
            type="text"
            value={nucleus}
            onChange={e => setNucleus(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); }}
            autoFocus
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>

        {locality && clash && (
          <div style={{ color: '#b7791f', fontSize: 13, marginBottom: 12 }}>
            ⚠ &quot;{clash}&quot; already exists in {locality}
          </div>
        )}

        {preset?.parent && (
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Parent Nucleus</label>
            <div style={FIXED}>{preset.parent}</div>
          </div>
        )}

        <div className="field" style={{ marginBottom: 12 }}>
          <label>Cluster</label>
          {preset ? <div style={FIXED}>{cluster}</div> : <select
            value={cluster}
            onChange={e => void handleClusterChange(e.target.value)}
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', background: 'white' }}
          >
            <option value="">Select a cluster…</option>
            {clusterNames.map(c => <option key={c} value={c}>{c}</option>)}
          </select>}
        </div>

        <div className="field" style={{ marginBottom: 12 }}>
          <label>Locality</label>
          {localityFixed ? <div style={FIXED}>{locality}</div> : <select
            value={localityId}
            disabled={loadingLocalities || !cluster}
            onChange={e => { setLocalityId(e.target.value); if (!e.target.value) setCreateInSrp(false); }}
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', background: 'white' }}
          >
            {loadingLocalities ? (
              <option value="">(loading…)</option>
            ) : (
              <>
                <option value="">Select a locality…</option>
                {localities.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </>
            )}
          </select>}
          {cluster && !loadingLocalities && !localityError && !locality && (
            <div style={{ fontSize: 12, color: '#718096', marginTop: 4 }}>Choose a locality for this neighborhood.</div>
          )}
          {localityError && <div style={{ color: '#e53e3e', fontSize: 13, marginTop: 4 }}>{localityError}</div>}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: locality ? '#2d3748' : '#a0aec0' }}>
            <input
              type="checkbox"
              checked={createInSrp}
              disabled={!locality}
              onChange={e => setCreateInSrp(e.target.checked)}
            />
            Create in SRP
          </label>
          {!locality && <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>Choose a locality to create this in SRP</div>}
        </div>

        {error && <div style={{ color: '#e53e3e', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ fontSize: 13, color: '#718096', background: 'none', border: '1px solid #cbd5e0', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            style={{ fontSize: 13, fontWeight: 600, color: 'white', background: canCreate ? '#2b6cb0' : '#a0aec0', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: canCreate ? 'pointer' : 'default' }}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
