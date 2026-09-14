import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./sheets', () => ({
  sheetsGet: vi.fn(),
  sheetsClear: vi.fn(),
  sheetsBatchUpdate: vi.fn(),
}));

import { sheetsGet, sheetsClear, sheetsBatchUpdate } from './sheets';
import { parseRow, findSrpRow, parseSrpData } from './data';
import { getAccessEntries, saveAccessEntries } from './data';
import { COL, DEV_COL, EDU_COL, ACCESS_COL } from './config';
import type { AccessEntry } from '@/types';

vi.mock('./clusterNotebook', () => ({
  getActivitySummaries: vi.fn(),
  updateActivitySummary: vi.fn(),
  getNucleusFields: vi.fn(),
  updateNucleus: vi.fn(),
  getNucleusWorkers: vi.fn(),
  individualDisplayName: vi.fn((ind: { firstName?: string | null }) => ind.firstName ?? ''),
}));

import {
  getActivitySummaries, updateActivitySummary, getNucleusFields, updateNucleus, getNucleusWorkers,
} from './clusterNotebook';
import { getRowData, saveRowData } from './data';
import { MASTER_TAB } from './config';

const mockGetActivitySummaries = vi.mocked(getActivitySummaries);
const mockUpdateActivitySummary = vi.mocked(updateActivitySummary);
const mockGetNucleusFields = vi.mocked(getNucleusFields);
const mockUpdateNucleus = vi.mocked(updateNucleus);
const mockGetNucleusWorkers = vi.mocked(getNucleusWorkers);

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
    });
    const result = parseRow(row);
    expect(result.grouping).toBe('NC Piedmont');
    expect(result.cluster).toBe('Charlotte Area');
    expect(result.nucleus).toBe('Albemarle Corridor');
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
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no workers, for tests that don't care about the worker lists specifically.
    mockGetNucleusWorkers.mockResolvedValue([]);
    // Default: no activity data, for tests that don't care about the activities card specifically.
    mockGetActivitySummaries.mockResolvedValue(null);
  });

  test('maps all four activity rollups from cluster-notebook, ignoring the sheet columns', async () => {
    const masterRow = makeRow({
      [COL.NUCLEUS]: 'Alpha',
      [COL.DEV_ACT]: '999', [COL.DEV_PART]: '999', [COL.DEV_FOF]: '999',
    });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetActivitySummaries.mockResolvedValue({
      devotionalGathering: { number: 4, participants: 30, participantsFof: 10, isOverridden: false },
      childrensClasses: { number: 1, participants: 10, participantsFof: 2, isOverridden: true },
      juniorYouthGroups: { number: 2, participants: 20, participantsFof: 3, isOverridden: false },
      studyCircles: { number: 3, participants: 30, participantsFof: 4, isOverridden: false },
    });

    const result = await getRowData('Alpha');

    expect(mockGetActivitySummaries).toHaveBeenCalledWith('Alpha');
    expect(result?.row.activities.devotionals).toEqual({ act: '4', part: '30', fof: '10', isOverridden: false });
    expect(result?.row.activities.ccs).toEqual({ act: '1', part: '10', fof: '2', isOverridden: true });
    expect(result?.row.activities.jygs).toEqual({ act: '2', part: '20', fof: '3', isOverridden: false });
    expect(result?.row.activities.scs).toEqual({ act: '3', part: '30', fof: '4', isOverridden: false });
  });

  test('renders a null cluster-notebook value as empty strings, not overridden', async () => {
    const masterRow = makeRow({ [COL.NUCLEUS]: 'Alpha' });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });

    const result = await getRowData('Alpha');

    expect(result?.row.activities.devotionals).toEqual({ act: '', part: '', fof: '', isOverridden: false });
    expect(result?.row.activities.ccs).toEqual({ act: '', part: '', fof: '', isOverridden: false });
  });

  test('returns null when the nucleus is not found in the sheet', async () => {
    mockSheetsGet.mockResolvedValue([]);

    const result = await getRowData('Nonexistent');

    expect(result).toBeNull();
  });

  test('uses the caller-supplied nucleusName as the canonical name, not the sheet\'s own copy', async () => {
    // The sheet's own COL.NUCLEUS value differs in case/whitespace from the name the
    // caller (ultimately cluster-notebook, via the picker) looked this row up by.
    const masterRow = makeRow({ [COL.NUCLEUS]: '  alpha  ' });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetActivitySummaries.mockResolvedValue(null);

    const result = await getRowData('Alpha');

    expect(result?.row.nucleus).toBe('Alpha');
  });

  test('propagates a cluster-notebook read failure', async () => {
    const masterRow = makeRow({ [COL.NUCLEUS]: 'Alpha' });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetActivitySummaries.mockRejectedValue(new Error('cluster-notebook request failed: 500 Internal Server Error'));

    await expect(getRowData('Alpha')).rejects.toThrow('cluster-notebook request failed');
  });

  test('overrides stage/locality/makeup with cluster-notebook data, ignoring the sheet columns', async () => {
    const masterRow = makeRow({
      [COL.NUCLEUS]: 'Alpha',
      [COL.STAGE]: 'stale-stage', [COL.LOCALITY]: 'stale-locality', [COL.MAKEUP]: 'stale-makeup',
      [COL.AUX_BOARD]: 'stale-auxboard',
    });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetActivitySummaries.mockResolvedValue(null);
    mockGetNucleusFields.mockResolvedValue({
      stage: 'Advanced/5', locality: 'Durham', populationMakeup: 'Students',
      population: 500, households: 120, connectedPopulation: 80, connectedHouseholds: 30,
      hasSocialAction: true, socialActionDescription: 'Cleanup drive', hasCommunityGatherings: false, communityGatheringDescription: null,
      narrative: 'A growing community of practice.',
      nucleusType: 'Neighborhood',
      cluster: {
        name: 'NC-215 Triangle', groupOfClusters: 'NC Eastern', growthMilestone: 'IPG Embracing Large Numbers',
        auxiliaryBoardMembers: 'Pat Doe (Propagation), Sam Roe (Protection)',
      },
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
    expect(result?.row.cluster).toBe('NC-215 Triangle');
    expect(result?.row.grouping).toBe('NC Eastern');
    expect(result?.row.pg).toBe('M3');
    expect(result?.row.clusterCode).toBe('NC-215');
    expect(result?.row.nucleusType).toBe('Neighborhood');
    expect(result?.row.auxBoard).toBe('Pat Doe (Propagation), Sam Roe (Protection)');
  });

  test('derives clusterCode as the first token of cluster.name', async () => {
    const masterRow = makeRow({ [COL.NUCLEUS]: 'Alpha' });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetActivitySummaries.mockResolvedValue(null);
    mockGetNucleusFields.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const result = await getRowData('Alpha');

    expect(result?.row.clusterCode).toBe('NC-215');
  });

  test('derives an empty clusterCode when the cluster name is empty', async () => {
    const masterRow = makeRow({ [COL.NUCLEUS]: 'Alpha' });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetActivitySummaries.mockResolvedValue(null);
    mockGetNucleusFields.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      cluster: { name: '', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const result = await getRowData('Alpha');

    expect(result?.row.clusterCode).toBe('');
  });

  test('translates all three known growthMilestone values to M1/M2/M3', async () => {
    const masterRow = makeRow({ [COL.NUCLEUS]: 'Alpha' });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetActivitySummaries.mockResolvedValue(null);

    const cases: [string, string][] = [
      ['Programme of Growth (PG)', 'M1'],
      ['Intensive Program of Growth (IPG)', 'M2'],
      ['IPG Embracing Large Numbers', 'M3'],
    ];
    for (const [growthMilestone, expectedPg] of cases) {
      mockGetNucleusFields.mockResolvedValue({
        stage: null, locality: null, populationMakeup: null,
        population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
        hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
        narrative: null,
        nucleusType: 'Neighborhood',
        cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone, auxiliaryBoardMembers: null },
      });
      const result = await getRowData('Alpha');
      expect(result?.row.pg).toBe(expectedPg);
    }
  });

  test('renders a null growthMilestone as an empty pg, not a mismatched code', async () => {
    const masterRow = makeRow({ [COL.NUCLEUS]: 'Alpha' });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetActivitySummaries.mockResolvedValue(null);
    mockGetNucleusFields.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const result = await getRowData('Alpha');

    expect(result?.row.pg).toBe('');
    expect(result?.row.grouping).toBe('');
  });

  test('renders a null cluster-notebook nucleus-fields value as empty strings', async () => {
    const masterRow = makeRow({ [COL.NUCLEUS]: 'Alpha' });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetActivitySummaries.mockResolvedValue(null);
    mockGetNucleusFields.mockResolvedValue(null);

    const result = await getRowData('Alpha');

    expect(result?.row.stage).toBe('');
    expect(result?.row.locality).toBe('');
    expect(result?.row.makeup).toBe('');
    expect(result?.row.presence).toBe('');
    expect(result?.row.gatherings).toBe('');
    expect(result?.row.narrative).toBe('');
    expect(result?.row.auxBoard).toBe('');
  });

  test('fetches accompanier/protagonist/abm-assistant/contact workers from cluster-notebook, mapped to {id, name, email}', async () => {
    const masterRow = makeRow({ [COL.NUCLEUS]: 'Alpha' });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetActivitySummaries.mockResolvedValue(null);
    mockGetNucleusFields.mockResolvedValue(null);
    const blank = { familyName: null, middleNames: null, nickname: null, sex: null, phone: null, ageCategory: null };
    mockGetNucleusWorkers.mockImplementation(async (_name: string, role: string) => {
      if (role === 'accompanier') return [{ id: '1', firstName: 'Alice', email: null, ...blank }];
      if (role === 'protagonist') return [{ id: '2', firstName: 'Bob', email: null, ...blank }];
      if (role === 'abm-assistant') return [{ id: '3', firstName: 'Carol', email: null, ...blank }];
      if (role === 'contact') return [{ id: '4', firstName: 'Dave', email: 'dave@x.com', ...blank }];
      return [];
    });

    const result = await getRowData('Alpha');

    expect(mockGetNucleusWorkers).toHaveBeenCalledWith('Alpha', 'accompanier');
    expect(mockGetNucleusWorkers).toHaveBeenCalledWith('Alpha', 'protagonist');
    expect(mockGetNucleusWorkers).toHaveBeenCalledWith('Alpha', 'abm-assistant');
    expect(mockGetNucleusWorkers).toHaveBeenCalledWith('Alpha', 'contact');
    expect(result?.accompanierNames).toEqual([{ id: '1', name: 'Alice', email: null }]);
    expect(result?.protagonistNames).toEqual([{ id: '2', name: 'Bob', email: null }]);
    expect(result?.abmAssistantNames).toEqual([{ id: '3', name: 'Carol', email: null }]);
    expect(result?.contactNames).toEqual([{ id: '4', name: 'Dave', email: 'dave@x.com' }]);
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

  test('writes all four activity rollups via cluster-notebook instead of the sheet', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateActivitySummary.mockResolvedValue(null);

    await saveRowData('Alpha', baseFormData, 'me@x.com');

    expect(mockUpdateActivitySummary).toHaveBeenCalledWith('Alpha', 'CHILDRENS_CLASS', { number: 1, participants: 2, participantsFof: 3 });
    expect(mockUpdateActivitySummary).toHaveBeenCalledWith('Alpha', 'JUNIOR_YOUTH_GROUP', { number: null, participants: null, participantsFof: null });
    expect(mockUpdateActivitySummary).toHaveBeenCalledWith('Alpha', 'STUDY_CIRCLE', { number: null, participants: null, participantsFof: null });
    expect(mockUpdateActivitySummary).toHaveBeenCalledWith('Alpha', 'DEVOTIONAL_GATHERING', { number: 5, participants: 40, participantsFof: 12 });

    const updates = mockSheetsBatchUpdate.mock.calls[0][1] as { values: string[][] }[];
    const writtenValues = updates.map(u => u.values[0][0]);
    // None of the activity numbers reach the sheet anymore -- all four rollups go through
    // updateActivitySummary now, not sheet columns.
    for (const v of ['1', '2', '3', '5', '40', '12']) expect(writtenValues).not.toContain(v);
  });

  test('sends null fields to cluster-notebook when devotionals values are blank', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateActivitySummary.mockResolvedValue(null);

    const formData = { ...baseFormData, activities: { ...baseFormData.activities, devotionals: { act: '', part: '', fof: '' } } };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateActivitySummary).toHaveBeenCalledWith('Alpha', 'DEVOTIONAL_GATHERING', {
      number: null, participants: null, participantsFof: null,
    });
  });

  test('strips commas before sending devotionals counts to cluster-notebook', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateActivitySummary.mockResolvedValue(null);

    const formData = { ...baseFormData, activities: { ...baseFormData.activities, devotionals: { act: '1,200', part: '900', fof: '0' } } };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateActivitySummary).toHaveBeenCalledWith('Alpha', 'DEVOTIONAL_GATHERING', {
      number: 1200, participants: 900, participantsFof: 0,
    });
  });

  test('propagates a cluster-notebook write failure instead of reporting success', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateActivitySummary.mockRejectedValue(new Error('cluster-notebook has no nucleus named "Alpha" — activity summary not saved'));

    await expect(saveRowData('Alpha', baseFormData, 'me@x.com')).rejects.toThrow('cluster-notebook has no nucleus named "Alpha"');
  });

  test('writes stage/locality/makeup via cluster-notebook instead of the sheet', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: 'Advanced/5', locality: 'Durham', populationMakeup: 'Students',
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
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
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: 500, households: 120, connectedPopulation: 80, connectedHouseholds: 30,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
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
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: true, socialActionDescription: 'Cleanup drive', hasCommunityGatherings: false, communityGatheringDescription: '',
      narrative: null,
      nucleusType: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
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
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: 'A growing community of practice.',
      nucleusType: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
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

  test('never writes nucleus/grouping/cluster/pg/clusterCode anywhere -- read-only, derived, or no rename support', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateActivitySummary.mockResolvedValue(null);

    const formData = {
      ...baseFormData,
      // "Renamed" simulates an attempted rename via the (now read-only) Nucleus field --
      // cluster-notebook has no rename mutation, so this must never reach the sheet either,
      // or the app would show a name the picker/cluster-notebook doesn't recognize.
      identity: {
        nucleus: 'Renamed', parentNucleus: '', grouping: 'NC Eastern',
        cluster: 'NC-215 Triangle', pg: 'M3', clusterCode: 'NC-215', nucleusType: 'Neighborhood',
      },
    };
    await saveRowData('Alpha', formData, 'me@x.com');

    const updates = mockSheetsBatchUpdate.mock.calls[0][1] as { values: string[][] }[];
    const writtenValues = updates.map(u => u.values[0][0]);
    expect(writtenValues).not.toContain('Renamed');
    expect(writtenValues).not.toContain('NC Eastern');
    expect(writtenValues).not.toContain('NC-215 Triangle');
    expect(writtenValues).not.toContain('M3');
    // clusterCode is now derived client-side from cluster.name, not stored/written anywhere either
    expect(writtenValues).not.toContain('NC-215');
    // nucleusType no longer goes to the sheet either -- it's part of the cluster-notebook patch now
    expect(writtenValues).not.toContain('Neighborhood');
  });

  test('writes nucleusType via cluster-notebook instead of the sheet', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null, nucleusType: 'Network',
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const formData = {
      ...baseFormData,
      identity: { nucleus: 'Alpha', parentNucleus: '', nucleusType: 'Network' },
    };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', {
      nucleusType: 'Network',
    });
  });

  test('does not patch nucleusType when a save includes other identity fields but omits it', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: 'Advanced/5', locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null, nucleusType: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    // identity present (admin save), but nucleusType specifically omitted from it.
    const formData = {
      ...baseFormData,
      stage: 'Advanced/5',
      identity: { nucleus: 'Alpha', parentNucleus: '' },
    };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', { stage: 'Advanced/5' });
  });

  test('maps a never-touched presence/gatherings value to null, not false', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
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
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: 'Advanced/5', locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const formData: Record<string, unknown> = { ...baseFormData, stage: 'Advanced/5' };
    delete formData.makeup;
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', { stage: 'Advanced/5' });
  });

  test('does not call updateNucleus when no cluster-notebook-backed nucleus field is present', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateActivitySummary.mockResolvedValue(null);

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
  function makeEduRow(overrides: Record<number, string> = {}): string[] {
    const row = new Array(11).fill('');
    Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
    return row;
  }

  test('returns null when there is no edu row', () => {
    expect(parseSrpData(null)).toBeNull();
  });

  test('parses facilitators from the edu row', () => {
    const eduRow = makeEduRow({ [EDU_COL.FACILITATORS]: 'Alice, Bob' });
    const result = parseSrpData(eduRow);
    expect(result?.facilitators).toBe('Alice, Bob');
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
