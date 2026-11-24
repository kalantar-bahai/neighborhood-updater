import Link from 'next/link';
import { UserProfile } from '@clerk/nextjs';

// Catch-all route ([[...account]]): <UserProfile /> with path routing needs its
// sub-pages (security, etc.) to resolve under /account/*.
export default function AccountPage() {
  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '16px 16px 40px' }}>
      <Link href="/" style={{ fontSize: 13, color: '#2b6cb0' }}>Home</Link>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
        <UserProfile path="/account" />
      </div>
    </div>
  );
}
