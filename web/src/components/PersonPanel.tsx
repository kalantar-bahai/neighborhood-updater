import type { PersonDetails } from '@/lib/clusterNotebook';
import { detailsView, initials, type DetailsView } from '@/lib/people';

// Today's local date as YYYY-MM-DD, to compare with SRP's ISO dates.
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function personDetailsView(details: PersonDetails): DetailsView {
  return detailsView(details, localToday());
}

// Where a panel's SRP details stand. null shows nothing at all (the People card stays silent on a 404).
export type DetailsState = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; view: DetailsView } | null;

// One person, the same on the People card and the admin Roles card: a header (avatar, name, "Age 34 ·
// Registered", `action` on the right), their SRP details, then the caller's sections
// (`children`, each a .pd-section). With `onHeaderClick` the header sticks to the top of a scrolling list
// and a click on it closes the panel (owner, 2026-11-21).
export function PersonPanel({ name, nameExtra, details, action, onHeaderClick, children }: {
  name: string; nameExtra?: React.ReactNode; details: DetailsState; action?: React.ReactNode;
  onHeaderClick?: () => void; children?: React.ReactNode;
}) {
  const summary = details?.status === 'ready' && details.view.inSrp ? details.view.summary : null;
  return (
    <div className="pd-panel">
      <div className={`pd-header${onHeaderClick ? ' pd-header-sticky' : ''}`} onClick={onHeaderClick}>
        <div className="pd-avatar" aria-hidden="true">{initials(name)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1, minWidth: 0 }}>
          <div className="pd-name">{name}{nameExtra}</div>
          {summary && <div className="pd-summary">{summary}</div>}
        </div>
        {action}
      </div>
      {details?.status === 'loading' && <div className="pd-muted">Loading…</div>}
      {details?.status === 'error' && <div style={{ fontSize: 13, color: '#c53030' }}>{details.error}</div>}
      {details?.status === 'ready' && <PersonDetailsBlock view={details.view} />}
      {children}
    </div>
  );
}

const CHECK_ICON = {
  ok: <path d="M5 12l5 5 9-10" />,
  danger: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></>,
};

// A person's SRP details under the PersonPanel header: check pills, then contact (each phone and email its
// own tappable line).
function PersonDetailsBlock({ view }: { view: DetailsView }) {
  if (!view.inSrp) return <div className="pd-muted">Not in SRP; nothing synced</div>;
  if (view.empty) return <div className="pd-muted">Nothing recorded in SRP</div>;
  const hasContact = view.phones.length > 0 || view.emails.length > 0 || view.address !== null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {view.checks.length > 0 && (
        <div className="pd-pills">
          {view.checks.map(c => (
            <span key={c.text} className={`pd-pill ${c.tone}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{CHECK_ICON[c.tone]}</svg>
              {c.text}
            </span>
          ))}
        </div>
      )}
      {hasContact && (
        <dl className="pd-contact">
          {view.phones.length > 0 && (
            <>
              <dt>Phone</dt>
              <dd>{view.phones.map(p => <a key={p} href={`tel:${p.replace(/[^\d+]/g, '')}`}>{p}</a>)}</dd>
            </>
          )}
          {view.emails.length > 0 && (
            <>
              <dt>Email</dt>
              <dd>{view.emails.map(e => <a key={e} href={`mailto:${e}`}>{e}</a>)}</dd>
            </>
          )}
          {view.address && (
            <>
              <dt>Address</dt>
              <dd>{view.address}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
