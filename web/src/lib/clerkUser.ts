import { currentUser } from '@clerk/nextjs/server';

// Human-readable identity for display/audit purposes only (e.g. the "last saved
// by" line) -- never used as the authorization key. Authorization keys on the
// Clerk user id instead (see access.ts), because email is mutable.
export async function getCurrentUserEmail(): Promise<string> {
  const user = await currentUser();
  return user?.primaryEmailAddress?.emailAddress ?? '';
}
