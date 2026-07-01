import { describe, test, expect, vi, beforeEach } from 'vitest';
import { COL } from './config';
import type { AccessEntry, Role } from '@/types';

vi.mock('./data', () => ({
  getAllMasterRows: vi.fn(),
  getAccessEntries: vi.fn(),
}));

import { getAccess } from './access';
import { getAllMasterRows, getAccessEntries } from './data';

function makeRow(overrides: Record<number, string> = {}): string[] {
  const row = new Array(51).fill('');
  Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
  return row;
}

const mockGetAllMasterRows = vi.mocked(getAllMasterRows);
const mockGetAccessEntries = vi.mocked(getAccessEntries);

const rows = [
  makeRow({ [COL.NUCLEUS]: 'Alpha' }),
  makeRow({ [COL.NUCLEUS]: 'Beta'  }),
  makeRow({ [COL.NUCLEUS]: 'Gamma' }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllMasterRows.mockResolvedValue(rows);
});

describe('getAccess', () => {
  test('returns none when user has no entries', async () => {
    mockGetAccessEntries.mockResolvedValue([]);
    const result = await getAccess('stranger@x.com');
    expect(result.role).toBe('none');
    expect(result.rows).toHaveLength(0);
  });

  test('wildcard entry grants access to all rows', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Alice', email: 'alice@x.com', role: 'read-write', nucleus: '*' },
    ]);
    const result = await getAccess('alice@x.com');
    expect(result.role).not.toBe('none');
    if (result.role === 'none') return;
    expect(result.rows).toHaveLength(3);
    expect(result.roleMap['*']).toBe('read-write');
  });

  test('specific nucleus entry grants access to only that nucleus row', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Bob', email: 'bob@x.com', role: 'read', nucleus: 'Alpha' },
    ]);
    const result = await getAccess('bob@x.com');
    expect(result.role).not.toBe('none');
    if (result.role === 'none') return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0][COL.NUCLEUS]).toBe('Alpha');
    expect(result.roleMap['alpha']).toBe('read');
  });

  test('multiple entries for same user union their rows', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Eve', email: 'eve@x.com', role: 'read',       nucleus: 'Alpha' },
      { name: 'Eve', email: 'eve@x.com', role: 'read-write', nucleus: 'Beta'  },
    ]);
    const result = await getAccess('eve@x.com');
    expect(result.role).not.toBe('none');
    if (result.role === 'none') return;
    expect(result.rows).toHaveLength(2);
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
    expect(result.rows).toHaveLength(1);
  });

  test('email comparison is case-insensitive', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Alice', email: 'Alice@X.COM', role: 'read', nucleus: '*' },
    ]);
    const result = await getAccess('alice@x.com');
    expect(result.role).not.toBe('none');
  });

  test('wildcard entry also adds all master rows to result.rows', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Alice', email: 'alice@x.com', role: 'admin', nucleus: '*' },
    ]);
    const result = await getAccess('alice@x.com');
    if (result.role === 'none') return;
    expect(result.rows).toHaveLength(3);
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
