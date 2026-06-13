import { signOut } from '@/auth';

export default function SignOutPage() {
  return (
    <div className="signin-page">
      <div className="signin-card">
        <h1>Sign out?</h1>
        <p>You will need to sign in again to access your neighborhoods.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/' }); }}>
            <button type="submit" className="signin-btn">Sign out</button>
          </form>
          <a href="/" style={{ textAlign: 'center', fontSize: 14, color: '#718096', textDecoration: 'none', padding: '8px 0' }}>
            Cancel
          </a>
        </div>
      </div>
    </div>
  );
}
