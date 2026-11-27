import type { HouseholdMove } from '@/lib/households';
import { hiddenText } from '@/lib/households';

// Shown above a Move button when the person lives in a household: in SRP the whole household moves together.
export function HouseholdMoveNote({ move, name }: { move: HouseholdMove; name: string }) {
  const hidden = hiddenText(move.hidden);
  return (
    <div style={{ border: '1px solid #fbd38d', background: '#fffaf0', borderRadius: 6, padding: 8, fontSize: 13, color: '#4a5568', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontWeight: 600, color: '#744210' }}>Their whole household moves with them</div>
      <div>In SRP a household always moves together. These people move too:</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {move.others.map((n, i) => <li key={i}>{n}</li>)}
        {hidden && <li>{hidden}</li>}
      </ul>
      <div>
        <button type="button" disabled style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, border: '1px solid #cbd5e0', background: 'white', color: '#a0aec0' }}>
          Move only {name}
        </button>
        <div style={{ fontSize: 12, marginTop: 2 }}>They would first leave the household. That comes with editing families.</div>
      </div>
    </div>
  );
}
