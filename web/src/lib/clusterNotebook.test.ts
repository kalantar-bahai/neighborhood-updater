import { describe, test, expect, vi, beforeEach } from 'vitest';
import { getDevotionalGathering, updateDevotionalGathering, getAllNuclei, getNucleusFields, updateNucleus } from './clusterNotebook';

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
  test('returns the full nucleus list with fields, nucleusType, and devotionalGathering', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: {
        nuclei: [
          { name: 'Alpha', stage: 'Initial/2', locality: 'Durham', populationMakeup: 'Mixed', nucleusType: 'Neighborhood', devotionalGathering: { number: 4, participants: 30, participantsFof: 10 } },
          { name: 'Beta', stage: null, locality: null, populationMakeup: null, nucleusType: null, devotionalGathering: null },
        ],
      },
    }));

    const result = await getAllNuclei();

    expect(result).toEqual([
      { name: 'Alpha', stage: 'Initial/2', locality: 'Durham', populationMakeup: 'Mixed', nucleusType: 'Neighborhood', devotionalGathering: { number: 4, participants: 30, participantsFof: 10 } },
      { name: 'Beta', stage: null, locality: null, populationMakeup: null, nucleusType: null, devotionalGathering: null },
    ]);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.query).toContain('nucleusType');
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
          cluster: { name: 'NC-215 Triangle', groupOfClusters: 'NC Eastern', growthMilestone: 'IPG Embracing Large Numbers' },
        },
      },
    }));

    const result = await getNucleusFields('Alpha');

    expect(result?.cluster).toEqual({ name: 'NC-215 Triangle', groupOfClusters: 'NC Eastern', growthMilestone: 'IPG Embracing Large Numbers' });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.query).toContain('cluster { name groupOfClusters growthMilestone }');
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
});

describe('getDevotionalGathering', () => {
  test('sends a query for the nucleus and returns its devotionalGathering', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { nucleus: { devotionalGathering: { number: 4, participants: 30, participantsFof: 10 } } },
    }));

    const result = await getDevotionalGathering('Alpha');

    expect(result).toEqual({ number: 4, participants: 30, participantsFof: 10 });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000');
    const body = JSON.parse(init.body as string);
    expect(body.variables).toEqual({ name: 'Alpha' });
    expect(body.query).toContain('devotionalGathering');
  });

  test('returns null when the nucleus is not found', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { nucleus: null } }));

    const result = await getDevotionalGathering('Nonexistent');

    expect(result).toBeNull();
  });

  test('returns null when devotionalGathering itself is null', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { nucleus: { devotionalGathering: null } } }));

    const result = await getDevotionalGathering('Alpha');

    expect(result).toBeNull();
  });

  test('throws when the HTTP response is not ok', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, false, 500));

    await expect(getDevotionalGathering('Alpha')).rejects.toThrow('cluster-notebook request failed: 500');
  });

  test('throws when the response contains GraphQL errors', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ errors: [{ message: 'nucleus name is required' }] }));

    await expect(getDevotionalGathering('Alpha')).rejects.toThrow('nucleus name is required');
  });
});

describe('updateDevotionalGathering', () => {
  test('sends the shared updateActivitySummary mutation with the given fields and returns the updated value', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { updateActivitySummary: { devotionalGathering: { number: 5, participants: 40, participantsFof: 12 } } },
    }));

    const result = await updateDevotionalGathering('Alpha', { number: 5, participants: 40, participantsFof: 12 });

    expect(result).toEqual({ number: 5, participants: 40, participantsFof: 12 });
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.variables).toEqual({ nucleusName: 'Alpha', number: 5, participants: 40, participantsFof: 12 });
    expect(body.query).toContain('updateActivitySummary');
    expect(body.query).toContain('DEVOTIONAL_GATHERING');
  });

  test('defaults omitted fields to null', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { updateActivitySummary: { devotionalGathering: { number: null, participants: null, participantsFof: null } } },
    }));

    await updateDevotionalGathering('Alpha', {});

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.variables).toEqual({ nucleusName: 'Alpha', number: null, participants: null, participantsFof: null });
  });

  test('throws when the mutation returns null (no matching nucleus)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { updateActivitySummary: null } }));

    await expect(updateDevotionalGathering('Nonexistent', { number: 5 })).rejects.toThrow('cluster-notebook has no nucleus named "Nonexistent"');
  });
});
