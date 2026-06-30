import { describe, test, expect, vi, beforeEach } from 'vitest';
import { COL } from './config';

vi.mock('./data', () => ({
  getAllMasterRows: vi.fn(),
  getGlobalList: vi.fn(),
}));

import { getAuthorizedRows } from './access';
import { getAllMasterRows, getGlobalList } from './data';

function makeRow(overrides: Record<number, string> = {}): string[] {
  const row = new Array(48).fill('');
  Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
  return row;
}

const mockGetAllMasterRows = vi.mocked(getAllMasterRows);
const mockGetGlobalList = vi.mocked(getGlobalList);

beforeEach(() => { vi.clearAllMocks(); });

describe('getAuthorizedRows', () => {
  const rows = [
    makeRow({ [COL.NUCLEUS]: 'Alpha', [COL.EMAIL]: 'alice@x.com' }),
    makeRow({ [COL.NUCLEUS]: 'Beta',  [COL.EMAIL]: 'bob@x.com' }),
    makeRow({ [COL.NUCLEUS]: 'Gamma', [COL.EMAIL]: 'alice@x.com' }),
  ];

  test('returns global role and all rows for global user', async () => {
    mockGetAllMasterRows.mockResolvedValue(rows);
    mockGetGlobalList.mockResolvedValue(['admin@x.com']);
    const result = await getAuthorizedRows('admin@x.com');
    expect(result.role).toBe('global');
    expect(result.rows).toHaveLength(3);
  });

  test('global check is case-insensitive', async () => {
    mockGetAllMasterRows.mockResolvedValue(rows);
    mockGetGlobalList.mockResolvedValue(['Admin@X.COM']);
    const result = await getAuthorizedRows('admin@x.com');
    expect(result.role).toBe('global');
  });

  test('returns contact role and matching rows for known contact', async () => {
    mockGetAllMasterRows.mockResolvedValue(rows);
    mockGetGlobalList.mockResolvedValue([]);
    const result = await getAuthorizedRows('alice@x.com');
    expect(result.role).toBe('contact');
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every(r => r[COL.EMAIL] === 'alice@x.com')).toBe(true);
  });

  test('contact match is case-insensitive', async () => {
    mockGetAllMasterRows.mockResolvedValue(rows);
    mockGetGlobalList.mockResolvedValue([]);
    const result = await getAuthorizedRows('BOB@X.COM');
    expect(result.role).toBe('contact');
    expect(result.rows).toHaveLength(1);
  });

  test('returns none role for unknown email', async () => {
    mockGetAllMasterRows.mockResolvedValue(rows);
    mockGetGlobalList.mockResolvedValue([]);
    const result = await getAuthorizedRows('stranger@x.com');
    expect(result.role).toBe('none');
    expect(result.rows).toHaveLength(0);
  });

  test('global user is not also matched as contact', async () => {
    const rowsWithGlobal = [
      ...rows,
      makeRow({ [COL.NUCLEUS]: 'Admin Area', [COL.EMAIL]: 'admin@x.com' }),
    ];
    mockGetAllMasterRows.mockResolvedValue(rowsWithGlobal);
    mockGetGlobalList.mockResolvedValue(['admin@x.com']);
    const result = await getAuthorizedRows('admin@x.com');
    expect(result.role).toBe('global');
    expect(result.rows).toHaveLength(4);
  });
});
