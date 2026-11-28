import type { ParticipationRecord, ParticipationSpace, PersonSummary, SpaceKind, SpaceMode } from './clusterNotebook';

// Pure helpers for the Participation card and its routes.

export type SpaceSuggestion = { name: string; kind: string; mode: SpaceMode };

// Names only; the kind keys must exist in cluster-notebook's spaceKinds (availableSuggestions checks).
export const SPACE_SUGGESTIONS: SpaceSuggestion[] = [
  { name: 'Social action', kind: 'social_action', mode: 'EACH_TIME' },
  { name: 'Community gathering', kind: 'community_gathering', mode: 'EACH_TIME' },
  { name: 'Reflection gathering', kind: 'reflection', mode: 'EACH_TIME' },
  { name: 'Expansion phase', kind: 'expansion', mode: 'RUNNING' },
  { name: 'Visiting neighbors', kind: 'visiting', mode: 'RUNNING' },
];

export function availableSuggestions(kinds: SpaceKind[], existingNames: string[]): SpaceSuggestion[] {
  const known = new Set(kinds.map(k => k.key));
  const taken = new Set(existingNames.map(n => n.trim().toLowerCase()));
  return SPACE_SUGGESTIONS.filter(s => known.has(s.kind) && !taken.has(s.name.toLowerCase()));
}

// A whole number >= 0, or null for anything else (including blank).
export function parseCount(text: string): number | null {
  const t = text.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

// Naming more people than the typed count raises the count to the number named.
export function countAfterNaming(count: number | null, named: number): number {
  return Math.max(count ?? 0, named);
}

export function namedLabel(named: number, count: number): string {
  return named > 0 || count > 0 ? `${named} of ${count} named` : '';
}

export function lastTimeChoices(latest: ParticipationRecord | null, pickedIds: string[]): PersonSummary[] {
  if (!latest) return [];
  const picked = new Set(pickedIds);
  return latest.people.filter(p => !picked.has(p.id));
}

const pad = (n: number) => String(n).padStart(2, '0');

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function windowStart(today: Date, weeks = 12): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - weeks * 7);
  return isoDate(d);
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function spaceRowSummary(space: ParticipationSpace): { value: string; caption: string; detail: string } {
  const latest = space.latestRecord;
  if (space.recordCount === 0 || !latest) return { value: '—', caption: '', detail: 'Nothing recorded yet' };
  if (space.mode === 'RUNNING') {
    return { value: String(space.total), caption: 'so far', detail: `Last entry ${shortDate(latest.date)}` };
  }
  return { value: String(latest.count), caption: 'last time', detail: `Last ${shortDate(latest.date)} · ${space.recordCount} recorded` };
}

export function canRecord(space: Pick<ParticipationSpace, 'archivedAt'>, canWrite: boolean): boolean {
  return canWrite && !space.archivedAt;
}

export type RecordBody = { spaceId: string; date: string; count: number; note: string | null; personIds: string[] };
type RecordPatch = { date?: string; count?: number; note?: string | null; personIds?: string[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === 'string' && ISO_DATE.test(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string' && x !== '');
const normNote = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const isNoteInput = (v: unknown) => v === null || typeof v === 'string';

export function parseRecordBody(body: unknown): { ok: true; value: RecordBody } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Invalid request.' };
  const b = body as Record<string, unknown>;
  if (typeof b.spaceId !== 'string' || !b.spaceId) return { ok: false, error: 'Missing space.' };
  if (!isDate(b.date)) return { ok: false, error: 'Choose a date.' };
  if (!isCount(b.count)) return { ok: false, error: 'The number of participants must be a whole number, 0 or more.' };
  if (b.note != null && typeof b.note !== 'string') return { ok: false, error: 'Invalid note.' };
  if (b.personIds != null && !isIds(b.personIds)) return { ok: false, error: 'Invalid list of people.' };
  return { ok: true, value: { spaceId: b.spaceId, date: b.date, count: b.count, note: normNote(b.note), personIds: (b.personIds as string[] | undefined) ?? [] } };
}

export function parseRecordPatch(body: unknown): { ok: true; id: string; patch: RecordPatch } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Invalid request.' };
  const b = body as Record<string, unknown>;
  if (typeof b.id !== 'string' || !b.id) return { ok: false, error: 'Missing record.' };
  const patch: RecordPatch = {};
  if ('date' in b) {
    if (!isDate(b.date)) return { ok: false, error: 'Choose a date.' };
    patch.date = b.date;
  }
  if ('count' in b) {
    if (!isCount(b.count)) return { ok: false, error: 'The number of participants must be a whole number, 0 or more.' };
    patch.count = b.count;
  }
  if ('note' in b) {
    if (!isNoteInput(b.note)) return { ok: false, error: 'Invalid note.' };
    patch.note = normNote(b.note);
  }
  if ('personIds' in b) {
    if (!isIds(b.personIds)) return { ok: false, error: 'Invalid list of people.' };
    patch.personIds = b.personIds;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to change' };
  return { ok: true, id: b.id, patch };
}

export type SpaceBody = { name: string; kind: string; mode: SpaceMode };
type SpacePatch = { name?: string; kind?: string; archived?: boolean };
const isKind = (v: unknown): v is string => typeof v === 'string' && v !== '';

export function parseSpaceBody(body: unknown): { ok: true; value: SpaceBody } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Invalid request.' };
  const b = body as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) return { ok: false, error: 'Name is required' };
  if (!isKind(b.kind)) return { ok: false, error: 'Choose a kind' };
  if (b.mode !== 'EACH_TIME' && b.mode !== 'RUNNING') return { ok: false, error: 'Choose how it is recorded' };
  return { ok: true, value: { name, kind: b.kind, mode: b.mode } };
}

export function parseSpacePatch(body: unknown): { ok: true; id: string; patch: SpacePatch } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Invalid request.' };
  const b = body as Record<string, unknown>;
  if (typeof b.id !== 'string' || !b.id) return { ok: false, error: 'Missing space.' };
  const patch: SpacePatch = {};
  if ('name' in b) {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name) return { ok: false, error: 'Name is required' };
    patch.name = name;
  }
  if ('kind' in b) {
    if (!isKind(b.kind)) return { ok: false, error: 'Choose a kind' };
    patch.kind = b.kind;
  }
  if ('archived' in b) {
    if (typeof b.archived !== 'boolean') return { ok: false, error: 'Invalid request.' };
    patch.archived = b.archived;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to change' };
  return { ok: true, id: b.id, patch };
}

export type RecordFields = { date: string; count: number; note: string | null; personIds: string[] };

// Only the fields that differ, so an edit never clobbers what it didn't touch. People compare as a set; a blank
// note means "no note" (null).
export function recordPatch(original: RecordFields, edited: RecordFields): Partial<RecordFields> {
  const patch: Partial<RecordFields> = {};
  if (edited.date !== original.date) patch.date = edited.date;
  if (edited.count !== original.count) patch.count = edited.count;
  const note = edited.note?.trim() || null;
  if (note !== (original.note?.trim() || null)) patch.note = note;
  const before = new Set(original.personIds);
  const same = before.size === new Set(edited.personIds).size && edited.personIds.every(id => before.has(id));
  if (!same) patch.personIds = edited.personIds;
  return patch;
}
