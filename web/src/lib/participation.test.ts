import { describe, test, expect } from 'vitest';
import {
  SPACE_SUGGESTIONS, availableSuggestions, parseCount, countAfterNaming, namedLabel, lastTimeChoices,
  isoDate, windowStart, shortDate, spaceRowSummary, canRecord, parseRecordBody, parseRecordPatch,
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
