import { SignIn } from '@clerk/nextjs';

// Catch-all route ([[...sign-in]]): Clerk's <SignIn /> component needs every
// sub-step (factor-one, sso-callback, etc.) to resolve under /sign-in/*.
export default function SignInPage() {
  return (
    <div className="signin-page">
      <SignIn />
    </div>
  );
}
