import { describe, test, expect } from 'vitest';
import { clusterNotebookErrorResponse } from './clusterNotebookError';
import { ClusterNotebookForbiddenError } from './clusterNotebook';

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
});
