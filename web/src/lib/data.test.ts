import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./sheets', () => ({
  sheetsGet: vi.fn(),
  sheetsClear: vi.fn(),
  sheetsBatchUpdate: vi.fn(),
}));

import { sheetsGet, sheetsClear, sheetsBatchUpdate } from './sheets';
import { parseRow, findSrpRow, parseSrpData } from './data';
import { getAccompanierNames, saveAccompanierNames } from './data';
import { COL, DEV_COL, EDU_COL, ACC_COL } from './config';

const mockSheetsGet = vi.mocked(sheetsGet);
const mockSheetsClear = vi.mocked(sheetsClear);
const mockSheetsBatchUpdate = vi.mocked(sheetsBatchUpdate);

function makeRow(overrides: Record<number, string> = {}): string[] {
  const row = new Array(48).fill('');
  Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
  return row;
}

describe('parseRow', () => {
  test('maps identity fields correctly', () => {
    const row = makeRow({
      [COL.GROUPING]: 'NC Piedmont',
      [COL.CLUSTER]: 'Charlotte Area',
      [COL.NEIGHBORHOOD]: 'Albemarle Corridor',
      [COL.EMAIL]: 'mike@x.com',
    });
    const result = parseRow(row);
    expect(result.grouping).toBe('NC Piedmont');
    expect(result.cluster).toBe('Charlotte Area');
    expect(result.neighborhood).toBe('Albemarle Corridor');
    expect(result.email).toBe('mike@x.com');
  });

  test('maps activity fields into nested object', () => {
    const row = makeRow({
      [COL.CC_ACT]: '3', [COL.CC_PART]: '28', [COL.CC_FOF]: '24',
      [COL.DEV_ACT]: '5', [COL.DEV_PART]: '40', [COL.DEV_FOF]: '12',
    });
    const result = parseRow(row);
    expect(result.activities.ccs).toEqual({ act: '3', part: '28', fof: '24' });
    expect(result.activities.devotionals).toEqual({ act: '5', part: '40', fof: '12' });
  });

  test('maps all three educational activity types', () => {
    const row = makeRow({
      [COL.CC_ACT]: '1',  [COL.CC_PART]: '10',  [COL.CC_FOF]: '5',
      [COL.JYG_ACT]: '2', [COL.JYG_PART]: '20', [COL.JYG_FOF]: '8',
      [COL.SC_ACT]: '3',  [COL.SC_PART]: '30',  [COL.SC_FOF]: '11',
    });
    const result = parseRow(row);
    expect(result.activities.jygs).toEqual({ act: '2', part: '20', fof: '8' });
    expect(result.activities.scs).toEqual({ act: '3', part: '30', fof: '11' });
  });

  test('maps assessment fields', () => {
    const row = makeRow({
      [COL.SUPPORTED]: 'Yes', [COL.NOTES_SUPPORTED]: 'Great support',
      [COL.INVOLVED]: 'No',   [COL.NOTES_INVOLVED]: '',
    });
    const result = parseRow(row);
    expect(result.supported).toBe('Yes');
    expect(result.notesSupported).toBe('Great support');
    expect(result.involved).toBe('No');
  });

  test('empty row returns empty strings throughout', () => {
    const result = parseRow(new Array(48).fill(''));
    expect(result.neighborhood).toBe('');
    expect(result.activities.ccs).toEqual({ act: '', part: '', fof: '' });
  });
});

describe('findSrpRow', () => {
  const rows = [
    makeRow({ [DEV_COL.NAME]: 'Alabama' }),
    makeRow({ [DEV_COL.NAME]: 'Albemarle Corridor' }),
  ];

  test('finds row by exact name', () => {
    const result = findSrpRow('Albemarle Corridor', rows, DEV_COL.NAME);
    expect(result?.[DEV_COL.NAME]).toBe('Albemarle Corridor');
  });

  test('is case-insensitive', () => {
    const result = findSrpRow('albemarle corridor', rows, DEV_COL.NAME);
    expect(result?.[DEV_COL.NAME]).toBe('Albemarle Corridor');
  });

  test('returns null when not found', () => {
    expect(findSrpRow('Unknown Place', rows, DEV_COL.NAME)).toBeNull();
  });

  test('trims whitespace', () => {
    const result = findSrpRow('  Alabama  ', rows, DEV_COL.NAME);
    expect(result?.[DEV_COL.NAME]).toBe('Alabama');
  });
});

describe('parseSrpData', () => {
  function makeDevRow(overrides: Record<number, string> = {}): string[] {
    const row = new Array(14).fill('');
    Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
    return row;
  }
  function makeEduRow(overrides: Record<number, string> = {}): string[] {
    const row = new Array(11).fill('');
    Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
    return row;
  }

  test('returns null when both rows are null', () => {
    expect(parseSrpData(null, null)).toBeNull();
  });

  test('parses devotional activity from dev row', () => {
    const devRow = makeDevRow({ [DEV_COL.DEV_ACT]: '4', [DEV_COL.DEV_PART]: '30', [DEV_COL.DEV_FOF]: '10' });
    const result = parseSrpData(devRow, null);
    expect(result?.devotionals).toEqual({ act: '4', part: '30', fof: '10' });
    expect(result?.ccs).toBeNull();
  });

  test('parses educational activities from edu row', () => {
    const eduRow = makeEduRow({
      [EDU_COL.CC_ACT]: '3',  [EDU_COL.CC_PART]: '28',  [EDU_COL.CC_FOF]: '24',
      [EDU_COL.JYG_ACT]: '5', [EDU_COL.JYG_PART]: '28', [EDU_COL.JYG_FOF]: '27',
      [EDU_COL.SC_ACT]: '9',  [EDU_COL.SC_PART]: '26',  [EDU_COL.SC_FOF]: '23',
      [EDU_COL.FACILITATORS]: 'Alice, Bob',
    });
    const result = parseSrpData(null, eduRow);
    expect(result?.ccs).toEqual({ act: '3', part: '28', fof: '24' });
    expect(result?.jygs).toEqual({ act: '5', part: '28', fof: '27' });
    expect(result?.scs).toEqual({ act: '9', part: '26', fof: '23' });
    expect(result?.facilitators).toBe('Alice, Bob');
    expect(result?.devotionals).toBeNull();
  });

  test('combines both rows', () => {
    const devRow = makeDevRow({ [DEV_COL.DEV_ACT]: '2', [DEV_COL.DEV_PART]: '15', [DEV_COL.DEV_FOF]: '5' });
    const eduRow = makeEduRow({ [EDU_COL.CC_ACT]: '1', [EDU_COL.CC_PART]: '8', [EDU_COL.CC_FOF]: '3' });
    const result = parseSrpData(devRow, eduRow);
    expect(result?.devotionals).toEqual({ act: '2', part: '15', fof: '5' });
    expect(result?.ccs).toEqual({ act: '1', part: '8', fof: '3' });
  });
});

describe('getAccompanierNames', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeAccRow(overrides: Record<number, string> = {}): string[] {
    const row = new Array(6).fill('');
    Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
    return row;
  }

  test('returns names in row order for matching neighborhood', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Alpha', [ACC_COL.NAME]: 'Alice' }),
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Beta',  [ACC_COL.NAME]: 'Bob' }),
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Alpha', [ACC_COL.NAME]: 'Charlie' }),
    ]);
    const result = await getAccompanierNames('Alpha');
    expect(result).toEqual(['Alice', 'Charlie']);
  });

  test('is case-insensitive', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'ALPHA', [ACC_COL.NAME]: 'Alice' }),
    ]);
    const result = await getAccompanierNames('alpha');
    expect(result).toEqual(['Alice']);
  });

  test('returns empty array when no rows match', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Beta', [ACC_COL.NAME]: 'Bob' }),
    ]);
    const result = await getAccompanierNames('Alpha');
    expect(result).toEqual([]);
  });

  test('returns empty array when tab is empty', async () => {
    mockSheetsGet.mockResolvedValue([]);
    const result = await getAccompanierNames('Alpha');
    expect(result).toEqual([]);
  });
});

describe('saveAccompanierNames', () => {
  beforeEach(() => vi.clearAllMocks());

  const ctx = { cluster: 'Charlotte', clusterCode: 'C1', locality: 'Charlotte', parentNeighborhood: '' };

  function makeAccRow(overrides: Record<number, string> = {}): string[] {
    const row = new Array(6).fill('');
    Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
    return row;
  }

  test('replaces neighborhood rows and preserves other rows', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Alpha', [ACC_COL.NAME]: 'Old Name' }),
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Beta',  [ACC_COL.NAME]: 'Bob' }),
    ]);
    mockSheetsClear.mockResolvedValue(undefined);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);

    await saveAccompanierNames('Alpha', ['Alice', 'Charlie'], ctx);

    expect(mockSheetsClear).toHaveBeenCalledOnce();
    expect(mockSheetsBatchUpdate).toHaveBeenCalledOnce();
    const rows = mockSheetsBatchUpdate.mock.calls[0][1][0].values as string[][];
    expect(rows).toHaveLength(3);
    expect(rows[0][ACC_COL.NEIGHBORHOOD]).toBe('Beta');
    expect(rows[1]).toEqual(['Charlotte', 'C1', 'Charlotte', '', 'Alpha', 'Alice']);
    expect(rows[2]).toEqual(['Charlotte', 'C1', 'Charlotte', '', 'Alpha', 'Charlie']);
  });

  test('clears without writing when names list is empty', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Alpha', [ACC_COL.NAME]: 'Alice' }),
    ]);
    mockSheetsClear.mockResolvedValue(undefined);

    await saveAccompanierNames('Alpha', [], ctx);

    expect(mockSheetsClear).toHaveBeenCalledOnce();
    expect(mockSheetsBatchUpdate).not.toHaveBeenCalled();
  });

  test('writes only new rows when tab was empty', async () => {
    mockSheetsGet.mockResolvedValue([]);
    mockSheetsClear.mockResolvedValue(undefined);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);

    await saveAccompanierNames('Alpha', ['Alice'], ctx);

    const rows = mockSheetsBatchUpdate.mock.calls[0][1][0].values as string[][];
    expect(rows).toEqual([['Charlotte', 'C1', 'Charlotte', '', 'Alpha', 'Alice']]);
  });
});
