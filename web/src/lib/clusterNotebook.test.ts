import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ getToken: vi.fn(async () => 'test-token') })),
}));

import {
  getActivitySummaries, updateActivitySummary, getAllNuclei, getNucleusFields, updateNucleus,
  searchIndividuals, createIndividual, getNucleusWorkers, updateNucleusWorkers, individualDisplayName,
  getClusters, createNucleus, deleteNucleus,
} from './clusterNotebook';
import type { Individual } from './clusterNotebook';
import { auth } from '@clerk/nextjs/server';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mockFetch);
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
  };
}

describe('getAllNuclei', () => {
  test('returns the full nucleus list with fields, nucleusType, cluster, and all four activity rollups', async () => {
    const alphaActivities = { number: 4, participants: 30, participantsFof: 10, isOverridden: true };
    mockFetch.mockResolvedValue(jsonResponse({
      data: {
        nuclei: [
          {
            name: 'Alpha', stage: 'Initial/2', locality: 'Durham', populationMakeup: 'Mixed', nucleusType: 'Neighborhood',
            devotionalGathering: alphaActivities, childrensClasses: alphaActivities, juniorYouthGroups: alphaActivities, studyCircles: alphaActivities,
            cluster: { name: 'NC-215 Triangle', groupOfClusters: 'NC Eastern', growthMilestone: 'IPG Embracing Large Numbers', auxiliaryBoardMembers: null },
            parentNucleus: { name: 'Chapelboro' },
          },
          {
            name: 'Beta', stage: null, locality: null, populationMakeup: null, nucleusType: null,
            devotionalGathering: null, childrensClasses: null, juniorYouthGroups: null, studyCircles: null,
            cluster: { name: 'NC-330 Foothills', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
            parentNucleus: null,
          },
        ],
      },
    }));

    const result = await getAllNuclei();

    expect(result[0].childrensClasses).toEqual(alphaActivities);
    expect(result[0].juniorYouthGroups).toEqual(alphaActivities);
    expect(result[0].studyCircles).toEqual(alphaActivities);
    expect(result[0].cluster).toEqual({ name: 'NC-215 Triangle', groupOfClusters: 'NC Eastern', growthMilestone: 'IPG Embracing Large Numbers', auxiliaryBoardMembers: null });
    expect(result[0].parentNucleus).toEqual({ name: 'Chapelboro' });
    expect(result[1].childrensClasses).toBeNull();
    expect(result[1].cluster.groupOfClusters).toBeNull();
    expect(result[1].parentNucleus).toBeNull();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.query).toContain('nucleusType');
    expect(body.query).toContain('childrensClasses');
    expect(body.query).toContain('juniorYouthGroups');
    expect(body.query).toContain('studyCircles');
    expect(body.query).toContain('cluster { name groupOfClusters growthMilestone auxiliaryBoardMembers }');
    expect(body.query).toContain('parentNucleus { name }');
  });

  test('returns an empty array when there are no nuclei', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { nuclei: [] } }));

    const result = await getAllNuclei();

    expect(result).toEqual([]);
  });

  test('throws when the request fails', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, false, 500));

    await expect(getAllNuclei()).rejects.toThrow('cluster-notebook request failed: 500');
  });
});

describe('getClusters', () => {
  test('returns the full cluster list', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: {
        clusters: [
          { name: 'NC-215 Triangle', groupOfClusters: 'NC Eastern', growthMilestone: 'IPG Embracing Large Numbers', auxiliaryBoardMembers: 'Pat Doe (Propagation)' },
          { name: 'NC-330 Foothills', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
        ],
      },
    }));

    const result = await getClusters();

    expect(result).toEqual([
      { name: 'NC-215 Triangle', groupOfClusters: 'NC Eastern', growthMilestone: 'IPG Embracing Large Numbers', auxiliaryBoardMembers: 'Pat Doe (Propagation)' },
      { name: 'NC-330 Foothills', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
    ]);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.query).toContain('clusters {');
  });

  test('returns an empty array when there are no clusters', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { clusters: [] } }));

    const result = await getClusters();

    expect(result).toEqual([]);
  });
});

describe('createNucleus', () => {
  test('sends name and clusterName, returns the created nucleus fields', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: {
        createNucleus: {
          stage: null, locality: null, populationMakeup: null,
          population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
          hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
          narrative: null, nucleusType: null,
          cluster: { name: 'NC-215 Triangle', groupOfClusters: 'NC Eastern', growthMilestone: 'IPG Embracing Large Numbers', auxiliaryBoardMembers: null },
        },
      },
    }));

    const result = await createNucleus('Airport Gardens', 'NC-215 Triangle');

    expect(result?.cluster.name).toBe('NC-215 Triangle');
    expect(result?.stage).toBeNull();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables).toEqual({ name: 'Airport Gardens', clusterName: 'NC-215 Triangle' });
  });

  test('returns null when the cluster name is not found', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { createNucleus: null } }));

    const result = await createNucleus('Airport Gardens', 'Nonexistent Cluster');

    expect(result).toBeNull();
  });

  test('throws (does not return null) when the name is already taken', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      errors: [{ message: "A nucleus named 'Airport Gardens' already exists." }],
    }));

    await expect(createNucleus('Airport Gardens', 'NC-215 Triangle')).rejects.toThrow('already exists');
  });
});

describe('deleteNucleus', () => {
  test('sends the name and returns true on success', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { deleteNucleus: true } }));

    const result = await deleteNucleus('Riverside');

    expect(result).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables).toEqual({ name: 'Riverside' });
    expect(body.query).toContain('deleteNucleus(name: $name)');
  });

  test('returns false for a name with no active nucleus (never existed or already deleted)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { deleteNucleus: false } }));

    const result = await deleteNucleus('Nonexistent');

    expect(result).toBe(false);
  });

  test('throws when the request fails', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, false, 500));

    await expect(deleteNucleus('Riverside')).rejects.toThrow('cluster-notebook request failed: 500');
  });
});

describe('getNucleusFields', () => {
  test('returns stage/locality/populationMakeup for the nucleus', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { nucleus: { stage: 'Advanced/5', locality: 'Chapel Hill', populationMakeup: 'Students' } },
    }));

    const result = await getNucleusFields('Alpha');

    expect(result).toEqual({ stage: 'Advanced/5', locality: 'Chapel Hill', populationMakeup: 'Students' });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables).toEqual({ name: 'Alpha' });
  });

  test('returns null when the nucleus is not found', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { nucleus: null } }));

    const result = await getNucleusFields('Nonexistent');

    expect(result).toBeNull();
  });

  test('requests and returns the nested cluster fields (read-only, no mutation)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: {
        nucleus: {
          stage: null, locality: null, populationMakeup: null,
          cluster: {
            name: 'NC-215 Triangle', groupOfClusters: 'NC Eastern', growthMilestone: 'IPG Embracing Large Numbers',
            auxiliaryBoardMembers: 'Pat Doe (Propagation), Sam Roe (Protection)',
          },
        },
      },
    }));

    const result = await getNucleusFields('Alpha');

    expect(result?.cluster).toEqual({
      name: 'NC-215 Triangle', groupOfClusters: 'NC Eastern', growthMilestone: 'IPG Embracing Large Numbers',
      auxiliaryBoardMembers: 'Pat Doe (Propagation), Sam Roe (Protection)',
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.query).toContain('cluster { name groupOfClusters growthMilestone auxiliaryBoardMembers }');
  });

  test('returns population/households/connected* fields', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: {
        nucleus: {
          stage: null, locality: null, populationMakeup: null,
          population: 500, households: 120, connectedPopulation: 80, connectedHouseholds: 30,
        },
      },
    }));

    const result = await getNucleusFields('Alpha');

    expect(result).toEqual({
      stage: null, locality: null, populationMakeup: null,
      population: 500, households: 120, connectedPopulation: 80, connectedHouseholds: 30,
    });
  });

  test('requests and returns the parentNucleus field (pocket grouping, null when unset)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: {
        nucleus: {
          stage: null, locality: null, populationMakeup: null,
          parentNucleus: { name: 'Chapelboro' },
        },
      },
    }));

    const result = await getNucleusFields('Alpha');

    expect(result?.parentNucleus).toEqual({ name: 'Chapelboro' });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.query).toContain('parentNucleus { name }');
  });
});

describe('updateNucleus', () => {
  test('sends only the provided patch fields and returns the updated value', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { updateNucleus: { stage: 'Advanced/5', locality: 'Durham', populationMakeup: 'Students' } },
    }));

    const result = await updateNucleus('Alpha', { stage: 'Advanced/5', populationMakeup: 'Students' });

    expect(result).toEqual({ stage: 'Advanced/5', locality: 'Durham', populationMakeup: 'Students' });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables).toEqual({ name: 'Alpha', patch: { stage: 'Advanced/5', populationMakeup: 'Students' } });
  });

  test('locality is not a valid patch field — cluster-notebook removed it 2026-09-13 (now read-only, derived)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      errors: [{ message: "Field 'locality' is not defined by type 'NucleusPatch'." }],
    }));

    // @ts-expect-error locality is intentionally not part of the patch type anymore
    await expect(updateNucleus('Alpha', { locality: 'Durham' })).rejects.toThrow("Field 'locality' is not defined");
  });

  test('omits patch fields the caller did not provide, rather than sending null', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { updateNucleus: { stage: 'Advanced/5', locality: null, populationMakeup: null } },
    }));

    await updateNucleus('Alpha', { stage: 'Advanced/5' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables.patch).toEqual({ stage: 'Advanced/5' });
    expect('locality' in body.variables.patch).toBe(false);
    expect('populationMakeup' in body.variables.patch).toBe(false);
  });

  test('throws when the mutation returns null (no matching nucleus)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { updateNucleus: null } }));

    await expect(updateNucleus('Nonexistent', { stage: 'Advanced/5' })).rejects.toThrow('cluster-notebook has no nucleus named "Nonexistent"');
  });

  test('sends population/households/connected* fields, including explicit null to clear', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: {
        updateNucleus: {
          stage: null, locality: null, populationMakeup: null,
          population: 500, households: 120, connectedPopulation: 80, connectedHouseholds: null,
        },
      },
    }));

    const result = await updateNucleus('Alpha', {
      population: 500, households: 120, connectedPopulation: 80, connectedHouseholds: null,
    });

    expect(result).toEqual({
      stage: null, locality: null, populationMakeup: null,
      population: 500, households: 120, connectedPopulation: 80, connectedHouseholds: null,
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables.patch).toEqual({
      population: 500, households: 120, connectedPopulation: 80, connectedHouseholds: null,
    });
  });

  test('sends the tri-state social-action/gatherings booleans, including explicit false', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: {
        updateNucleus: {
          stage: null, locality: null, populationMakeup: null,
          population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
          hasSocialAction: true, socialActionDescription: 'Cleanup drive', hasCommunityGatherings: false, communityGatheringDescription: null,
        },
      },
    }));

    const result = await updateNucleus('Alpha', {
      hasSocialAction: true, socialActionDescription: 'Cleanup drive', hasCommunityGatherings: false,
    });

    expect(result?.hasSocialAction).toBe(true);
    expect(result?.hasCommunityGatherings).toBe(false);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables.patch).toEqual({
      hasSocialAction: true, socialActionDescription: 'Cleanup drive', hasCommunityGatherings: false,
    });
    expect('communityGatheringDescription' in body.variables.patch).toBe(false);
  });

  test('sends the narrative field', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: {
        updateNucleus: {
          stage: null, locality: null, populationMakeup: null,
          population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
          hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
          narrative: 'A growing community of practice.',
        },
      },
    }));

    const result = await updateNucleus('Alpha', { narrative: 'A growing community of practice.' });

    expect(result?.narrative).toBe('A growing community of practice.');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables.patch).toEqual({ narrative: 'A growing community of practice.' });
  });

  test('sends the nucleusType field', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: {
        updateNucleus: {
          stage: null, locality: null, populationMakeup: null,
          population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
          hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
          narrative: null, nucleusType: 'Network',
        },
      },
    }));

    const result = await updateNucleus('Alpha', { nucleusType: 'Network' });

    expect(result?.nucleusType).toBe('Network');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables.patch).toEqual({ nucleusType: 'Network' });
  });

  test('sends the parentNucleusName field, including explicit null to clear it', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: {
        updateNucleus: {
          stage: null, locality: null, populationMakeup: null,
          population: null, households: null, connectedPopulation: null, connectedHouseholds: null,
          hasSocialAction: null, socialActionDescription: null, hasCommunityGatherings: null, communityGatheringDescription: null,
          narrative: null, nucleusType: null, parentNucleus: null,
        },
      },
    }));

    await updateNucleus('Alpha', { parentNucleusName: null });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables.patch).toEqual({ parentNucleusName: null });
  });
});

describe('getActivitySummaries', () => {
  test('sends a query for the nucleus and returns all four activity rollups', async () => {
    const summary = { number: 4, participants: 30, participantsFof: 10, isOverridden: false };
    mockFetch.mockResolvedValue(jsonResponse({
      data: { nucleus: { devotionalGathering: summary, childrensClasses: summary, juniorYouthGroups: summary, studyCircles: summary } },
    }));

    const result = await getActivitySummaries('Alpha');

    expect(result).toEqual({ devotionalGathering: summary, childrensClasses: summary, juniorYouthGroups: summary, studyCircles: summary });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000');
    const body = JSON.parse(init.body as string);
    expect(body.variables).toEqual({ name: 'Alpha' });
    expect(body.query).toContain('devotionalGathering');
    expect(body.query).toContain('childrensClasses');
    expect(body.query).toContain('juniorYouthGroups');
    expect(body.query).toContain('studyCircles');
    expect(body.query).toContain('isOverridden');
  });

  test('returns null when the nucleus is not found', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { nucleus: null } }));

    const result = await getActivitySummaries('Nonexistent');

    expect(result).toBeNull();
  });

  test('throws when the HTTP response is not ok', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, false, 500));

    await expect(getActivitySummaries('Alpha')).rejects.toThrow('cluster-notebook request failed: 500');
  });

  test('throws when the response contains GraphQL errors', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ errors: [{ message: 'nucleus name is required' }] }));

    await expect(getActivitySummaries('Alpha')).rejects.toThrow('nucleus name is required');
  });
});

describe('updateActivitySummary', () => {
  test('sends the mutation with the activity type and fields, and returns all four rollups', async () => {
    const updated = { number: 5, participants: 40, participantsFof: 12, isOverridden: true };
    mockFetch.mockResolvedValue(jsonResponse({
      data: { updateActivitySummary: { devotionalGathering: updated, childrensClasses: null, juniorYouthGroups: null, studyCircles: null } },
    }));

    const result = await updateActivitySummary('Alpha', 'DEVOTIONAL_GATHERING', { number: 5, participants: 40, participantsFof: 12 });

    expect(result?.devotionalGathering).toEqual(updated);
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.variables).toEqual({ nucleusName: 'Alpha', activityType: 'DEVOTIONAL_GATHERING', number: 5, participants: 40, participantsFof: 12 });
    expect(body.query).toContain('updateActivitySummary');
  });

  test('sends the singular ActivityType enum value for each activity type', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { updateActivitySummary: { devotionalGathering: null, childrensClasses: null, juniorYouthGroups: null, studyCircles: null } },
    }));

    await updateActivitySummary('Alpha', 'CHILDRENS_CLASS', { number: 2 });
    await updateActivitySummary('Alpha', 'JUNIOR_YOUTH_GROUP', { number: 3 });
    await updateActivitySummary('Alpha', 'STUDY_CIRCLE', { number: 1 });

    const activityTypes = mockFetch.mock.calls.map(call => JSON.parse(call[1].body as string).variables.activityType);
    expect(activityTypes).toEqual(['CHILDRENS_CLASS', 'JUNIOR_YOUTH_GROUP', 'STUDY_CIRCLE']);
  });

  test('defaults omitted fields to null', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { updateActivitySummary: { devotionalGathering: null, childrensClasses: null, juniorYouthGroups: null, studyCircles: null } },
    }));

    await updateActivitySummary('Alpha', 'DEVOTIONAL_GATHERING', {});

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.variables).toEqual({ nucleusName: 'Alpha', activityType: 'DEVOTIONAL_GATHERING', number: null, participants: null, participantsFof: null });
  });

  test('throws when the mutation returns null (no matching nucleus)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { updateActivitySummary: null } }));

    await expect(updateActivitySummary('Nonexistent', 'DEVOTIONAL_GATHERING', { number: 5 })).rejects.toThrow('cluster-notebook has no nucleus named "Nonexistent"');
  });
});

describe('individualDisplayName', () => {
  test('joins first/middle/family names', () => {
    const ind: Individual = { id: '1', firstName: 'Jane', middleNames: 'Q', familyName: 'Doe', nickname: null, sex: null, phone: null, email: null, ageCategory: null };
    expect(individualDisplayName(ind)).toBe('Jane Q Doe');
  });

  test('appends nickname in parentheses when present', () => {
    const ind: Individual = { id: '1', firstName: 'Jane', middleNames: null, familyName: 'Doe', nickname: 'JJ', sex: null, phone: null, email: null, ageCategory: null };
    expect(individualDisplayName(ind)).toBe('Jane Doe (JJ)');
  });

  test('falls back to (unnamed) when no name parts exist', () => {
    const ind: Individual = { id: '1', firstName: null, middleNames: null, familyName: null, nickname: null, sex: null, phone: null, email: null, ageCategory: null };
    expect(individualDisplayName(ind)).toBe('(unnamed)');
  });
});

describe('searchIndividuals', () => {
  test('sends the nucleusName and search term, scoped to that nucleus\'s cluster', async () => {
    const alice: Individual = { id: '1', firstName: 'Alice', familyName: 'Smith', middleNames: null, nickname: null, sex: null, phone: null, email: null, ageCategory: 'Adult' };
    mockFetch.mockResolvedValue(jsonResponse({ data: { individuals: [alice] } }));

    const result = await searchIndividuals('Alpha', 'Ali');

    expect(result).toEqual([alice]);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables).toEqual({ nucleusName: 'Alpha', search: 'Ali' });
  });

  test('sends null search when omitted', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { individuals: [] } }));

    await searchIndividuals('Alpha');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables).toEqual({ nucleusName: 'Alpha', search: null });
  });
});

describe('createIndividual', () => {
  test('sends name and nucleusName, returns the created individual', async () => {
    const created: Individual = { id: '99', firstName: 'New Person', familyName: null, middleNames: null, nickname: null, sex: null, phone: null, email: null, ageCategory: null };
    mockFetch.mockResolvedValue(jsonResponse({ data: { createIndividual: created } }));

    const result = await createIndividual('New Person', 'Alpha');

    expect(result).toEqual(created);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables).toEqual({ name: 'New Person', nucleusName: 'Alpha' });
  });

  test('throws when the nucleus is not found', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { createIndividual: null } }));

    await expect(createIndividual('New Person', 'Nonexistent')).rejects.toThrow('cluster-notebook has no nucleus named "Nonexistent"');
  });
});

describe('getNucleusWorkers', () => {
  test('returns the workers for the given role', async () => {
    const bob: Individual = { id: '2', firstName: 'Bob', familyName: null, middleNames: null, nickname: null, sex: null, phone: null, email: null, ageCategory: null };
    mockFetch.mockResolvedValue(jsonResponse({ data: { nucleus: { workers: [bob] } } }));

    const result = await getNucleusWorkers('Alpha', 'accompanier');

    expect(result).toEqual([bob]);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables).toEqual({ name: 'Alpha', role: 'accompanier' });
  });

  test('returns an empty array when the nucleus is not found', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { nucleus: null } }));

    const result = await getNucleusWorkers('Nonexistent', 'accompanier');

    expect(result).toEqual([]);
  });
});

describe('updateNucleusWorkers', () => {
  test('sends the full ordered personIds list and returns the updated workers', async () => {
    const bob: Individual = { id: '2', firstName: 'Bob', familyName: null, middleNames: null, nickname: null, sex: null, phone: null, email: null, ageCategory: null };
    mockFetch.mockResolvedValue(jsonResponse({ data: { updateNucleusWorkers: { workers: [bob] } } }));

    const result = await updateNucleusWorkers('Alpha', 'accompanier', ['2']);

    expect(result).toEqual([bob]);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables).toEqual({ name: 'Alpha', role: 'accompanier', personIds: ['2'] });
  });

  test('throws when the mutation returns null (no matching nucleus)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { updateNucleusWorkers: null } }));

    await expect(updateNucleusWorkers('Nonexistent', 'accompanier', [])).rejects.toThrow('cluster-notebook has no nucleus named "Nonexistent"');
  });
});

describe('request (token forwarding)', () => {
  test('forwards the Clerk session token as a bearer Authorization header', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { clusters: [] } }));
    await getClusters();
    const [, init] = mockFetch.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  test('sends the request unauthenticated and warns when no Clerk session token is available', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(auth).mockResolvedValueOnce({ getToken: vi.fn(async () => null) } as never);
    mockFetch.mockResolvedValue(jsonResponse({ data: { clusters: [] } }));

    await expect(getClusters()).resolves.toEqual([]);

    const [, init] = mockFetch.mock.calls[0];
    expect('Authorization' in (init.headers as Record<string, string>)).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
