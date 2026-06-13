import { auth, signIn } from '@/auth';
import AppClient from '@/components/AppClient';

export default async function Home() {
  const session = await auth();

  if (!session) {
    return (
      <div className="signin-page">
        <div className="signin-card">
          <h1>Neighborhood Coordinator</h1>
          <p>Sign in with your Google account to view and update your neighborhood data.</p>
          <form action={async () => { 'use server'; await signIn('google'); }}>
            <button type="submit" className="signin-btn">Sign in with Google</button>
          </form>
        </div>
      </div>
    );
  }

  return <AppClient />;
}
