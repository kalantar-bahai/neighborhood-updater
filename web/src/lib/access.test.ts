import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./clusterNotebook', () => ({
  getMyPermissions: vi.fn(),
  getIsAdministrator: vi.fn(),
}));

import { getNucleusPermissions, isAdministrator } from './access';
import { getMyPermissions, getIsAdministrator } from './clusterNotebook';

const mockGetMyPermissions = vi.mocked(getMyPermissions);
const mockGetIsAdministrator = vi.mocked(getIsAdministrator);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getNucleusPermissions', () => {
  test('returns the real PermissionSet when cluster-notebook recognizes the entity', async () => {
    const permissions = { canRead: true, canWrite: true, canChangeIdentity: false, canDelete: false, canAssignRoles: true, assignableRoles: ['accompanier'], createableEntityTypes: [] };
    mockGetMyPermissions.mockResolvedValue(permissions);

    const result = await getNucleusPermissions('South Estes');

    expect(result).toEqual(permissions);
    expect(mockGetMyPermissions).toHaveBeenCalledWith('South Estes');
  });

  test('returns an all-false PermissionSet when cluster-notebook returns null', async () => {
    mockGetMyPermissions.mockResolvedValue(null);

    const result = await getNucleusPermissions('Nonexistent');

    expect(result).toEqual({
      canRead: false, canWrite: false, canChangeIdentity: false, canDelete: false,
      canAssignRoles: false, assignableRoles: [], createableEntityTypes: [],
    });
  });
});

describe('isAdministrator', () => {
  test('re-exports getIsAdministrator', async () => {
    mockGetIsAdministrator.mockResolvedValue(true);
    expect(await isAdministrator()).toBe(true);
  });
});
