import type { PersonDetails } from '@/lib/clusterNotebook';
import { detailLines, detailsView } from '@/lib/people';

// Today's local date as YYYY-MM-DD, to compare with SRP's ISO dates.
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A person's SRP details, shared by the People card and the admin Roles card.
export default function PersonDetailsBlock({ details }: { details: PersonDetails }) {
  const v = detailsView(details, localToday());
  let body: React.ReactNode;
  if (!v.inSrp) {
    body = <div style={{ fontSize: 13, color: '#718096' }}>Not in SRP; nothing synced</div>;
  } else {
    const { lines, comments } = detailLines(v);
    body = (
      <>
        {lines.map((parts, i) => (
          <div key={i} style={{ fontSize: 13 }}>
            {parts.map((p, j) => (
              <span key={j}>
                {j > 0 && ' · '}
                <span style={p.danger ? { color: '#c53030' } : undefined}>{p.text}</span>
              </span>
            ))}
          </div>
        ))}
        {comments && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>SRP comments: {comments}</div>}
      </>
    );
  }
  return (
    <div style={{ padding: '6px 0 2px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#4a5568' }}>Details</div>
      {body}
    </div>
  );
}
