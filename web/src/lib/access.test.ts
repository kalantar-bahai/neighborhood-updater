import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./data', () => ({
  getAccessEntries: vi.fn(),
}));

import { getAccess } from './access';
import { getAccessEntries } from './data';

const mockGetAccessEntries = vi.mocked(getAccessEntries);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getAccess', () => {
  test('returns none when user has no entries', async () => {
    mockGetAccessEntries.mockResolvedValue([]);
    const result = await getAccess('stranger@x.com');
    expect(result.role).toBe('none');
  });

  test('wildcard entry grants access to all nuclei', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Alice', email: 'alice@x.com', role: 'read-write', nucleus: '*' },
    ]);
    const result = await getAccess('alice@x.com');
    expect(result.role).not.toBe('none');
    if (result.role === 'none') return;
    expect(result.roleMap['*']).toBe('read-write');
  });

  test('specific nucleus entry grants access to only that nucleus', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Bob', email: 'bob@x.com', role: 'read', nucleus: 'Alpha' },
    ]);
    const result = await getAccess('bob@x.com');
    expect(result.role).not.toBe('none');
    if (result.role === 'none') return;
    expect(Object.keys(result.roleMap)).toEqual(['alpha']);
    expect(result.roleMap['alpha']).toBe('read');
  });

  test('multiple entries for same user union their roleMap entries', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Eve', email: 'eve@x.com', role: 'read',       nucleus: 'Alpha' },
      { name: 'Eve', email: 'eve@x.com', role: 'read-write', nucleus: 'Beta'  },
    ]);
    const result = await getAccess('eve@x.com');
    expect(result.role).not.toBe('none');
    if (result.role === 'none') return;
    expect(result.roleMap['alpha']).toBe('read');
    expect(result.roleMap['beta']).toBe('read-write');
  });

  test('higher role wins when same nucleus appears twice', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Eve', email: 'eve@x.com', role: 'read',  nucleus: 'Alpha' },
      { name: 'Eve', email: 'eve@x.com', role: 'admin', nucleus: 'Alpha' },
    ]);
    const result = await getAccess('eve@x.com');
    if (result.role === 'none') return;
    expect(result.roleMap['alpha']).toBe('admin');
  });

  test('email comparison is case-insensitive', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Alice', email: 'Alice@X.COM', role: 'read', nucleus: '*' },
    ]);
    const result = await getAccess('alice@x.com');
    expect(result.role).not.toBe('none');
  });

  test('entries field contains only this user\'s entries', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Alice', email: 'alice@x.com', role: 'admin', nucleus: '*'    },
      { name: 'Bob',   email: 'bob@x.com',   role: 'read',  nucleus: 'Beta' },
    ]);
    const result = await getAccess('alice@x.com');
    if (result.role === 'none') return;
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].email).toBe('alice@x.com');
  });
});
