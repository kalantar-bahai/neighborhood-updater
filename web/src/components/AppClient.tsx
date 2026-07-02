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
  const [creatingNew, setCreatingNew] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

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

  if (creatingNew) {
    const emptyDetail: NucleusDetail = {
      row: {
        nucleus: '', parentNucleus: '', nucleusType: '', grouping: 'NC Eastern', cluster: 'Triangle',
        pg: 'M3', clusterCode: 'NC-215', locality: '', stage: '', contact: '', email: '',
        auxBoard: '', makeup: '', totalPop: '', totalHH: '', indNum: '', indPct: '',
        hhNum: '', hhPct: '',
        activities: {
          ccs:         { act: '', part: '', fof: '' },
          jygs:        { act: '', part: '', fof: '' },
          scs:         { act: '', part: '', fof: '' },
          devotionals: { act: '', part: '', fof: '' },
        },
        protagonists: '', accompaniers: '', level: '', notesPrevalence: '',
        supported: '', notesSupported: '', presence: '', notesPresence: '',
        involved: '', notesInvolved: '', efforts: '', notesEfforts: '',
        gatherings: '', notesGatherings: '', narrative: '',
      },
      srp: null,
      accompanierNames: [],
      protagonistNames: [],
      abmAssistantNames: [],
    };
    return (
      <DetailView
        detail={emptyDetail}
        role="admin"
        roleMap={initialData.access.roleMap}
        email={initialData.email}
        showBack={false}
        spreadsheetUrl={initialData.spreadsheetUrl}
        onBack={() => setCreatingNew(false)}
        onSaved={() => {}}
        isNew
        onCreated={(name) => { setCreatingNew(false); loadNucleus(name); }}
      />
    );
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

  const TYPE_META: Record<string, { label: string; bg: string; color: string; border: string }> = {
    neighborhood: { label: 'Neighborhood', bg: '#bee3f8', color: '#2c5282', border: '#90cdf4' },
    network:      { label: 'Network',      bg: '#c6f6d5', color: '#276749', border: '#9ae6b4' },
    population:   { label: 'Population',   bg: '#e9d8fd', color: '#553c9a', border: '#d6bcfa' },
  };

  const typeTotals = initialData.rows.reduce<Record<string, { act: number; part: number; fof: number; count: number }>>((acc, r) => {
    const key = (r.nucleusType || '').toLowerCase().trim() || 'neighborhood';
    if (!acc[key]) acc[key] = { act: 0, part: 0, fof: 0, count: 0 };
    acc[key].act   += r.totalAct  || 0;
    acc[key].part  += r.totalPart || 0;
    acc[key].fof   += r.totalFof  || 0;
    acc[key].count += 1;
    return acc;
  }, {});
const typeSummaries = (['neighborhood', 'network', 'population'] as const)
    .filter(key => key in typeTotals)
    .map(key => [key, typeTotals[key]] as const);

  return (
    <>
      <Picker
        rows={initialData.rows}
        email={initialData.email}
        srpNames={initialData.srpNames}
        onSelect={loadNucleus}
        onSignOut={() => window.location.href = '/signout'}
        onAdd={isGlobalAdmin ? () => setCreatingNew(true) : undefined}
      />
      {typeSummaries.length > 0 && (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px 24px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {typeSummaries.map(([key, s]) => {
            const meta = TYPE_META[key];
            return (
              <div key={key} className="card" style={{ flex: '1 1 200px', margin: 0 }}>
                <div className="card-header" style={{ background: meta.bg, color: meta.color, borderBottom: `1px solid ${meta.border}` }}>
                  {meta.label}
                </div>
                <div className="card-body" style={{ fontSize: 13 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px' }}>
                    <span style={{ color: '#718096', textAlign: 'right' }}>Nuclei</span>       <span style={{ fontWeight: 600 }}>{s.count}</span>
                    <span style={{ color: '#718096', textAlign: 'right' }}>Activities</span>   <span style={{ fontWeight: 600 }}>{s.act}</span>
                    <span style={{ color: '#718096', textAlign: 'right' }}>Participants</span> <span style={{ fontWeight: 600 }}>{s.part}</span>
                    <span style={{ color: '#718096', textAlign: 'right' }}>Friends of the Faith</span> <span style={{ fontWeight: 600 }}>{s.fof}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isGlobalAdmin && (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px 32px' }}>
          <div className="card">
            <div
              className="card-header"
              onClick={() => setAccessOpen(o => !o)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <span><span style={{ fontSize: 11, marginRight: 6 }}>{accessOpen ? '▼' : '▶'}</span>Manage Access</span>
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
