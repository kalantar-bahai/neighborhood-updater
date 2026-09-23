import { auth } from '@clerk/nextjs/server';
import { SignInButton } from '@clerk/nextjs';
import AppClient from '@/components/AppClient';

export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <div className="signin-page">
        <div className="signin-card">
          <h1>Nucleus Assistant</h1>
          <p>Sign in with your Google account to view and update your neighborhood data.</p>
          <SignInButton>
            <button className="signin-btn">Sign in with Google</button>
          </SignInButton>
        </div>
      </div>
    );
  }

  return <AppClient />;
}
