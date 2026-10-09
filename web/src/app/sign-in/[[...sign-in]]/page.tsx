import Link from 'next/link';
import { SignIn } from '@clerk/nextjs';

// Catch-all route ([[...sign-in]]): Clerk's <SignIn /> component needs every
// sub-step (factor-one, sso-callback, etc.) to resolve under /sign-in/*.
export default function SignInPage() {
  return (
    <div className="signin-page">
      <div>
        <SignIn />
        {/* Google's OAuth verification checks that the sign-in flow itself links to
            both, not just that the URLs exist somewhere, 2026-10-09. */}
        <div className="signin-legal-links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}
