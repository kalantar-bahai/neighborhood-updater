import { describe, test, expect } from 'vitest';
import { parseAction, parsePersonName, isId } from './familyActions';

describe('parseAction', () => {
  test('accepts create', () => {
    expect(parseAction({ action: 'create', contactId: 'a', memberIds: ['a', 'b'] }))
      .toEqual({ action: 'create', contactId: 'a', memberIds: ['a', 'b'] });
  });
  test('accepts add, with and without fromHouseholdId', () => {
    expect(parseAction({ action: 'add', householdId: 'h', individualId: 'i' }))
      .toEqual({ action: 'add', householdId: 'h', individualId: 'i', fromHouseholdId: undefined });
    expect(parseAction({ action: 'add', householdId: 'h', individualId: 'i', fromHouseholdId: 'g' }))
      .toEqual({ action: 'add', householdId: 'h', individualId: 'i', fromHouseholdId: 'g' });
  });
  test('accepts remove and contact', () => {
    expect(parseAction({ action: 'remove', householdId: 'h', individualId: 'i' }))
      .toEqual({ action: 'remove', householdId: 'h', individualId: 'i' });
    expect(parseAction({ action: 'contact', householdId: 'h', individualId: 'i' }))
      .toEqual({ action: 'contact', householdId: 'h', individualId: 'i' });
  });
  test('rejects an unknown action', () => {
    expect(parseAction({ action: 'explode' })).toBe('Unknown action');
    expect(parseAction({})).toBe('Unknown action');
  });
  test('rejects empty ids', () => {
    expect(typeof parseAction({ action: 'create', contactId: '', memberIds: ['a'] })).toBe('string');
    expect(typeof parseAction({ action: 'remove', householdId: '', individualId: 'i' })).toBe('string');
    expect(typeof parseAction({ action: 'add', householdId: 'h', individualId: '' })).toBe('string');
  });
  test('rejects empty or non-id memberIds', () => {
    expect(typeof parseAction({ action: 'create', contactId: 'a', memberIds: [] })).toBe('string');
    expect(typeof parseAction({ action: 'create', contactId: 'a', memberIds: ['a', ''] })).toBe('string');
    expect(typeof parseAction({ action: 'create', contactId: 'a', memberIds: 'a' })).toBe('string');
  });
  test('rejects a non-string fromHouseholdId', () => {
    expect(parseAction({ action: 'add', householdId: 'h', individualId: 'i', fromHouseholdId: 5 })).toBe('Invalid fromHouseholdId');
    expect(parseAction({ action: 'add', householdId: 'h', individualId: 'i', fromHouseholdId: '' })).toBe('Invalid fromHouseholdId');
  });
  test('rejects a non-object body', () => {
    expect(parseAction(null)).toBe('Invalid body');
    expect(parseAction('x')).toBe('Invalid body');
    expect(parseAction(undefined)).toBe('Invalid body');
  });
});

describe('parsePersonName', () => {
  test('trims', () => expect(parsePersonName('  Ana Lopez ')).toBe('Ana Lopez'));
  test('ignores empty, blank, non-string and over 200 characters', () => {
    expect(parsePersonName('')).toBeUndefined();
    expect(parsePersonName('   ')).toBeUndefined();
    expect(parsePersonName(5)).toBeUndefined();
    expect(parsePersonName('x'.repeat(201))).toBeUndefined();
    expect(parsePersonName('x'.repeat(200))).toBe('x'.repeat(200));
  });
});

describe('isId', () => {
  test('non-empty strings only', () => {
    expect(isId('a')).toBe(true);
    expect(isId('')).toBe(false);
    expect(isId(1)).toBe(false);
  });
});
