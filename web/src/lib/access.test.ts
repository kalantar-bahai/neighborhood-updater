import { describe, test, expect } from 'vitest';
import { getAccess } from './access';

describe('getAccess (everyone-admin stopgap)', () => {
  test('any user id resolves to global admin', async () => {
    const result = await getAccess('user_abc123');
    expect(result.role).toBe('admin');
    if (result.role === 'none') return;
    expect(result.roleMap).toEqual({ '*': 'admin' });
  });

  test('resolves the same way regardless of which user id is passed', async () => {
    const a = await getAccess('user_one');
    const b = await getAccess('user_two');
    if (a.role === 'none' || b.role === 'none') throw new Error('unexpected none');
    expect(a.roleMap).toEqual(b.roleMap);
  });
});
