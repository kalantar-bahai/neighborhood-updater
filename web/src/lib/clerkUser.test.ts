import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: vi.fn(),
}));

import { getCurrentUserEmail } from './clerkUser';
import { currentUser } from '@clerk/nextjs/server';

const mockCurrentUser = vi.mocked(currentUser);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCurrentUserEmail', () => {
  test('returns the primary email address when set', async () => {
    mockCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'alice@x.com' },
    } as never);
    expect(await getCurrentUserEmail()).toBe('alice@x.com');
  });

  test('returns empty string when there is no signed-in user', async () => {
    mockCurrentUser.mockResolvedValue(null);
    expect(await getCurrentUserEmail()).toBe('');
  });

  test('returns empty string when the user has no primary email', async () => {
    mockCurrentUser.mockResolvedValue({ primaryEmailAddress: null } as never);
    expect(await getCurrentUserEmail()).toBe('');
  });
});
