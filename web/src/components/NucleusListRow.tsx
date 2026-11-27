'use client';

import React from 'react';
import { NucleusSummary } from '@/types';
import SrpBadge from './SrpBadge';

export function typeBadgeStyle(nucleusType: string): React.CSSProperties {
  const t = (nucleusType || '').toLowerCase();
  if (t === 'neighborhood') return { background: '#bee3f8', color: '#2c5282' };
  if (t === 'network')      return { background: '#c6f6d5', color: '#276749' };
  if (t === 'population')   return { background: '#e9d8fd', color: '#553c9a' };
  return {};
}

// One nucleus in a list: name, locality, stage and SRP badges. A tap opens the nucleus.
export default function NucleusListRow({ r, isPocket, onSelect }: {
  r: NucleusSummary;
  isPocket: boolean;
  onSelect: (name: string) => void;
}) {
  return (
    <div className={`picker-item${isPocket ? ' pocket-item' : ''}`} onClick={() => onSelect(r.nucleus)}>
      <div>
        <div className="name">{r.nucleus}</div>
        <div className="sub">{r.locality}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {r.stage && <span className="stage-badge" style={typeBadgeStyle(r.nucleusType)}>{r.stage}</span>}
        <SrpBadge state={r.srpState} action={r.srpAction ?? undefined} />
      </div>
    </div>
  );
}
