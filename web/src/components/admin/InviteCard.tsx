'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminPerson, Invitation, RoleHolding } from '@/lib/clusterNotebook';
import { adminPersonLine, adminPersonTag, currentRolesLine, cancelInvitationConfirm, invitationLine, invitationStatusWord, inviteRequestBody, prefillEmail } from '@/lib/admin';
import PersonFinder from './PersonFinder';
import PlaceRolePicker, { type PlaceRole } from './PlaceRolePicker';

const BTN: React.CSSProperties = { fontSize: 13, padding: '4px 10px', minHeight: 44, borderRadius: 6, cursor: 'pointer', border: '1px solid #cbd5e0', background: 'white', color: '#4a5568' };
const PRIMARY: React.CSSProperties = { ...BTN, background: '#3182ce', color: 'white', border: '1px solid #3182ce' };
const INPUT: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '6px 8px', border: '1px solid #a0aec0', borderRadius: 6 };
const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#4a5568', display: 'flex', flexDirection: 'column', gap: 4 };
const TAG: React.CSSProperties = { fontSize: 11, color: '#4a5568', background: '#edf2f7', borderRadius: 8, padding: '1px 6px', whiteSpace: 'nowrap' };

// The invite form for one picked person. `seq` changes on every pick and keys the PlaceRolePicker so it resets.
// `roles` is what the person already holds (null until loaded); an invitation never removes them.
type Form = {
  person: AdminPerson; seq: number; email: string; value: PlaceRole | 'none' | null; days: string;
  roles: RoleHolding[] | null;
};
// An invite error in words; offerReplace after 409 ALREADY_HAS_ACCESS ("{name} already has access.") shows "Replace their login?".
type Outcome = { text: string; offerReplace: boolean } | null;

// Invite a person by email, optionally with a role, and list this cluster's invitations (spec: admin page,
// Invite card). The card is keyed by cluster in AdminClient, so switching cluster remounts it and clears the form.
// The login email is shown and sent only here; it is never written anywhere else.
export default function InviteCard({ cluster }: { cluster: string }) {
  const [open, setOpen] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  // "Invitation sent to {email}." Kept after the form closes, until the next pick.
  const [sent, setSent] = useState('');

  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<Record<string, 'resend' | 'cancel'>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // The pick now showing. A details or invite reply for an earlier pick is dropped, so A's email never lands on B.
  const pickSeq = useRef(0);
  // Whether the admin has typed in Email since this pick; the prefill then never overwrites their text.
  const emailTyped = useRef(false);
  // Latest list read; an older read never overwrites a newer one.
  const readSeq = useRef(0);

  const loadInvitations = async (seq: number) => {
    try {
      const res = await fetch(`/api/admin/invitations?cluster=${encodeURIComponent(cluster)}`);
      const data = await res.json();
      if (seq !== readSeq.current) return;
      if (!res.ok || data.error) { setLoadError(data.error || "Couldn't load invitations."); return; }
      setLoadError(''); setInvitations(data.invitations);
    } catch {
      if (seq === readSeq.current) setLoadError("Couldn't load invitations. Please try again.");
    }
  };
  const reload = () => loadInvitations(++readSeq.current);

  useEffect(() => {
    let live = true;
    const seq = ++readSeq.current;
    fetch(`/api/admin/invitations?cluster=${encodeURIComponent(cluster)}`)
      .then(async res => {
        const data = await res.json();
        if (!live || seq !== readSeq.current) return;
        if (!res.ok || data.error) { setLoadError(data.error || "Couldn't load invitations."); return; }
        setInvitations(data.invitations);
      })
      .catch(() => { if (live && seq === readSeq.current) setLoadError("Couldn't load invitations. Please try again."); });
    return () => { live = false; };
  }, [cluster]);

  const pick = async (p: AdminPerson) => {
    const seq = ++pickSeq.current;
    emailTyped.current = false;
    // The email is replaced on every pick: empty now, then the person's first SRP email if they have one.
    setForm({ person: p, seq, email: '', value: 'none', days: '30', roles: null });
    setOutcome(null); setSent(''); setSending(false);
    try {
      const res = await fetch(`/api/admin/person?id=${encodeURIComponent(p.individual.id)}`);
      const data = await res.json();
      if (pickSeq.current !== seq || !res.ok || data.error) return;
      const roles: RoleHolding[] = data.roles ?? [];
      // The prefill never overwrites what the admin has typed since this pick.
      setForm(f => f && f.seq === seq
        ? { ...f, roles, email: emailTyped.current ? f.email : prefillEmail(data.details) }
        : f);
    } catch {
      // No prefill and no roles line; the field stays empty and editable.
    }
  };

  const changePerson = () => { pickSeq.current++; setForm(null); setOutcome(null); setSending(false); };

  // Any edit withdraws a stale "Replace their login?" offer, so a replace always re-sends what the admin last saw.
  const edit = (patch: Partial<Form>) => { setForm(f => f && { ...f, ...patch }); setOutcome(null); };

  const invite = async (replaceExisting: boolean) => {
    if (!form || form.value === null || sending) return;
    const { seq, email } = form;
    setSending(true); setOutcome(null); setSent('');
    let failure: Outcome = null;
    try {
      const res = await fetch('/api/admin/invitations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteRequestBody({
          cluster, individualId: form.person.individual.id, email, value: form.value, expiresInDays: form.days, replaceExisting,
        })),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        failure = { text: data.error || "Couldn't send the invitation.", offerReplace: data.code === 'ALREADY_HAS_ACCESS' };
      }
    } catch {
      failure = { text: "Couldn't send the invitation. Please try again.", offerReplace: false };
    }
    if (pickSeq.current !== seq) return;
    setSending(false);
    if (failure) { setOutcome(failure); return; }
    pickSeq.current++;
    setForm(null); setSent(`Invitation sent to ${email.trim()}.`);
    void reload();
  };

  const setBusyFor = (id: string, what: 'resend' | 'cancel' | null) =>
    setBusy(b => { const n = { ...b }; if (what) n[id] = what; else delete n[id]; return n; });
  const setErrorFor = (id: string, text: string) =>
    setRowErrors(e => { const n = { ...e }; if (text) n[id] = text; else delete n[id]; return n; });

  const act = async (i: Invitation, action: 'resend' | 'cancel') => {
    if (busy[i.id]) return;
    if (action === 'cancel' && !window.confirm(cancelInvitationConfirm(i.email))) return;
    setBusyFor(i.id, action); setErrorFor(i.id, '');
    let failure = '';
    let reread = true;
    try {
      const res = await fetch('/api/admin/invitations', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster, id: i.id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        failure = data.error || (action === 'resend' ? "Couldn't resend the invitation." : "Couldn't cancel the invitation.");
        // NOT_PENDING: it was accepted or expired meanwhile, so the list is out of date; re-read it.
        reread = data.code === 'NOT_PENDING';
      }
    } catch {
      failure = action === 'resend' ? "Couldn't resend the invitation. Please try again." : "Couldn't cancel the invitation. Please try again.";
      reread = false;
    }
    if (failure) setErrorFor(i.id, failure);
    if (reread) await reload();
    setBusyFor(i.id, null);
  };

  const formView = (f: Form) => {
    const tag = adminPersonTag(f.person);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>{adminPersonLine(f.person)}</strong>
            {tag && <span style={TAG}>{tag}</span>}
          </span>
          <button type="button" disabled={sending} onClick={changePerson} style={BTN}>Change person</button>
        </div>
        {f.roles && <div style={{ fontSize: 13, color: '#4a5568' }}>{currentRolesLine(f.roles)}</div>}
        <label style={LABEL}>
          Email
          <input type="email" value={f.email} autoComplete="off"
            onChange={e => { emailTyped.current = true; edit({ email: e.target.value }); }} style={INPUT} />
        </label>
        <PlaceRolePicker key={f.seq} cluster={cluster} optional onChange={v => edit({ value: v })} />
        <label style={LABEL}>
          Expires in (days)
          <input type="number" inputMode="numeric" min={1} max={90} value={f.days}
            onChange={e => edit({ days: e.target.value })} style={{ ...INPUT, width: 120 }} />
        </label>
        <div>
          <button type="button" disabled={f.value === null || sending} onClick={() => invite(false)}
            style={{ ...PRIMARY, opacity: f.value === null || sending ? 0.5 : 1 }}>
            {sending ? 'Sending…' : 'Invite'}
          </button>
        </div>
        {outcome && (
          <div style={{ color: '#c53030', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{outcome.text}</span>
            {outcome.offerReplace && (
              <button type="button" disabled={sending || f.value === null} onClick={() => invite(true)} style={BTN}>Replace their login?</button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <span><span style={{ fontSize: 11, marginRight: 6 }}>{open ? '▼' : '▶'}</span>Invite</span>
      </div>
      {(
        <div className="card-body" style={{ display: open ? undefined : 'none' }}>
          {form ? formView(form) : <PersonFinder cluster={cluster} onPick={pick} />}
          {sent && <div style={{ color: '#276749', fontSize: 13, marginTop: 8 }}>{sent}</div>}

          <div style={{ fontSize: 14, fontWeight: 600, color: '#2d3748', marginTop: 16 }}>Invitations</div>
          {loadError && <div style={{ color: '#c53030', fontSize: 13 }}>{loadError}</div>}
          {!invitations && !loadError && <div style={{ fontSize: 12, color: '#718096' }}>Loading…</div>}
          {invitations && invitations.length === 0 && <div style={{ fontSize: 13, color: '#718096' }}>No invitations in this cluster.</div>}
          {invitations && invitations.map(i => {
            const rowBusy = !!busy[i.id];
            return (
              <div key={i.id} style={{ padding: '8px 0', borderTop: '1px solid #edf2f7' }}>
                <div style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>{invitationLine(i)}</span>
                  <span style={TAG}>{invitationStatusWord(i.status)}</span>
                </div>
                {i.status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button type="button" disabled={rowBusy} onClick={() => act(i, 'resend')} style={BTN}>{busy[i.id] === 'resend' ? 'Resending…' : 'Resend'}</button>
                    <button type="button" disabled={rowBusy} onClick={() => act(i, 'cancel')} style={BTN}>{busy[i.id] === 'cancel' ? 'Cancelling…' : 'Cancel'}</button>
                  </div>
                )}
                {rowErrors[i.id] && <div style={{ color: '#c53030', fontSize: 13, marginTop: 6 }}>{rowErrors[i.id]}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
