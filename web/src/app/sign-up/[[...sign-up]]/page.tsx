import Link from 'next/link';
import { SignUp } from '@clerk/nextjs';

// Where an invitation link lands (cluster-notebook sends Clerk this page as the invitation's redirect_url).
// The app is invite-only in Clerk, so <SignUp /> only completes for someone holding a valid invitation ticket;
// anyone else is told they need an invitation. Catch-all route so Clerk's sub-steps (sso-callback, verify, ...)
// resolve under /sign-up/*. Without this page an invitee landed on <SignIn />, whose Google button tried an
// ordinary sign-up and was refused ("New sign-ups are currently restricted."), 2026-11-24.
export default function SignUpPage() {
  return (
    <div className="signin-page">
      <div>
        <SignUp signInUrl="/sign-in" />
        {/* Google's OAuth verification checks that the sign-in flow itself links to both, 2026-10-09. */}
        <div className="signin-legal-links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}
