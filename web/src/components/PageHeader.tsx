'use client';

// The title row shared by the home page ("My Nuclei") and the Admin page, so both read as one app:
// the title on the left, then the page's own buttons (Home, + Add, Admin) and always My account and Sign out.
const PRIMARY: React.CSSProperties = { fontSize: 12, color: '#2b6cb0', background: '#ebf4ff', border: '1px solid #bee3f8', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 };
const PLAIN: React.CSSProperties = { fontSize: 12, color: '#718096', background: 'none', border: '1px solid #cbd5e0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' };

export function HeaderButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} style={PRIMARY}>{children}</button>;
}

export default function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <div className="picker-title">{title}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {children}
          <button type="button" onClick={() => { window.location.href = '/account'; }} style={PLAIN}>My account</button>
          <button type="button" onClick={() => { window.location.href = '/signout'; }} style={PLAIN}>Sign out</button>
        </div>
      </div>
      {sub !== undefined && <div className="picker-sub">{sub}</div>}
    </>
  );
}
