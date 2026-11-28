import { describe, test, expect } from 'vitest';
import {
  SPACE_SUGGESTIONS, availableSuggestions, parseCount, countAfterNaming, namedLabel, lastTimeChoices,
  isoDate, windowStart, shortDate, spaceRowSummary, canRecord, parseRecordBody, parseRecordPatch, parseSpaceBody, parseSpacePatch, recordPatch, countValid,
} from './participation';
import type { ParticipationRecord, ParticipationSpace, PersonSummary } from './clusterNotebook';

const person = (id: string) => ({ id, firstName: id, lastName: 'Test' }) as unknown as PersonSummary;
const record = (date: string, count: number, people: PersonSummary[] = []): ParticipationRecord =>
  ({ id: 'r', date, count, note: null, people, createdAt: '', updatedAt: '' });
const space = (over: Partial<ParticipationSpace>): ParticipationSpace => ({
  id: 's', name: 'S', kind: 'k', mode: 'EACH_TIME', createdAt: '', archivedAt: null, recordCount: 0, total: 0, latestRecord: null, ...over,
});

describe('suggestions', () => {
  test('SPACE_SUGGESTIONS', () => {
    expect(SPACE_SUGGESTIONS).toEqual([
      { name: 'Social action', kind: 'social_action', mode: 'EACH_TIME' },
      { name: 'Community gathering', kind: 'community_gathering', mode: 'EACH_TIME' },
      { name: 'Reflection gathering', kind: 'reflection', mode: 'EACH_TIME' },
      { name: 'Expansion phase', kind: 'expansion', mode: 'RUNNING' },
      { name: 'Visiting neighbors', kind: 'visiting', mode: 'RUNNING' },
    ]);
  });
  test('availableSuggestions drops unknown kinds and existing names', () => {
    const kinds = SPACE_SUGGESTIONS.filter(s => s.kind !== 'visiting').map(s => ({ key: s.kind, label: s.name }));
    const out = availableSuggestions(kinds, ['reflection GATHERING']).map(s => s.name);
    expect(out).toEqual(['Social action', 'Community gathering', 'Expansion phase']);
  });
});

describe('counts', () => {
  test.each([['15', 15], [' 0 ', 0], ['', null], ['-1', null], ['2.5', null], ['abc', null]])('parseCount(%j)', (t, n) => {
    expect(parseCount(t)).toBe(n);
  });
  test('countAfterNaming', () => {
    expect(countAfterNaming(15, 6)).toBe(15);
    expect(countAfterNaming(5, 6)).toBe(6);
    expect(countAfterNaming(null, 2)).toBe(2);
  });
  test('namedLabel', () => {
    expect(namedLabel(6, 15)).toBe('6 of 15 named');
    expect(namedLabel(0, 0)).toBe('');
  });
});

describe('lastTimeChoices', () => {
  test('excludes picked', () => {
    const [a, b, c] = [person('A'), person('B'), person('C')];
    expect(lastTimeChoices(record('2026-11-20', 3, [a, b, c]), ['B'])).toEqual([a, c]);
    expect(lastTimeChoices(null, [])).toEqual([]);
  });
});

describe('dates', () => {
  test('windowStart and isoDate', () => {
    expect(windowStart(new Date(2026, 10, 27))).toBe('2026-09-04');
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  test('shortDate', () => { expect(shortDate('2026-11-20')).toBe('Nov 20'); });
});

describe('spaceRowSummary', () => {
  test('each time', () => {
    expect(spaceRowSummary(space({ recordCount: 9, latestRecord: record('2026-11-20', 14) })))
      .toEqual({ value: '14', caption: 'last time', detail: 'Last Nov 20 · 9 recorded' });
  });
  test('running', () => {
    expect(spaceRowSummary(space({ mode: 'RUNNING', recordCount: 4, total: 37, latestRecord: record('2026-11-25', 2) })))
      .toEqual({ value: '37', caption: 'so far', detail: 'Last entry Nov 25' });
  });
  test('empty', () => {
    expect(spaceRowSummary(space({ mode: 'RUNNING' }))).toEqual({ value: '—', caption: '', detail: 'Nothing recorded yet' });
    expect(spaceRowSummary(space({}))).toEqual({ value: '—', caption: '', detail: 'Nothing recorded yet' });
  });
});

test('canRecord', () => {
  expect(canRecord({ archivedAt: null }, true)).toBe(true);
  expect(canRecord({ archivedAt: '2026-11-01T00:00:00Z' }, true)).toBe(false);
  expect(canRecord({ archivedAt: null }, false)).toBe(false);
});

describe('parseRecordBody', () => {
  const ok = { spaceId: 's1', date: '2026-11-20', count: 3, note: ' hi ', personIds: ['p1'] };
  test('accepts and normalizes', () => {
    expect(parseRecordBody(ok)).toEqual({ ok: true, value: { spaceId: 's1', date: '2026-11-20', count: 3, note: 'hi', personIds: ['p1'] } });
    expect(parseRecordBody({ ...ok, note: '  ', personIds: undefined })).toEqual({ ok: true, value: { spaceId: 's1', date: '2026-11-20', count: 3, note: null, personIds: [] } });
  });
  test.each([
    ['missing spaceId', { ...ok, spaceId: undefined }],
    ['bad date', { ...ok, date: 'Nov 20' }],
    ['negative count', { ...ok, count: -1 }],
    ['fractional count', { ...ok, count: 1.5 }],
    ['bad personIds', { ...ok, personIds: [1] }],
    ['not an object', null],
  ])('rejects %s', (_n, body) => {
    expect(parseRecordBody(body).ok).toBe(false);
  });
});

describe('parseRecordPatch', () => {
  test('only present fields', () => {
    expect(parseRecordPatch({ id: 'r1', count: 2 })).toEqual({ ok: true, id: 'r1', patch: { count: 2 } });
  });
  test('blank or null note becomes null', () => {
    expect(parseRecordPatch({ id: 'r1', note: null })).toEqual({ ok: true, id: 'r1', patch: { note: null } });
    expect(parseRecordPatch({ id: 'r1', note: '' })).toEqual({ ok: true, id: 'r1', patch: { note: null } });
  });
  test('rejects missing id and bad fields', () => {
    expect(parseRecordPatch({ count: 2 }).ok).toBe(false);
    expect(parseRecordPatch({ id: 'r1', date: 'x' }).ok).toBe(false);
    expect(parseRecordPatch({ id: 'r1', count: -2 }).ok).toBe(false);
  });
});

describe('parseRecordPatch empty', () => {
  test('rejects a patch with nothing to change', () => {
    expect(parseRecordPatch({ id: 'r1' })).toEqual({ ok: false, error: 'Nothing to change' });
  });
});

describe('parseSpaceBody', () => {
  test('trims the name and accepts both modes', () => {
    expect(parseSpaceBody({ name: '  Fun  ', kind: 'k', mode: 'RUNNING' })).toEqual({ ok: true, value: { name: 'Fun', kind: 'k', mode: 'RUNNING' } });
    expect(parseSpaceBody({ name: 'A', kind: 'k', mode: 'EACH_TIME' }).ok).toBe(true);
  });
  test('rejects blank name, bad mode, missing kind', () => {
    expect(parseSpaceBody({ name: '  ', kind: 'k', mode: 'RUNNING' })).toEqual({ ok: false, error: 'Name is required' });
    expect(parseSpaceBody({ name: 'A', kind: 'k', mode: 'x' })).toEqual({ ok: false, error: 'Choose how it is recorded' });
    expect(parseSpaceBody({ name: 'A', kind: '', mode: 'RUNNING' }).ok).toBe(false);
    expect(parseSpaceBody(null).ok).toBe(false);
  });
});

describe('parseSpacePatch', () => {
  test('only present fields, trimmed name', () => {
    expect(parseSpacePatch({ id: 's1', name: ' B ', archived: true })).toEqual({ ok: true, id: 's1', patch: { name: 'B', archived: true } });
  });
  test('rejects empty patch, blank name, bad types, missing id', () => {
    expect(parseSpacePatch({ id: 's1' })).toEqual({ ok: false, error: 'Nothing to change' });
    expect(parseSpacePatch({ id: 's1', name: ' ' })).toEqual({ ok: false, error: 'Name is required' });
    expect(parseSpacePatch({ id: 's1', kind: '' }).ok).toBe(false);
    expect(parseSpacePatch({ id: 's1', archived: 'yes' }).ok).toBe(false);
    expect(parseSpacePatch({ name: 'x' }).ok).toBe(false);
  });
});

describe('recordPatch', () => {
  const orig = { date: '2026-11-01', count: 5, note: 'Hi' as string | null, personIds: ['a', 'b'] };
  test('nothing changed gives an empty patch', () => {
    expect(recordPatch(orig, { ...orig })).toEqual({});
  });
  test('personIds compare as sets, ignoring order', () => {
    expect(recordPatch(orig, { ...orig, personIds: ['b', 'a'] })).toEqual({});
    expect(recordPatch(orig, { ...orig, personIds: ['a', 'c'] })).toEqual({ personIds: ['a', 'c'] });
    expect(recordPatch(orig, { ...orig, personIds: [] })).toEqual({ personIds: [] });
  });
  test('only the changed fields', () => {
    expect(recordPatch(orig, { ...orig, count: 6, date: '2026-11-02' })).toEqual({ count: 6, date: '2026-11-02' });
  });
  test('a blank note clears it; blank over no note is no change; trimmed text compares trimmed', () => {
    expect(recordPatch(orig, { ...orig, note: '  ' })).toEqual({ note: null });
    expect(recordPatch({ ...orig, note: null }, { ...orig, note: '' })).toEqual({});
    expect(recordPatch(orig, { ...orig, note: ' Hi ' })).toEqual({});
    expect(recordPatch(orig, { ...orig, note: 'Bye' })).toEqual({ note: 'Bye' });
  });
});

describe('countValid', () => {
  test('whole number that is at least the number named', () => {
    expect(countValid(null, 0)).toBe(false);
    expect(countValid(2, 3)).toBe(false);
    expect(countValid(3, 3)).toBe(true);
    expect(countValid(0, 0)).toBe(true);
    expect(countValid(5, 3)).toBe(true);
  });
});
