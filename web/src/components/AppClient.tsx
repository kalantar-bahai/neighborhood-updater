'use client';

import { useState, useEffect } from 'react';
import { InitialData, NucleusDetail, Role } from '@/types';
import Picker from './Picker';
import DetailView from './DetailView';
import AccessPanel from './AccessPanel';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

export default function AppClient() {
  const [initialData, setInitialData] = useState<InitialData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<NucleusDetail | null>(null);
  const [selectedNucleus, setSelectedNucleus] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  useEffect(() => {
    fetch('/api/initial-data')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setInitialData(data);
        if (data.rows.length === 1) loadNucleus(data.rows[0].nucleus);
      })
      .catch(() => setError('Failed to load. Please refresh.'));
  }, []);

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
    const roleMap = initialData.access.roleMap;
    const role: Role = (roleMap[norm(selectedNucleus)] ?? roleMap['*'] ?? 'read') as Role;
    return (
      <DetailView
        detail={detail}
        role={role}
        roleMap={initialData.access.roleMap}
        email={initialData.email}
        showBack={initialData.rows.length > 1}
        spreadsheetUrl={initialData.spreadsheetUrl}
        onBack={handleBack}
        onSaved={() => {}}
      />
    );
  }

  const roleMap = initialData.access.roleMap;
  const isGlobalAdmin = roleMap['*'] === 'admin' || roleMap['*'] === 'collaborator';

  return (
    <>
      <Picker
        rows={initialData.rows}
        email={initialData.email}
        srpNames={initialData.srpNames}
        onSelect={loadNucleus}
        onSignOut={() => window.location.href = '/signout'}
      />
      {isGlobalAdmin && (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px 32px' }}>
          <div className="card">
            <div
              className="card-header"
              onClick={() => setAccessOpen(o => !o)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <span style={{ fontSize: 11, marginRight: 6 }}>{accessOpen ? '▼' : '▶'}</span>Manage Access
            </div>
            {accessOpen && (
              <div className="card-body">
                <AccessPanel roleMap={roleMap} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
