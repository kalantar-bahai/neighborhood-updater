import { describe, test, expect, vi, beforeEach } from 'vitest';

import { facilitatorsFromClusterNotebook, facilitatorsCountFromClusterNotebook } from './data';
import type { ActivitySummary } from './clusterNotebook';

vi.mock('./clusterNotebook', () => ({
  getActivitySummaries: vi.fn(),
  updateActivitySummary: vi.fn(),
  getNucleusFields: vi.fn(),
  updateNucleus: vi.fn(),
  getNucleusWorkers: vi.fn(),
  createNucleus: vi.fn(),
  deleteNucleus: vi.fn(),
  individualDisplayName: vi.fn((ind: { firstName?: string | null }) => ind.firstName ?? ''),
}));

import {
  getActivitySummaries, updateActivitySummary, getNucleusFields, updateNucleus, getNucleusWorkers, createNucleus, deleteNucleus,
} from './clusterNotebook';
import { getRowData, saveRowData, createRowData, deleteRowData } from './data';

const mockGetActivitySummaries = vi.mocked(getActivitySummaries);
const mockUpdateActivitySummary = vi.mocked(updateActivitySummary);
const mockGetNucleusFields = vi.mocked(getNucleusFields);
const mockUpdateNucleus = vi.mocked(updateNucleus);
const mockGetNucleusWorkers = vi.mocked(getNucleusWorkers);
const mockCreateNucleus = vi.mocked(createNucleus);
const mockDeleteNucleus = vi.mocked(deleteNucleus);

describe('getRowData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no workers, for tests that don't care about the worker lists specifically.
    mockGetNucleusWorkers.mockResolvedValue([]);
    // Default: no activity data, for tests that don't care about the activities card specifically.
    mockGetActivitySummaries.mockResolvedValue(null);
  });

  test('maps all four activity rollups from cluster-notebook', async () => {
    mockGetActivitySummaries.mockResolvedValue({
      devotionalGathering: { number: 4, participants: 30, participantsFof: 10, isOverridden: false, facilitators: null, facilitatorNames: 'Dave' },
      childrensClasses: { number: 1, participants: 10, participantsFof: 2, isOverridden: true, facilitators: null, facilitatorNames: 'Alice' },
      juniorYouthGroups: { number: 2, participants: 20, participantsFof: 3, isOverridden: false, facilitators: null, facilitatorNames: null },
      studyCircles: { number: 3, participants: 30, participantsFof: 4, isOverridden: false, facilitators: null, facilitatorNames: '' },
    });

    const result = await getRowData('Alpha');

    expect(mockGetActivitySummaries).toHaveBeenCalledWith('Alpha');
    expect(result?.row.activities.devotionals).toEqual({ act: '4', part: '30', fof: '10', isOverridden: false });
    expect(result?.row.activities.ccs).toEqual({ act: '1', part: '10', fof: '2', isOverridden: true });
    expect(result?.row.activities.jygs).toEqual({ act: '2', part: '20', fof: '3', isOverridden: false });
    expect(result?.row.activities.scs).toEqual({ act: '3', part: '30', fof: '4', isOverridden: false });
    expect(result?.row.facilitators).toBe('Alice; Dave');
  });

  test('renders a null cluster-notebook value as empty strings, not overridden', async () => {
    const result = await getRowData('Alpha');

    expect(result?.row.activities.devotionals).toEqual({ act: '', part: '', fof: '', isOverridden: false });
    expect(result?.row.activities.ccs).toEqual({ act: '', part: '', fof: '', isOverridden: false });
  });

  test('returns null when the nucleus is not found in cluster-notebook', async () => {
    mockGetNucleusFields.mockResolvedValue(null);

    const result = await getRowData('Nonexistent');

    expect(result).toBeNull();
  });

  test('returns the nucleus name and fields directly from cluster-notebook', async () => {
    mockGetActivitySummaries.mockResolvedValue(null);
    mockGetNucleusFields.mockResolvedValue({
      stage: 'Advanced/5', locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      parentNucleus: null,
      cluster: { name: '', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const result = await getRowData('Newly Created');

    expect(result).not.toBeNull();
    expect(result?.row.nucleus).toBe('Newly Created');
    expect(result?.row.stage).toBe('Advanced/5');
  });

  test('uses the caller-supplied nucleusName as the canonical name', async () => {
    mockGetActivitySummaries.mockResolvedValue(null);

    const result = await getRowData('Alpha');

    expect(result?.row.nucleus).toBe('Alpha');
  });

  test('propagates a cluster-notebook read failure', async () => {
    mockGetActivitySummaries.mockRejectedValue(new Error('cluster-notebook request failed: 500 Internal Server Error'));

    await expect(getRowData('Alpha')).rejects.toThrow('cluster-notebook request failed');
  });

  test('maps nucleusFields onto the row', async () => {
    mockGetActivitySummaries.mockResolvedValue(null);
    mockGetNucleusFields.mockResolvedValue({
      stage: 'Advanced/5', locality: 'Durham', populationMakeup: 'Students',
      population: 500, households: 120, connectedPopulation: 80, connectedHouseholds: 30,
      hasSocialAction: true, socialActionDescription: 'Cleanup drive', hasCommunityGatherings: false, communityGatheringDescription: null,
      narrative: 'A growing community of practice.',
      nucleusType: 'Neighborhood',
      parentNucleus: null,
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
    mockGetActivitySummaries.mockResolvedValue(null);
    mockGetNucleusFields.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      parentNucleus: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const result = await getRowData('Alpha');

    expect(result?.row.clusterCode).toBe('NC-215');
  });

  test('derives an empty clusterCode when the cluster name is empty', async () => {
    mockGetActivitySummaries.mockResolvedValue(null);
    mockGetNucleusFields.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      parentNucleus: null,
      cluster: { name: '', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const result = await getRowData('Alpha');

    expect(result?.row.clusterCode).toBe('');
  });

  test('translates all three known growthMilestone values to M1/M2/M3', async () => {
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
        parentNucleus: null,
        cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone, auxiliaryBoardMembers: null },
      });
      const result = await getRowData('Alpha');
      expect(result?.row.pg).toBe(expectedPg);
    }
  });

  test('renders a null growthMilestone as an empty pg, not a mismatched code', async () => {
    mockGetActivitySummaries.mockResolvedValue(null);
    mockGetNucleusFields.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      parentNucleus: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const result = await getRowData('Alpha');

    expect(result?.row.pg).toBe('');
    expect(result?.row.grouping).toBe('');
  });

  test('renders a null cluster-notebook nucleus-fields value as empty strings', async () => {
    mockGetActivitySummaries.mockResolvedValue(null);
    mockGetNucleusFields.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      parentNucleus: null,
      cluster: { name: '', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const result = await getRowData('Alpha');

    expect(result?.row.stage).toBe('');
    expect(result?.row.locality).toBe('');
    expect(result?.row.makeup).toBe('');
    expect(result?.row.presence).toBe('');
    expect(result?.row.gatherings).toBe('');
    expect(result?.row.narrative).toBe('');
    expect(result?.row.auxBoard).toBe('');
  });

  test('fetches accompanier/protagonist/abm-assistant/contact/promoter workers from cluster-notebook, mapped to {id, name, email}', async () => {
    mockGetActivitySummaries.mockResolvedValue(null);
    mockGetNucleusFields.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      parentNucleus: null,
      cluster: { name: '', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });
    const blank = { familyName: null, middleNames: null, nickname: null, sex: null, phone: null, ageCategory: null };
    mockGetNucleusWorkers.mockImplementation(async (_name: string, role: string) => {
      if (role === 'accompanier') return [{ id: '1', firstName: 'Alice', email: null, ...blank }];
      if (role === 'protagonist') return [{ id: '2', firstName: 'Bob', email: null, ...blank }];
      if (role === 'abm-assistant') return [{ id: '3', firstName: 'Carol', email: null, ...blank }];
      if (role === 'contact') return [{ id: '4', firstName: 'Dave', email: 'dave@x.com', ...blank }];
      if (role === 'promoter') return [{ id: '5', firstName: 'Erin', email: null, ...blank }];
      return [];
    });

    const result = await getRowData('Alpha');

    expect(mockGetNucleusWorkers).toHaveBeenCalledWith('Alpha', 'accompanier');
    expect(mockGetNucleusWorkers).toHaveBeenCalledWith('Alpha', 'protagonist');
    expect(mockGetNucleusWorkers).toHaveBeenCalledWith('Alpha', 'abm-assistant');
    expect(mockGetNucleusWorkers).toHaveBeenCalledWith('Alpha', 'contact');
    expect(mockGetNucleusWorkers).toHaveBeenCalledWith('Alpha', 'promoter');
    expect(result?.accompanierNames).toEqual([{ id: '1', name: 'Alice', email: null }]);
    expect(result?.protagonistNames).toEqual([{ id: '2', name: 'Bob', email: null }]);
    expect(result?.abmAssistantNames).toEqual([{ id: '3', name: 'Carol', email: null }]);
    expect(result?.contactNames).toEqual([{ id: '4', name: 'Dave', email: 'dave@x.com' }]);
    expect(result?.promoterNames).toEqual([{ id: '5', name: 'Erin', email: null }]);
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

  test('writes all four activity rollups via cluster-notebook', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);

    await saveRowData('Alpha', baseFormData, 'me@x.com');

    expect(mockUpdateActivitySummary).toHaveBeenCalledWith('Alpha', 'CHILDRENS_CLASS', { number: 1, participants: 2, participantsFof: 3 });
    expect(mockUpdateActivitySummary).toHaveBeenCalledWith('Alpha', 'JUNIOR_YOUTH_GROUP', { number: null, participants: null, participantsFof: null });
    expect(mockUpdateActivitySummary).toHaveBeenCalledWith('Alpha', 'STUDY_CIRCLE', { number: null, participants: null, participantsFof: null });
    expect(mockUpdateActivitySummary).toHaveBeenCalledWith('Alpha', 'DEVOTIONAL_GATHERING', { number: 5, participants: 40, participantsFof: 12 });
  });

  test('sends null fields to cluster-notebook when devotionals values are blank', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);

    const formData = { ...baseFormData, activities: { ...baseFormData.activities, devotionals: { act: '', part: '', fof: '' } } };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateActivitySummary).toHaveBeenCalledWith('Alpha', 'DEVOTIONAL_GATHERING', {
      number: null, participants: null, participantsFof: null,
    });
  });

  test('strips commas before sending devotionals counts to cluster-notebook', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);

    const formData = { ...baseFormData, activities: { ...baseFormData.activities, devotionals: { act: '1,200', part: '900', fof: '0' } } };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateActivitySummary).toHaveBeenCalledWith('Alpha', 'DEVOTIONAL_GATHERING', {
      number: 1200, participants: 900, participantsFof: 0,
    });
  });

  test('propagates a cluster-notebook write failure instead of reporting success', async () => {
    mockUpdateActivitySummary.mockRejectedValue(new Error('cluster-notebook has no nucleus named "Alpha" — activity summary not saved'));

    await expect(saveRowData('Alpha', baseFormData, 'me@x.com')).rejects.toThrow('cluster-notebook has no nucleus named "Alpha"');
  });

  test('writes stage/locality/makeup via cluster-notebook', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: 'Advanced/5', locality: 'Durham', populationMakeup: 'Students',
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      parentNucleus: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const formData = { ...baseFormData, stage: 'Advanced/5', locality: 'Durham', makeup: 'Students' };
    await saveRowData('Alpha', formData, 'me@x.com');

    // locality is intentionally absent here even though formData has it: cluster-notebook
    // removed NucleusPatch.locality 2026-09-13 (now read-only, derived from Nucleus.location).
    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', {
      stage: 'Advanced/5', populationMakeup: 'Students',
    });
  });

  test('writes population/households/connected* via cluster-notebook', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: 500, households: 120, connectedPopulation: 80, connectedHouseholds: 30,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      parentNucleus: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const formData = { ...baseFormData, totalPop: '500', totalHH: '120', indNum: '80', hhNum: '30' };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', {
      population: 500, households: 120, connectedPopulation: 80, connectedHouseholds: 30,
    });
  });

  test('writes presence/gatherings as tri-state booleans via cluster-notebook', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: true, socialActionDescription: 'Cleanup drive', hasCommunityGatherings: false, communityGatheringDescription: '',
      narrative: null,
      nucleusType: null,
      parentNucleus: null,
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
  });

  test('writes narrative via cluster-notebook', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: 'A growing community of practice.',
      nucleusType: null,
      parentNucleus: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const formData = { ...baseFormData, narrative: 'A growing community of practice.' };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', {
      narrative: 'A growing community of practice.',
    });
  });

  test('never patches nucleus/grouping/cluster/pg/clusterCode -- read-only, derived, or no rename support', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue(null);

    const formData = {
      ...baseFormData,
      // "Renamed" simulates an attempted rename via the (now read-only) Nucleus field --
      // cluster-notebook has no rename mutation, so this must never reach the patch either,
      // or the app would show a name the picker/cluster-notebook doesn't recognize.
      identity: {
        nucleus: 'Renamed', parentNucleus: 'Chapelboro', grouping: 'NC Eastern',
        cluster: 'NC-215 Triangle', pg: 'M3', clusterCode: 'NC-215', nucleusType: 'Neighborhood',
      },
    };
    await saveRowData('Alpha', formData, 'me@x.com');

    const patch = mockUpdateNucleus.mock.calls[0][1];
    expect(patch).not.toHaveProperty('nucleus');
    expect(patch).not.toHaveProperty('grouping');
    expect(patch).not.toHaveProperty('cluster');
    expect(patch).not.toHaveProperty('pg');
    expect(patch).not.toHaveProperty('clusterCode');
    // nucleusType/parentNucleusName ARE valid patch fields -- confirmed separately below.
    expect(patch).toEqual({ nucleusType: 'Neighborhood', parentNucleusName: 'Chapelboro' });
  });

  test('writes nucleusType via cluster-notebook', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null, nucleusType: 'Network',
      parentNucleus: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const formData = {
      ...baseFormData,
      identity: { nucleus: 'Alpha', nucleusType: 'Network' },
    };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', {
      nucleusType: 'Network',
    });
  });

  test('does not patch nucleusType when a save includes other identity fields but omits it', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: 'Advanced/5', locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null, nucleusType: null,
      parentNucleus: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    // identity present (admin save), but nucleusType/parentNucleus specifically omitted from it.
    const formData = {
      ...baseFormData,
      stage: 'Advanced/5',
      identity: { nucleus: 'Alpha' },
    };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', { stage: 'Advanced/5' });
  });

  test('writes parentNucleusName via cluster-notebook when identity.parentNucleus is set', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null, nucleusType: null,
      parentNucleus: { name: 'Chapelboro' },
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const formData = { ...baseFormData, identity: { nucleus: 'Alpha', parentNucleus: 'Chapelboro' } };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', { parentNucleusName: 'Chapelboro' });
  });

  test('clears parentNucleusName (sends explicit null) when identity.parentNucleus is emptied', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null, nucleusType: null,
      parentNucleus: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const formData = { ...baseFormData, identity: { nucleus: 'Alpha', parentNucleus: '' } };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', { parentNucleusName: null });
  });

  test('maps a never-touched presence/gatherings value to null, not false', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      parentNucleus: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const formData = { ...baseFormData, presence: '', gatherings: '' };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', {
      hasSocialAction: null, hasCommunityGatherings: null,
    });
  });

  test('omits patch fields the caller did not provide, rather than sending them as blank', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue({
      stage: 'Advanced/5', locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null,
      nucleusType: null,
      parentNucleus: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const formData: Record<string, unknown> = { ...baseFormData, stage: 'Advanced/5' };
    delete formData.makeup;
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Alpha', { stage: 'Advanced/5' });
  });

  test('does not call updateNucleus when no cluster-notebook-backed nucleus field is present', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);

    // baseFormData's own `locality` is never patchable (read-only, derived on
    // cluster-notebook's side) — plain baseFormData alone shouldn't trigger a call.
    await saveRowData('Alpha', baseFormData, 'me@x.com');

    expect(mockUpdateNucleus).not.toHaveBeenCalled();
  });

  test('returns fresh activities (including server-recomputed isOverridden) when activities were part of the save', async () => {
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockGetActivitySummaries.mockResolvedValue({
      childrensClasses: { number: 3, participants: null, participantsFof: null, isOverridden: true, facilitators: null, facilitatorNames: null },
      juniorYouthGroups: null, studyCircles: null, devotionalGathering: null,
    });

    const result = await saveRowData('Alpha', baseFormData, 'me@x.com');

    // Fetched AFTER the writes settle, not derived from what we sent -- cluster-notebook
    // recomputes isOverridden server-side, so the client can't know the new value otherwise.
    expect(mockGetActivitySummaries).toHaveBeenCalledWith('Alpha');
    expect(result.activities?.ccs).toEqual({ act: '3', part: '', fof: '', isOverridden: true });
  });

  test('omits activities from the result when the save did not touch any activity type', async () => {
    mockUpdateNucleus.mockResolvedValue({
      stage: 'Advanced/5', locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null, nucleusType: null,
      parentNucleus: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    const result = await saveRowData('Alpha', { stage: 'Advanced/5' }, 'me@x.com');

    expect(mockGetActivitySummaries).not.toHaveBeenCalled();
    expect(result.activities).toBeUndefined();
  });
});

describe('createRowData', () => {
  beforeEach(() => vi.clearAllMocks());

  const baseCreateFormData = {
    identity: { nucleus: 'Riverside', cluster: 'NC-215 Triangle' },
    activities: {
      ccs:  { act: '', part: '', fof: '' },
      jygs: { act: '', part: '', fof: '' },
      scs:  { act: '', part: '', fof: '' },
      devotionals: { act: '', part: '', fof: '' },
    },
  };

  test('creates via cluster-notebook', async () => {
    mockCreateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null, nucleusType: null,
      parentNucleus: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });

    await createRowData(baseCreateFormData, 'me@x.com');

    expect(mockCreateNucleus).toHaveBeenCalledWith('Riverside', 'NC-215 Triangle');
  });

  test('throws when nucleus name is missing', async () => {
    await expect(createRowData({ identity: { cluster: 'NC-215 Triangle' } }, 'me@x.com'))
      .rejects.toThrow('Nucleus name is required');
    expect(mockCreateNucleus).not.toHaveBeenCalled();
  });

  test('throws when cluster is missing', async () => {
    await expect(createRowData({ identity: { nucleus: 'Riverside' } }, 'me@x.com'))
      .rejects.toThrow('Cluster is required');
    expect(mockCreateNucleus).not.toHaveBeenCalled();
  });

  test('maps a duplicate-name error from cluster-notebook to the same CONFLICT code', async () => {
    mockCreateNucleus.mockRejectedValue(new Error("cluster-notebook GraphQL error: A nucleus named 'Riverside' already exists."));

    let caught: unknown;
    try {
      await createRowData(baseCreateFormData, 'me@x.com');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('already exists');
    expect((caught as { code?: string }).code).toBe('CONFLICT');
  });

  test('throws a BAD_CLUSTER-coded error when the cluster name is not found', async () => {
    mockCreateNucleus.mockResolvedValue(null);

    let caught: unknown;
    try {
      await createRowData(baseCreateFormData, 'me@x.com');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as { code?: string }).code).toBe('BAD_CLUSTER');
  });

  test('pushes activity and nucleus-patch writes through cluster-notebook, same as saveRowData', async () => {
    mockCreateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null, nucleusType: null,
      parentNucleus: null,
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });
    mockUpdateActivitySummary.mockResolvedValue(null);
    mockUpdateNucleus.mockResolvedValue(null);

    const formData = {
      ...baseCreateFormData,
      stage: 'Initial/2',
      activities: { ...baseCreateFormData.activities, ccs: { act: '1', part: '2', fof: '3' } },
    };
    await createRowData(formData, 'me@x.com');

    expect(mockUpdateActivitySummary).toHaveBeenCalledWith('Riverside', 'CHILDRENS_CLASS', { number: 1, participants: 2, participantsFof: 3 });
    expect(mockUpdateNucleus).toHaveBeenCalledWith('Riverside', { stage: 'Initial/2' });
  });

  test('pushes parentNucleusName through cluster-notebook when identity.parentNucleus is set', async () => {
    mockCreateNucleus.mockResolvedValue({
      stage: null, locality: null, populationMakeup: null,
      population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
      hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
      narrative: null, nucleusType: null,
      parentNucleus: { name: 'Chapelboro' },
      cluster: { name: 'NC-215 Triangle', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    });
    mockUpdateNucleus.mockResolvedValue(null);

    const formData = { ...baseCreateFormData, identity: { ...baseCreateFormData.identity, parentNucleus: 'Chapelboro' } };
    await createRowData(formData, 'me@x.com');

    expect(mockUpdateNucleus).toHaveBeenCalledWith('Riverside', { parentNucleusName: 'Chapelboro' });
  });
});

describe('deleteRowData', () => {
  beforeEach(() => vi.clearAllMocks());

  test('delegates entirely to cluster-notebook', async () => {
    mockDeleteNucleus.mockResolvedValue(true);

    const result = await deleteRowData('Alpha');

    expect(mockDeleteNucleus).toHaveBeenCalledWith('Alpha');
    expect(result).toBe(true);
  });

  test('returns false for a name that no longer has an active nucleus (idempotent delete)', async () => {
    mockDeleteNucleus.mockResolvedValue(false);

    const result = await deleteRowData('Nonexistent');

    expect(result).toBe(false);
  });
});

describe('facilitatorsFromClusterNotebook', () => {
  const blank: ActivitySummary = { number: null, participants: null, participantsFof: null, isOverridden: false, facilitators: null, facilitatorNames: null };

  test('returns empty string when summaries is null', () => {
    expect(facilitatorsFromClusterNotebook(null)).toBe('');
  });

  test('combines distinct non-empty facilitatorNames across all four activity types', () => {
    const result = facilitatorsFromClusterNotebook({
      childrensClasses: { ...blank, facilitatorNames: 'Alice' },
      juniorYouthGroups: { ...blank, facilitatorNames: 'Bob' },
      studyCircles: { ...blank, facilitatorNames: null },
      devotionalGathering: { ...blank, facilitatorNames: '' },
    });
    expect(result).toBe('Alice; Bob');
  });

  test('dedupes identical facilitatorNames across activity types', () => {
    const result = facilitatorsFromClusterNotebook({
      childrensClasses: { ...blank, facilitatorNames: 'Alice, Bob' },
      juniorYouthGroups: { ...blank, facilitatorNames: 'Alice, Bob' },
      studyCircles: null,
      devotionalGathering: null,
    });
    expect(result).toBe('Alice, Bob');
  });

  test('returns empty string when no activity type has facilitatorNames', () => {
    const result = facilitatorsFromClusterNotebook({
      childrensClasses: blank, juniorYouthGroups: null, studyCircles: null, devotionalGathering: null,
    });
    expect(result).toBe('');
  });
});

describe('facilitatorsCountFromClusterNotebook', () => {
  const blank: ActivitySummary = { number: null, participants: null, participantsFof: null, isOverridden: false, facilitators: null, facilitatorNames: null };

  test('returns empty string when summaries is null', () => {
    expect(facilitatorsCountFromClusterNotebook(null)).toBe('');
  });

  test('sums facilitators across all four activity types', () => {
    const result = facilitatorsCountFromClusterNotebook({
      childrensClasses: { ...blank, facilitators: 2 },
      juniorYouthGroups: { ...blank, facilitators: 1 },
      studyCircles: { ...blank, facilitators: null },
      devotionalGathering: { ...blank, facilitators: 3 },
    });
    expect(result).toBe('6');
  });

  test('returns empty string when no activity type has a facilitators count', () => {
    const result = facilitatorsCountFromClusterNotebook({
      childrensClasses: blank, juniorYouthGroups: null, studyCircles: null, devotionalGathering: null,
    });
    expect(result).toBe('');
  });
});
