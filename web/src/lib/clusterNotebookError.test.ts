import { describe, test, expect } from 'vitest';
import { clusterNotebookErrorResponse } from './clusterNotebookError';
import { ClusterNotebookCodedError, ClusterNotebookForbiddenError } from './clusterNotebook';

describe('clusterNotebookErrorResponse', () => {
  test('maps ClusterNotebookForbiddenError to a 403 with our own message, not cluster-notebook\'s raw text', async () => {
    const res = clusterNotebookErrorResponse(new ClusterNotebookForbiddenError('cluster-notebook denied this request (FORBIDDEN)'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "You don't have permission to make this change." });
  });

  test('maps any other Error to a 502 with the raw message', async () => {
    const res = clusterNotebookErrorResponse(new Error('cluster-notebook request failed: 500 Internal Server Error'));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ error: 'cluster-notebook request failed: 500 Internal Server Error' });
  });

  test('maps a non-Error throw to a 502 with a generic message', async () => {
    const res = clusterNotebookErrorResponse('not an Error object');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unexpected error contacting cluster-notebook' });
  });

  test.each([
    ['NAME_TAKEN', 409, 'That name is already used by another nucleus.'],
    ['SRP_NAME_CLASH', 409, 'That name is already used in this locality (in SRP or here).'],
    ['SRP_ACTION_PENDING', 409, 'An SRP change for this nucleus is still pending. Try again once it finishes.'],
    ['SRP_ALREADY_LINKED', 409, 'This nucleus is already in SRP.'],
    ['SRP_NOT_AT_LOCALITY', 400, 'Choose a locality for this nucleus before sending it to SRP.'],
    ['SRP_NOT_NEIGHBORHOOD', 400, 'Only Neighborhood nuclei can be sent to SRP.'],
    ['SRP_IS_NEIGHBOURHOOD', 409, 'upstream: 3 groups in use'],
    ['SRP_NOT_DEFAULT', 409, "This nucleus isn't the home nucleus of its SRP neighbourhood, so it can't be changed in SRP from here."],
    ['SRP_FN_HAS_NO_HOME', 409, 'This neighbourhood in SRP has no home nucleus. Ask an admin.'],
    ['SOMETHING_NEW', 502, 'cluster-notebook GraphQL error: upstream: 3 groups in use'],
  ])('maps coded error %s to status %i with { error, code }', async (code, status, error) => {
    const res = clusterNotebookErrorResponse(new ClusterNotebookCodedError('cluster-notebook GraphQL error: upstream: 3 groups in use', code, 'upstream: 3 groups in use'));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error, code });
  });

  test.each(['SRP_IS_NEIGHBOURHOOD'])('%s shows the raw upstream text without the log prefix', async (code) => {
    const res = clusterNotebookErrorResponse(new ClusterNotebookCodedError('cluster-notebook GraphQL error: raw text', code, 'raw text'));
    expect((await res.json()).error).toBe('raw text');
  });
});
