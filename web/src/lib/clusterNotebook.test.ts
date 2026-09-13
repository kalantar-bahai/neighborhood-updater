import { describe, test, expect, vi, beforeEach } from 'vitest';
import { getDevotionalGathering, updateDevotionalGathering } from './clusterNotebook';

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
  test('sends a mutation with the given fields and returns the updated value', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { updateDevotionalGathering: { devotionalGathering: { number: 5, participants: 40, participantsFof: 12 } } },
    }));

    const result = await updateDevotionalGathering('Alpha', { number: 5, participants: 40, participantsFof: 12 });

    expect(result).toEqual({ number: 5, participants: 40, participantsFof: 12 });
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.variables).toEqual({ nucleusName: 'Alpha', number: 5, participants: 40, participantsFof: 12 });
  });

  test('defaults omitted fields to null', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { updateDevotionalGathering: { devotionalGathering: { number: null, participants: null, participantsFof: null } } },
    }));

    await updateDevotionalGathering('Alpha', {});

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.variables).toEqual({ nucleusName: 'Alpha', number: null, participants: null, participantsFof: null });
  });

  test('throws when the mutation returns null (no matching nucleus)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { updateDevotionalGathering: null } }));

    await expect(updateDevotionalGathering('Nonexistent', { number: 5 })).rejects.toThrow('cluster-notebook has no nucleus named "Nonexistent"');
  });
});
