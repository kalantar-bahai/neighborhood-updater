import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./sheets', () => ({
  sheetsGet: vi.fn(),
  sheetsClear: vi.fn(),
  sheetsBatchUpdate: vi.fn(),
}));

import { sheetsGet, sheetsClear, sheetsBatchUpdate } from './sheets';
import { parseRow, findSrpRow, parseSrpData } from './data';
import { getWorkerNames, saveWorkerNames } from './data';
import { getAccessEntries, saveAccessEntries } from './data';
import { COL, DEV_COL, EDU_COL, ACC_COL, ACCESS_COL } from './config';
import type { AccessEntry } from '@/types';

vi.mock('./clusterNotebook', () => ({
  getDevotionalGathering: vi.fn(),
  updateDevotionalGathering: vi.fn(),
  getNucleusFields: vi.fn(),
  updateNucleus: vi.fn(),
}));

import { getDevotionalGathering, updateDevotionalGathering, getNucleusFields, updateNucleus } from './clusterNotebook';
import { getRowData, saveRowData } from './data';
import { MASTER_TAB } from './config';

const mockGetDevotionalGathering = vi.mocked(getDevotionalGathering);
const mockUpdateDevotionalGathering = vi.mocked(updateDevotionalGathering);
const mockGetNucleusFields = vi.mocked(getNucleusFields);
const mockUpdateNucleus = vi.mocked(updateNucleus);

const mockSheetsGet = vi.mocked(sheetsGet);
const mockSheetsClear = vi.mocked(sheetsClear);
const mockSheetsBatchUpdate = vi.mocked(sheetsBatchUpdate);

function makeRow(overrides: Record<number, string> = {}): string[] {
  const row = new Array(51).fill('');
  Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
  return row;
}

describe('parseRow', () => {
  test('maps identity fields correctly', () => {
    const row = makeRow({
      [COL.GROUPING]: 'NC Piedmont',
      [COL.CLUSTER]: 'Charlotte Area',
      [COL.NUCLEUS]: 'Albemarle Corridor',
      [COL.EMAIL]: 'mike@x.com',
    });
    const result = parseRow(row);
    expect(result.grouping).toBe('NC Piedmont');
    expect(result.cluster).toBe('Charlotte Area');
    expect(result.nucleus).toBe('Albemarle Corridor');
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
    const result = parseRow(new Array(51).fill(''));
    expect(result.nucleus).toBe('');
    expect(result.nucleusType).toBe('');
    expect(result.activities.ccs).toEqual({ act: '', part: '', fof: '' });
  });
});

describe('getRowData', () => {
  beforeEach(() => vi.clearAllMocks());

  test('overrides devotionals with cluster-notebook data, ignoring the sheet columns', async () => {
    const masterRow = makeRow({
      [COL.NUCLEUS]: 'Alpha',
      [COL.DEV_ACT]: '999', [COL.DEV_PART]: '999', [COL.DEV_FOF]: '999',
    });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetDevotionalGathering.mockResolvedValue({ number: 4, participants: 30, participantsFof: 10 });

    const result = await getRowData('Alpha');

    expect(mockGetDevotionalGathering).toHaveBeenCalledWith('Alpha');
    expect(result?.row.activities.devotionals).toEqual({ act: '4', part: '30', fof: '10' });
  });

  test('renders a null cluster-notebook value as empty strings', async () => {
    const masterRow = makeRow({ [COL.NUCLEUS]: 'Alpha' });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetDevotionalGathering.mockResolvedValue(null);

    const result = await getRowData('Alpha');

    expect(result?.row.activities.devotionals).toEqual({ act: '', part: '', fof: '' });
  });

  test('returns null when the nucleus is not found in the sheet', async () => {
    mockSheetsGet.mockResolvedValue([]);
    mockGetDevotionalGathering.mockResolvedValue(null);

    const result = await getRowData('Nonexistent');

    expect(result).toBeNull();
  });

  test('propagates a cluster-notebook read failure', async () => {
    const masterRow = makeRow({ [COL.NUCLEUS]: 'Alpha' });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetDevotionalGathering.mockRejectedValue(new Error('cluster-notebook request failed: 500 Internal Server Error'));

    await expect(getRowData('Alpha')).rejects.toThrow('cluster-notebook request failed');
  });

  test('overrides stage/locality/makeup with cluster-notebook data, ignoring the sheet columns', async () => {
    const masterRow = makeRow({
      [COL.NUCLEUS]: 'Alpha',
      [COL.STAGE]: 'stale-stage', [COL.LOCALITY]: 'stale-locality', [COL.MAKEUP]: 'stale-makeup',
    });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetDevotionalGathering.mockResolvedValue(null);
    mockGetNucleusFields.mockResolvedValue({
      stage: 'Advanced/5', locality: 'Durham', populationMakeup: 'Students',
      population: 500, households: 120, connectedPopulation: 80, connectedHouseholds: 30,
      hasSocialAction: true, socialActionDescription: 'Cleanup drive', hasCommunityGatherings: false, communityGatheringDescription: null,
      narrative: 'A growing community of practice.',
    });

    const result = await getRowData('Alpha');

    expect(mockGetNucleusFields).toHaveBeenCalledWith('Alpha');
    expect(result?.row.stage).toBe('Advanced/5');
    expect(result?.row.locality).toBe('Durham');
    expect(result?.row.makeup).toBe('Students');
    expect(result?.row.totalPop).toBe('500');
    expect(result?.row.totalHH).toBe('120');
    expect(result?.row.indNum).toBe('80');
    expect(result?.row.hhNum).toBe('30');
    expect(result?.row.presence).toBe('Yes');
    expect(result?.row.notesPresence).toBe('Cleanup drive');
    expect(result?.row.gatherings).toBe('No');
    expect(result?.row.notesGatherings).toBe('');
    expect(result?.row.narrative).toBe('A growing community of practice.');
  });

  test('renders a null cluster-notebook nucleus-fields value as empty strings', async () => {
    const masterRow = makeRow({ [COL.NUCLEUS]: 'Alpha' });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetDevotionalGathering.mockResolvedValue(null);
    mockGetNucleusFields.mockResolvedValue(null);

    const result = await getRowData('Alpha');

    expect(result?.row.stage).toBe('');
    expect(result?.row.locality).toBe('');
    expect(result?.row.makeup).toBe('');
    expect(result?.row.presence).toBe('');
    expect(result?.row.gatherings).toBe('');
    expect(result?.row.narrative).toBe('');
  });
});

describe('saveRowData', () => {
  beforeEach(() => vi.clearAllMocks());

  const baseFormData = {
    locality: 'Durham',
    activities: {
      ccs:  { act: '1', part: '2', fof: '3' },
      jygs: { act: '', part: '', fof: '' },
      scs:  { act: '', part: '', fof: '' },
      devotionals: { act: '5', part: '40', fof: '12' },
    },
  };

  test('writes devotionals via cluster-notebook instead of the sheet', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateDevotionalGathering.mockResolvedValue({ number: 5, participants: 40, participantsFof: 12 });

    await saveRowData('Alpha', baseFormData, 'me@x.com');

    expect(mockUpdateDevotionalGathering).toHaveBeenCalledWith('Alpha', {
      number: 5, participants: 40, participantsFof: 12,
    });

    const updates = mockSheetsBatchUpdate.mock.calls[0][1] as { values: string[][] }[];
    const writtenValues = updates.map(u => u.values[0][0]);
    expect(writtenValues).toContain('1'); // ccs.act still written to the sheet
    expect(writtenValues).not.toContain('5');  // devotionals.act must NOT reach the sheet
    expect(writtenValues).not.toContain('40'); // devotionals.part must NOT reach the sheet
    expect(writtenValues).not.toContain('12'); // devotionals.fof must NOT reach the sheet
  });

  test('sends null fields to cluster-notebook when devotionals values are blank', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateDevotionalGathering.mockResolvedValue(null);

    const formData = { ...baseFormData, activities: { ...baseFormData.activities, devotionals: { act: '', part: '', fof: '' } } };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateDevotionalGathering).toHaveBeenCalledWith('Alpha', {
      number: null, participants: null, participantsFof: null,
    });
  });

  test('strips commas before sending devotionals counts to cluster-notebook', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateDevotionalGathering.mockResolvedValue(null);

    const formData = { ...baseFormData, activities: { ...baseFormData.activities, devotionals: { act: '1,200', part: '900', fof: '0' } } };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateDevotionalGathering).toHaveBeenCalledWith('Alpha', {
      number: 1200, participants: 900, participantsFof: 0,
    });
  });

  test('propagates a cluster-notebook write failure instead of reporting success', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateDevotionalGathering.mockRejectedValue(new Error('cluster-notebook has no nucleus named "Alpha" — devotional gathering not saved'));

    await expect(saveRowData('Alpha', baseFormData, 'me@x.com')).rejects.toThrow('cluster-notebook has no nucleus named "Alpha"');
  });

  test('writes stage/locality/makeup via cluster-notebook instead of the sheet', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateDevotionalGathering.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: 'Advanced/5', locality: 'Durham', populationMakeup: 'Students',
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
    });

    const formData = { ...baseFormData, stage: 'Advanced/5', locality: 'Durham', makeup: 'Students' };
    await saveRowData('Alpha', formData, 'me@x.com');

    // locality is intentionally absent here even though formData has it: cluster-notebook
    // removed NucleusPatch.locality 2026-09-13 (now read-only, derived from Nucleus.location).
    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', {
      stage: 'Advanced/5', populationMakeup: 'Students',
    });

    const updates = mockSheetsBatchUpdate.mock.calls[0][1] as { values: string[][] }[];
    const writtenValues = updates.map(u => u.values[0][0]);
    expect(writtenValues).not.toContain('Advanced/5');
    expect(writtenValues).not.toContain('Students');
  });

  test('writes population/households/connected* via cluster-notebook instead of the sheet', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateDevotionalGathering.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: 500, households: 120, connectedPopulation: 80, connectedHouseholds: 30,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
    });

    const formData = { ...baseFormData, totalPop: '500', totalHH: '120', indNum: '80', hhNum: '30' };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', {
      population: 500, households: 120, connectedPopulation: 80, connectedHouseholds: 30,
    });

    const updates = mockSheetsBatchUpdate.mock.calls[0][1] as { values: string[][] }[];
    const writtenValues = updates.map(u => u.values[0][0]);
    expect(writtenValues).not.toContain('500');
    expect(writtenValues).not.toContain('120');
    expect(writtenValues).not.toContain('80');
    expect(writtenValues).not.toContain('30');
  });

  test('writes presence/gatherings as tri-state booleans via cluster-notebook instead of the sheet', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateDevotionalGathering.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: true, socialActionDescription: 'Cleanup drive', hasCommunityGatherings: false, communityGatheringDescription: '',
      narrative: null,
    });

    const formData = {
      ...baseFormData,
      presence: 'Yes', notesPresence: 'Cleanup drive',
      gatherings: 'No', notesGatherings: '',
    };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', {
      hasSocialAction: true, socialActionDescription: 'Cleanup drive',
      hasCommunityGatherings: false, communityGatheringDescription: '',
    });

    const updates = mockSheetsBatchUpdate.mock.calls[0][1] as { values: string[][] }[];
    const writtenValues = updates.map(u => u.values[0][0]);
    expect(writtenValues).not.toContain('Cleanup drive');
  });

  test('writes narrative via cluster-notebook instead of the sheet', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateDevotionalGathering.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: 'A growing community of practice.',
    });

    const formData = { ...baseFormData, narrative: 'A growing community of practice.' };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', {
      narrative: 'A growing community of practice.',
    });

    const updates = mockSheetsBatchUpdate.mock.calls[0][1] as { values: string[][] }[];
    const writtenValues = updates.map(u => u.values[0][0]);
    expect(writtenValues).not.toContain('A growing community of practice.');
  });

  test('maps a never-touched presence/gatherings value to null, not false', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateDevotionalGathering.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
    });

    const formData = { ...baseFormData, presence: '', gatherings: '' };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', {
      hasSocialAction: null, hasCommunityGatherings: null,
    });
  });

  test('omits patch fields the caller did not provide, rather than sending them as blank', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateDevotionalGathering.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: 'Advanced/5', locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
    });

    const formData: Record<string, unknown> = { ...baseFormData, stage: 'Advanced/5' };
    delete formData.makeup;
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', { stage: 'Advanced/5' });
  });

  test('does not call updateNucleus when no cluster-notebook-backed nucleus field is present', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateDevotionalGathering.mockResolvedValue(null);

    // baseFormData's own `locality` is never patchable (read-only, derived on
    // cluster-notebook's side) — plain baseFormData alone shouldn't trigger a call.
    await saveRowData('Alpha', baseFormData, 'me@x.com');

    expect(mockUpdateNucleus).not.toHaveBeenCalled();
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

describe('getWorkerNames', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeAccRow(overrides: Record<number, string> = {}): string[] {
    const row = new Array(7).fill('');
    Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
    return row;
  }

  test('returns names in row order for matching neighborhood and type', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NUCLEUS]: 'Alpha', [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Alice' }),
      makeAccRow({ [ACC_COL.NUCLEUS]: 'Beta',  [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Bob' }),
      makeAccRow({ [ACC_COL.NUCLEUS]: 'Alpha', [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Charlie' }),
    ]);
    const result = await getWorkerNames('Alpha', 'accompanier');
    expect(result).toEqual(['Alice', 'Charlie']);
  });

  test('is case-insensitive for both nucleus and type', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NUCLEUS]: 'ALPHA', [ACC_COL.TYPE]: 'Accompanier', [ACC_COL.NAME]: 'Alice' }),
    ]);
    const result = await getWorkerNames('alpha', 'accompanier');
    expect(result).toEqual(['Alice']);
  });

  test('returns empty when nucleus matches but type does not', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NUCLEUS]: 'Alpha', [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Alice' }),
    ]);
    const result = await getWorkerNames('Alpha', 'protagonist');
    expect(result).toEqual([]);
  });

  test('returns empty array when no rows match nucleus', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NUCLEUS]: 'Beta', [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Bob' }),
    ]);
    const result = await getWorkerNames('Alpha', 'accompanier');
    expect(result).toEqual([]);
  });

  test('returns empty array when tab is empty', async () => {
    mockSheetsGet.mockResolvedValue([]);
    const result = await getWorkerNames('Alpha', 'accompanier');
    expect(result).toEqual([]);
  });
});

describe('saveWorkerNames', () => {
  beforeEach(() => vi.clearAllMocks());

  const ctx = { cluster: 'Charlotte', clusterCode: 'C1', locality: 'Charlotte', parentNucleus: '' };

  function makeAccRow(overrides: Record<number, string> = {}): string[] {
    const row = new Array(7).fill('');
    Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
    return row;
  }

  test('replaces rows for nucleus+type and preserves other nuclei', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NUCLEUS]: 'Alpha', [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Old Name' }),
      makeAccRow({ [ACC_COL.NUCLEUS]: 'Beta',  [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Bob' }),
    ]);
    mockSheetsClear.mockResolvedValue(undefined);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);

    await saveWorkerNames('Alpha', 'accompanier', ['Alice', 'Charlie'], ctx);

    expect(mockSheetsClear).toHaveBeenCalledOnce();
    expect(mockSheetsBatchUpdate).toHaveBeenCalledOnce();
    const rows = mockSheetsBatchUpdate.mock.calls[0][1][0].values as string[][];
    expect(rows).toHaveLength(3);
    expect(rows[0][ACC_COL.NUCLEUS]).toBe('Beta');
    expect(rows[1]).toEqual(['Charlotte', 'C1', 'Charlotte', '', 'Alpha', 'accompanier', 'Alice']);
    expect(rows[2]).toEqual(['Charlotte', 'C1', 'Charlotte', '', 'Alpha', 'accompanier', 'Charlie']);
  });

  test('preserves rows of a different type for the same neighborhood', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NUCLEUS]: 'Alpha', [ACC_COL.TYPE]: 'protagonist', [ACC_COL.NAME]: 'ProtagA' }),
      makeAccRow({ [ACC_COL.NUCLEUS]: 'Alpha', [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'OldAcc' }),
    ]);
    mockSheetsClear.mockResolvedValue(undefined);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);

    await saveWorkerNames('Alpha', 'accompanier', ['NewAcc'], ctx);

    const rows = mockSheetsBatchUpdate.mock.calls[0][1][0].values as string[][];
    expect(rows).toHaveLength(2);
    expect(rows[0][ACC_COL.TYPE]).toBe('protagonist');
    expect(rows[1]).toEqual(['Charlotte', 'C1', 'Charlotte', '', 'Alpha', 'accompanier', 'NewAcc']);
  });

  test('clears without writing when names list is empty', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NUCLEUS]: 'Alpha', [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Alice' }),
    ]);
    mockSheetsClear.mockResolvedValue(undefined);

    await saveWorkerNames('Alpha', 'accompanier', [], ctx);

    expect(mockSheetsClear).toHaveBeenCalledOnce();
    expect(mockSheetsBatchUpdate).not.toHaveBeenCalled();
  });

  test('writes only new rows when tab was empty', async () => {
    mockSheetsGet.mockResolvedValue([]);
    mockSheetsClear.mockResolvedValue(undefined);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);

    await saveWorkerNames('Alpha', 'accompanier', ['Alice'], ctx);

    const rows = mockSheetsBatchUpdate.mock.calls[0][1][0].values as string[][];
    expect(rows).toEqual([['Charlotte', 'C1', 'Charlotte', '', 'Alpha', 'accompanier', 'Alice']]);
  });
});

describe('getAccessEntries', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns parsed access entries from sheet', async () => {
    mockSheetsGet.mockResolvedValue([
      ['Alice Smith', 'alice@x.com', 'admin', '*'],
      ['Bob Jones',   'bob@x.com',   'read',  'Alpha'],
    ]);
    const result = await getAccessEntries();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'Alice Smith', email: 'alice@x.com', role: 'admin', nucleus: '*' });
    expect(result[1]).toEqual({ name: 'Bob Jones',   email: 'bob@x.com',   role: 'read',  nucleus: 'Alpha' });
  });

  test('skips rows with missing email', async () => {
    mockSheetsGet.mockResolvedValue([
      ['Alice', 'alice@x.com', 'read-write', 'Beta'],
      ['',      '',            'read',       'Gamma'],
    ]);
    const result = await getAccessEntries();
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('alice@x.com');
  });

  test('returns empty array when tab is empty', async () => {
    mockSheetsGet.mockResolvedValue([]);
    const result = await getAccessEntries();
    expect(result).toEqual([]);
  });
});

describe('saveAccessEntries', () => {
  beforeEach(() => vi.clearAllMocks());

  const entries: AccessEntry[] = [
    { name: 'Alice', email: 'alice@x.com', role: 'admin',      nucleus: '*'     },
    { name: 'Bob',   email: 'bob@x.com',   role: 'read-write', nucleus: 'Alpha' },
  ];

  test('clears tab and writes all entries', async () => {
    mockSheetsClear.mockResolvedValue(undefined);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);

    await saveAccessEntries(entries);

    expect(mockSheetsClear).toHaveBeenCalledOnce();
    expect(mockSheetsBatchUpdate).toHaveBeenCalledOnce();
    const rows = mockSheetsBatchUpdate.mock.calls[0][1][0].values as string[][];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(['Alice', 'alice@x.com', 'admin',      '*'    ]);
    expect(rows[1]).toEqual(['Bob',   'bob@x.com',   'read-write', 'Alpha']);
  });

  test('clears without writing when entries list is empty', async () => {
    mockSheetsClear.mockResolvedValue(undefined);

    await saveAccessEntries([]);

    expect(mockSheetsClear).toHaveBeenCalledOnce();
    expect(mockSheetsBatchUpdate).not.toHaveBeenCalled();
  });
});
