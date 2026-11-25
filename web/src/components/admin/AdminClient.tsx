'use client';

import { useState, useEffect, useRef } from 'react';
import PageHeader, { HeaderButton } from '../PageHeader';
import RolesCard from './RolesCard';
import HiddenCard from './HiddenCard';
import NotInSrpCard from './NotInSrpCard';
import InviteCard, { type InviteHandle } from './InviteCard';
import NoAccountCard from './NoAccountCard';
import AccountsCard from './AccountsCard';
import LogCard from './LogCard';

interface AdminCluster { id: string; name: string }

type State =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; clusters: AdminCluster[]; me: { id: string } | null };

const TITLE = 'My Nuclei – Admin';
const goHome = () => { window.location.href = '/'; };

// The title row, as on the home page, with Home in place of + Add and Admin.
function Header({ sub }: { sub?: string }) {
  return (
    <PageHeader title={TITLE} sub={sub}>
      <HeaderButton onClick={goHome}>Home</HeaderButton>
    </PageHeader>
  );
}

export default function AdminClient() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  // Open clusters, by name. Like the home page: one cluster is always open (no twisty); with several, each opens on
  // its own and starts closed. A closed cluster's cards unmount, which clears any picked person or open form.
  const [openClusters, setOpenClusters] = useState<Set<string>>(new Set());

  // Each cluster's Invite card, so Invite… on the No account yet card can fill it in; and a counter per cluster that
  // goes up when an invitation is sent, so the No account yet card re-reads.
  const inviteRefs = useRef(new Map<string, InviteHandle | null>());
  const [versions, setVersions] = useState<Record<string, number>>({});
  const bump = (name: string) => setVersions(v => ({ ...v, [name]: (v[name] ?? 0) + 1 }));

  useEffect(() => {
    fetch('/api/admin/clusters')
      .then(async r => {
        if (r.status === 403) { setState({ kind: 'denied' }); return; }
        const data = await r.json();
        if (!r.ok || data.error) { setState({ kind: 'error', message: data.error || 'Failed to load.' }); return; }
        const clusters: AdminCluster[] = data.clusters;
        if (clusters.length === 0) { setState({ kind: 'denied' }); return; }
        // me is null when cluster-notebook couldn't say who the caller is; the Accounts card then can't spot their own row.
        setState({ kind: 'ready', clusters, me: data.me ?? null });
      })
      .catch(() => setState({ kind: 'error', message: 'Failed to load. Please refresh.' }));
  }, []);

  const toggle = (name: string) =>
    setOpenClusters(prev => { const s = new Set(prev); if (s.has(name)) s.delete(name); else s.add(name); return s; });

  if (state.kind === 'loading') return <div className="loading-state">Loading...</div>;

  if (state.kind === 'denied') {
    return (
      <div className="picker-container">
        <Header />
        <p style={{ marginTop: 16 }}>Access denied</p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="picker-container">
        <Header />
        <p style={{ color: '#c53030', marginTop: 16 }}>{state.message}</p>
      </div>
    );
  }

  const single = state.clusters.length === 1;
  return (
    <div className="picker-container" style={{ paddingBottom: 40 }}>
      <Header sub="Invitations, accounts, roles and hidden people" />
      {state.clusters.map(c => {
        const isOpen = single || openClusters.has(c.name);
        return (
          <div key={c.id}>
            <div className="cluster-header" onClick={single ? undefined : () => toggle(c.name)}
              style={single ? { cursor: 'default' } : undefined}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!single && <span className={`cluster-arrow${isOpen ? ' open' : ''}`}>▶</span>}
                <span className="cluster-name">{c.name}</span>
              </div>
            </div>
            {/* Cards are keyed by cluster, so each cluster has its own. */}
            {isOpen && (
              <div className="cluster-rows open" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6, marginBottom: 16 }}>
                <InviteCard key={`invite:${c.name}`} cluster={c.name} ref={h => { inviteRefs.current.set(c.name, h); }} onInvitationsChanged={() => bump(c.name)} />
                <NoAccountCard key={`noaccount:${c.name}`} cluster={c.name} version={versions[c.name] ?? 0}
                  onInvite={p => inviteRefs.current.get(c.name)?.start(p)} />
                <AccountsCard key={`accounts:${c.name}`} cluster={c.name} me={state.me} />
                <RolesCard key={`roles:${c.name}`} cluster={c.name} />
                <HiddenCard key={`hidden:${c.name}`} cluster={c.name} />
                <NotInSrpCard key={`notinsrp:${c.name}`} cluster={c.name} />
                <LogCard key={`log:${c.name}`} cluster={c.name} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
