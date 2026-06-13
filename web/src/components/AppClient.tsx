'use client';

import { useState, useEffect } from 'react';
import { InitialData, NeighborhoodDetail } from '@/types';
import Picker from './Picker';
import DetailView from './DetailView';

export default function AppClient() {
  const [initialData, setInitialData] = useState<InitialData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<NeighborhoodDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    fetch('/api/initial-data')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setInitialData(data);
        if (data.rows.length === 1) loadNeighborhood(data.rows[0].neighborhood);
      })
      .catch(() => setError('Failed to load. Please refresh.'));
  }, []);

  function loadNeighborhood(name: string) {
    setLoadingDetail(true);
    setDetail(null);
    fetch(`/api/neighborhood?name=${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setDetail(data);
      })
      .catch(() => setError('Failed to load neighborhood.'))
      .finally(() => setLoadingDetail(false));
  }

  function handleBack() {
    setDetail(null);
  }

  if (error) {
    return <div className="error-state">{error}</div>;
  }

  if (!initialData || loadingDetail) {
    return <div className="loading-state">Loading...</div>;
  }

  if (detail) {
    return (
      <DetailView
        detail={detail}
        email={initialData.email}
        showBack={initialData.rows.length > 1}
        onBack={handleBack}
        onSaved={() => {}}
      />
    );
  }

  return (
    <Picker
      rows={initialData.rows}
      email={initialData.email}
      srpNames={initialData.srpNames}
      onSelect={loadNeighborhood}
    />
  );
}
