'use client';

import { useState, useEffect } from 'react';
import WorkerListModal from './WorkerListModal';
import type { RoleGrant } from '@/lib/clusterNotebook';
import type { Worker } from '@/types';

interface Props {
  nucleus: string;
}

// Real, human descriptions built from a role's actual PermissionSet, not just
// its bare name -- e.g. "ATC-Collaborator" alone tells a viewer nothing, but
// "can edit this nucleus's Type and Stage" does.
function describePermissions(p: RoleGrant['permissions']): string {
  const bits: string[] = [];
  if (p.canChangeIdentity) bits.push("can edit this nucleus's Type and Stage");
  else if (p.canWrite) bits.push('can edit day-to-day info, not Type/Stage');
  else bits.push('read-only');
  if (p.canDelete) bits.push('can delete this nucleus');
  if (p.canAssignRoles) bits.push('can assign roles to others');
  return bits.join(' · ');
}

export default function ManageAccessCard({ nucleus }: Props) {
  const [roles, setRoles] = useState<RoleGrant[] | null>(null);
  // loadError: the initial roles-list fetch has nothing else to show if it
  // fails, so it legitimately replaces the whole card. actionError: a failed
  // per-role "Manage" click must NOT hide the roles list (and its Manage
  // buttons) -- that would be the only way to retry, so it renders as an
  // inline message alongside the still-visible list instead.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openRole, setOpenRole] = useState<string | null>(null);
  const [openRoleWorkers, setOpenRoleWorkers] = useState<Worker[]>([]);
  const [loadingRole, setLoadingRole] = useState(false);

  useEffect(() => {
    fetch(`/api/roles?nucleus=${encodeURIComponent(nucleus)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setLoadError(data.error); return; }
        setRoles(data.roles);
      })
      .catch(() => setLoadError('Failed to load assignable roles.'));
  }, [nucleus]);

  // WorkerListModal takes its initial `workers` list as a prop -- it doesn't fetch
  // its own (matches how DetailView.tsx already uses it for the fixed worker-list
  // types). For an arbitrary recognized role, there's no pre-loaded list to hand
  // it, so this fetches the current holders via the same /api/workers GET used
  // everywhere else, then opens the modal with that as its starting state.
  async function openRoleModal(role: string) {
    setLoadingRole(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/workers?nucleus=${encodeURIComponent(nucleus)}&type=${encodeURIComponent(role)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load current holders');
      setOpenRoleWorkers(data.workers);
      setOpenRole(role);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to load current holders');
    } finally {
      setLoadingRole(false);
    }
  }

  if (loadError) return <div style={{ fontSize: 13, color: '#e53e3e', padding: '8px 0' }}>{loadError}</div>;
  if (!roles) return <div style={{ fontSize: 13, color: '#718096', padding: '8px 0' }}>Loading roles...</div>;
  if (roles.length === 0) return <div style={{ fontSize: 13, color: '#718096', padding: '8px 0' }}>No roles available to assign here.</div>;

  return (
    <div>
      {roles.map(r => (
        <div key={r.role} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{r.role}</div>
            <div style={{ fontSize: 12, color: '#718096' }}>{describePermissions(r.permissions)}</div>
          </div>
          <button
            onClick={() => void openRoleModal(r.role)}
            disabled={loadingRole}
            style={{ fontSize: 13, color: '#3182ce', background: 'none', border: '1px solid #bee3f8', borderRadius: 6, padding: '5px 12px', cursor: loadingRole ? 'default' : 'pointer', flexShrink: 0 }}
          >
            Manage
          </button>
        </div>
      ))}

      {actionError && <div style={{ fontSize: 13, color: '#e53e3e', padding: '8px 0' }}>{actionError}</div>}

      {openRole && (
        <WorkerListModal
          title={openRole}
          role={openRole}
          nucleus={nucleus}
          workers={openRoleWorkers}
          single={openRole === 'contact'}
          onChange={setOpenRoleWorkers}
          onClose={() => setOpenRole(null)}
        />
      )}
    </div>
  );
}
