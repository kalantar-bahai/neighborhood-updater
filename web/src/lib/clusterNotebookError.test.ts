import { describe, test, expect } from 'vitest';
import { clusterNotebookErrorResponse } from './clusterNotebookError';
import { ClusterNotebookCodedError, ClusterNotebookForbiddenError } from './clusterNotebook';
import { ACCOUNT_MESSAGES } from './accessRoute';

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
    ['ALREADY_HAS_ACCESS', 409, 'That person already has access.'],
    ['INVITATION_PENDING', 409, 'An invitation is already pending; resend it instead.'],
    ['NOT_PENDING', 409, 'This invitation is no longer pending.'],
    ['BAD_INPUT', 400, 'upstream: 3 groups in use'],
    ['CLERK_ERROR', 502, "The invitation email couldn't be sent. Try again."],
    ['CLERK_NOT_CONFIGURED', 503, "Invitations aren't set up yet."],
    ['HAS_MEMBERS', 409, 'This nucleus has members. Choose whether to move them in or end their memberships.'],
    ['NEEDS_LOCALITY', 400, 'Choose a locality first. A Neighborhood must be in a locality.'],
    ['MEMBER_ON_NEIGHBORHOOD', 400, "A Neighborhood's people are its residents. Tick Resident instead."],
    ['PARENT_CYCLE', 400, "A nucleus can't be its own parent, or be placed under one of its own pockets."],
    ['PARENT_OTHER_CLUSTER', 400, 'A parent nucleus must be in the same cluster.'],
    ['CONTACT_MUST_STAY', 409, "That person is their family's contact. Make someone else the contact first."],
    ['ALREADY_IN_HOUSEHOLD', 409, "That person's family changed. The list has been refreshed; try again."],
    ['NOT_IN_HOUSEHOLD', 409, "That person's family changed. The list has been refreshed; try again."],
    ['NOT_A_MEMBER', 409, "That person isn't in this family any more. The list has been refreshed."],
    ['DIFFERENT_PLACE', 409, 'That person lives somewhere else. Move them here first (People card).'],
    ['HOUSEHOLD_NOT_FOUND', 409, 'That family or person no longer exists. The list has been refreshed.'],
    ['INDIVIDUAL_NOT_FOUND', 409, 'That family or person no longer exists. The list has been refreshed.'],
    ['PARENT_FORBIDDEN', 403, "You can't put a nucleus under one you can't edit."],
    ['SOMETHING_NEW', 502, 'cluster-notebook GraphQL error: upstream: 3 groups in use'],
  ])('maps coded error %s to status %i with { error, code }', async (code, status, error) => {
    const res = clusterNotebookErrorResponse(new ClusterNotebookCodedError('cluster-notebook GraphQL error: upstream: 3 groups in use', code, 'upstream: 3 groups in use'));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error, code });
  });

  test('MOVE_REFUSED counts the people from extensions.people', async () => {
    const err = new ClusterNotebookCodedError('m', 'MOVE_REFUSED', 'u', { people: [{ id: 'p1', code: 'FORBIDDEN' }, { id: 'p2', code: 'OTHER_CLUSTER' }] });
    const res = clusterNotebookErrorResponse(err);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "You can't move 2 of its members (another cluster, or no permission). Nothing changed.", code: 'MOVE_REFUSED' });
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

  test('household messages use the name when given, "That person" otherwise', async () => {
    const err = () => new ClusterNotebookCodedError('m', 'NOT_IN_HOUSEHOLD', 'u');
    expect((await clusterNotebookErrorResponse(err(), { name: 'Test Person' }).json()).error).toBe("Test Person's family changed. The list has been refreshed; try again.");
    expect((await clusterNotebookErrorResponse(err()).json()).error).toBe("That person's family changed. The list has been refreshed; try again.");
  });

  test('the accounts route rewords SELF_LOCKOUT; the global text stays elsewhere', async () => {
    const err = () => new ClusterNotebookCodedError('m', 'SELF_LOCKOUT', 'u');
    const res = clusterNotebookErrorResponse(err(), { messages: ACCOUNT_MESSAGES });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "You can't remove your own access.", code: 'SELF_LOCKOUT' });
    expect(await clusterNotebookErrorResponse(err()).json()).toEqual({ error: "You can't end your own last admin role here.", code: 'SELF_LOCKOUT' });
  });
});
