'use client';

import { useEffect, useRef, useState } from 'react';
import type { AccountInfo } from '@/lib/clusterNotebook';
import { accountLine, accountRemovedNote, activeAccountCount, findAccounts, removeAccessConfirm } from '@/lib/admin';
import { individualDisplayName } from '@/lib/personName';

// Row buttons are 44px tall so they are easy to hit on a phone.
const BTN: React.CSSProperties = { fontSize: 13, padding: '4px 12px', minHeight: 44, borderRadius: 6, cursor: 'pointer', border: '1px solid #cbd5e0', background: 'white', color: '#4a5568' };
const INPUT: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '6px 8px', border: '1px solid #a0aec0', borderRadius: 6 };
const DANGER: React.CSSProperties = { ...BTN, background: '#c53030', color: 'white', border: '1px solid #c53030' };

const SHOWN = 20;

// The inline "Remove access…" confirm, open on at most one row at a time.
type Confirm = { id: string; endRoles: boolean };

// Who can sign in, in one cluster (spec: admin page, Accounts card). The card is keyed by cluster in AdminClient,
// so switching cluster remounts it. `me` (from /api/admin/clusters) spots the caller's own row, which can't be
// removed. The login email is shown only on these rows; it is never written anywhere else.
export default function AccountsCard({ cluster, me }: { cluster: string; me: { id: string } | null }) {
  const [open, setOpen] = useState(true);
  const [accounts, setAccounts] = useState<AccountInfo[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  // Busy and error are per row (keyed by person id), so a reply always reports on its own row.
  const [busy, setBusy] = useState<Record<string, 'remove' | 'restore'>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  // Name or email search; the list shows at most SHOWN rows so it never grows without end.
  const [search, setSearch] = useState('');

  // Latest list read; an older read never overwrites a newer one.
  const readSeq = useRef(0);

  const reload = async () => {
    const seq = ++readSeq.current;
    try {
      const res = await fetch(`/api/admin/accounts?cluster=${encodeURIComponent(cluster)}`);
      const data = await res.json();
      if (seq !== readSeq.current) return;
      if (!res.ok || data.error) { setLoadError(data.error || "Couldn't load accounts."); return; }
      setLoadError(''); setAccounts(data.accounts);
    } catch {
      if (seq === readSeq.current) setLoadError("Couldn't load accounts. Please try again.");
    }
  };

  useEffect(() => {
    let live = true;
    const seq = ++readSeq.current;
    fetch(`/api/admin/accounts?cluster=${encodeURIComponent(cluster)}`)
      .then(async res => {
        const data = await res.json();
        if (!live || seq !== readSeq.current) return;
        if (!res.ok || data.error) { setLoadError(data.error || "Couldn't load accounts."); return; }
        setAccounts(data.accounts);
      })
      .catch(() => { if (live && seq === readSeq.current) setLoadError("Couldn't load accounts. Please try again."); });
    return () => { live = false; };
  }, [cluster]);

  const setBusyFor = (id: string, what: 'remove' | 'restore' | null) =>
    setBusy(b => { const n = { ...b }; if (what) n[id] = what; else delete n[id]; return n; });
  const setErrorFor = (id: string, text: string) =>
    setRowErrors(e => { const n = { ...e }; if (text) n[id] = text; else delete n[id]; return n; });

  const remove = async (a: AccountInfo, endRoles: boolean) => {
    const id = a.individual.id;
    if (busy[id]) return;
    setBusyFor(id, 'remove'); setErrorFor(id, '');
    let failure = '';
    let reread = true;
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster, individualId: id, endRoles }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) { failure = data.error || "Couldn't remove access."; reread = false; }
      // false: the person has no enabled account any more (removed meanwhile); the list is out of date.
      else if (data.removed === false) failure = 'No active login to remove.';
    } catch {
      failure = "Couldn't remove access. Please try again.";
      reread = false;
    }
    if (failure) setErrorFor(id, failure);
    if (reread) { setConfirm(c => (c?.id === id ? null : c)); await reload(); }
    setBusyFor(id, null);
  };

  const restore = async (a: AccountInfo) => {
    const id = a.individual.id;
    if (busy[id]) return;
    setBusyFor(id, 'restore'); setErrorFor(id, '');
    let failure = '';
    let reread = true;
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster, individualId: id, action: 'restore' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) { failure = data.error || "Couldn't restore access."; reread = false; }
      // false: there is no disabled login any more (restored meanwhile, or replaced); the list is out of date.
      else if (data.restored === false) failure = 'No removed login to restore.';
    } catch {
      failure = "Couldn't restore access. Please try again.";
      reread = false;
    }
    if (failure) setErrorFor(id, failure);
    if (reread) await reload();
    setBusyFor(id, null);
  };

  const confirmView = (a: AccountInfo, c: Confirm) => {
    const id = a.individual.id;
    const rowBusy = !!busy[id];
    return (
      <div style={{ marginTop: 8, padding: 10, border: '1px solid #fed7d7', borderRadius: 6, background: '#fff5f5', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {removeAccessConfirm(individualDisplayName(a.individual))}
        </div>
        <label style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
          <input type="checkbox" checked={c.endRoles} disabled={rowBusy}
            onChange={e => setConfirm({ id, endRoles: e.target.checked })} style={{ width: 20, height: 20 }} />
          Also end their roles
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" disabled={rowBusy} onClick={() => setConfirm(null)} style={BTN}>Cancel</button>
          <button type="button" disabled={rowBusy} onClick={() => remove(a, c.endRoles)}
            style={{ ...DANGER, opacity: rowBusy ? 0.5 : 1 }}>
            {busy[id] === 'remove' ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    );
  };

  const found = accounts && accounts.length > 0 ? findAccounts(accounts, search, SHOWN) : null;
  const title = accounts ? `Accounts (${activeAccountCount(accounts)})` : 'Accounts';

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <span><span style={{ fontSize: 11, marginRight: 6 }}>{open ? '▼' : '▶'}</span>{title}</span>
      </div>
      {open && (
        <div className="card-body">
          {loadError && <div style={{ color: '#c53030', fontSize: 13 }}>{loadError}</div>}
          {!accounts && !loadError && <div style={{ fontSize: 12, color: '#718096' }}>Loading…</div>}
          {accounts && accounts.length === 0 && <div style={{ fontSize: 13, color: '#718096' }}>No accounts in this cluster.</div>}
          {accounts && accounts.length > 0 && (
            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email…" aria-label="Search accounts" style={{ ...INPUT, marginBottom: 6 }} />
          )}
          {found && found.matched === 0 && <div style={{ fontSize: 13, color: '#718096' }}>No accounts match.</div>}
          {found && found.matched > found.shown.length && (
            <div style={{ fontSize: 12, color: '#718096' }}>Showing {found.shown.length} of {found.matched}. Search to find others.</div>
          )}
          {found && found.shown.map(a => {
            const id = a.individual.id;
            const rowBusy = !!busy[id];
            const removed = accountRemovedNote(a);
            // Confirmed with cluster-notebook 2026-11-24: removeAccess on yourself throws SELF_LOCKOUT, so your own
            // row has no "Remove access…". Without `me` every row shows it and the backend still refuses.
            const isSelf = id === me?.id;
            // Confirmed with cluster-notebook 2026-11-24: at most one account per person (replace re-points it), so rows key by individual.id.
            return (
              <div key={id} style={{ padding: '8px 0', borderTop: '1px solid #edf2f7' }}>
                <div style={{ fontSize: 14, color: removed ? '#a0aec0' : undefined }}>
                  {accountLine(a)}
                  {removed && <span style={{ fontSize: 13, fontStyle: 'italic' }}> · {removed}</span>}
                </div>
                {removed ? (
                  <div style={{ marginTop: 6 }}>
                    <button type="button" disabled={rowBusy} onClick={() => restore(a)} style={BTN}>
                      {busy[id] === 'restore' ? 'Restoring…' : 'Restore access'}
                    </button>
                  </div>
                ) : isSelf ? null : confirm?.id === id ? confirmView(a, confirm) : (
                  <div style={{ marginTop: 6 }}>
                    <button type="button" disabled={rowBusy} onClick={() => { setErrorFor(id, ''); setConfirm({ id, endRoles: false }); }} style={BTN}>
                      Remove access…
                    </button>
                  </div>
                )}
                {rowErrors[id] && <div style={{ color: '#c53030', fontSize: 13, marginTop: 6 }}>{rowErrors[id]}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
