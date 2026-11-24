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
    ['LOCATION_NOT_FOUND', 400, "That place doesn't exist any more. Reload and try again."],
    ['NOT_A_PLACE', 400, 'People can only be moved to a locality or a neighbourhood in SRP.'],
    ['SELF_LOCKOUT', 409, "You can't end your own last admin role here."],
    ['UNKNOWN_ROLE', 400, "That role can't be given here."],
    ['ENTITY_REQUIRED', 400, 'Choose where the role applies.'],
    ['NOT_FOUND', 404, 'Not found.'],
    ['EMAIL_IN_USE', 409, 'This address belongs to someone else.'],
    ['ALREADY_HAS_ACCESS', 409, '{name} already has access.'],
    ['INVITATION_PENDING', 409, 'An invitation is already pending; resend it instead.'],
    ['NOT_PENDING', 409, 'This invitation is no longer pending.'],
    ['BAD_INPUT', 400, 'upstream: 3 groups in use'],
    ['CLERK_ERROR', 502, "The invitation email couldn't be sent. Try again."],
    ['CLERK_NOT_CONFIGURED', 503, "Invitations aren't set up yet."],
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

  test('a route can word its own 403', async () => {
    const res = clusterNotebookErrorResponse(new ClusterNotebookForbiddenError('x'), { forbidden: 'Nope.' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Nope.' });
  });

  test('fills {name} and keeps the code', async () => {
    const res = clusterNotebookErrorResponse(new ClusterNotebookCodedError('m', 'ALREADY_HAS_ACCESS', 'u'), { name: 'Ana Lopez' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Ana Lopez already has access.', code: 'ALREADY_HAS_ACCESS' });
  });
});
