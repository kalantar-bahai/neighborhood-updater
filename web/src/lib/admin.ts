// Admin page (phase 1): pure decisions, tested in admin.test.ts.
// Spec: docs/superpowers/specs/ (admin page design); plan: docs/superpowers/plans/2026-11-24-admin-page-phase1.md
import type { AccountInfo, AdminCluster, AdminPerson, AdminPlace, HiddenPerson, Invitation, InvitationStatus, MoveResult, PersonDetails, RoleHolding } from './clusterNotebook';
import { AGE_LABELS, roleLabel } from './people';
import { individualDisplayName } from './personName';

// Names repeat, so a result shows age and the whole place path to tell two people apart.
export function adminPersonLine(p: AdminPerson): string {
  return [
    individualDisplayName(p.individual),
    p.ageCategory ? AGE_LABELS[p.ageCategory] : '',
    p.placePath.join(' › '),
  ].filter(Boolean).join(' · ');
}

// The role alone; the Roles card shows its place (entity) on a line of its own.
export function holdingLabel(h: RoleHolding): string {
  const { label, icon } = roleLabel(h.role);
  return icon ? `${label} ${icon}` : label;
}

// entity is null for the Administrator role, which has no place attached.
export function roleHoldingLine(h: RoleHolding): string {
  return h.entity ? `${holdingLabel(h)} · ${h.entity.name}` : holdingLabel(h);
}

// The Invite card's reminder of what the person already holds, so "No new role" isn't read as "no roles".
export function currentRolesLine(roles: RoleHolding[]): string {
  return roles.length ? `Current roles: ${roles.map(roleHoldingLine).join('; ')}` : 'No current roles';
}

export function endRoleConfirm(name: string, h: RoleHolding): string {
  const { label } = roleLabel(h.role);
  return h.entity ? `End ${name}'s ${label} role at ${h.entity.name}?` : `End ${name}'s ${label} role?`;
}

// Input order is kept (cluster-notebook sends parents first). A filter keeps matches and their ancestors.
export function placeTree(places: AdminPlace[], filter: string): { place: AdminPlace; depth: number }[] {
  const byId = new Map(places.map(p => [p.id, p]));
  const depthOf = (p: AdminPlace): number => {
    let depth = 0;
    const seen = new Set([p.id]);
    for (let cur = p.parentId ? byId.get(p.parentId) : undefined; cur && !seen.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
      seen.add(cur.id);
      depth++;
    }
    return depth;
  };
  const needle = filter.trim().toLowerCase();
  const keep = new Set<string>();
  if (!needle) places.forEach(p => keep.add(p.id));
  else {
    for (const p of places) {
      if (!p.name.toLowerCase().includes(needle)) continue;
      for (let cur: AdminPlace | undefined = p; cur && !keep.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) keep.add(cur.id);
    }
  }
  return places.filter(p => keep.has(p.id)).map(place => ({ place, depth: depthOf(place) }));
}

// moveIndividuals takes a Location id: a locality or a setting.
export function moveTargets(places: AdminPlace[]): AdminPlace[] {
  return places.filter(p => p.type === 'locality' || p.type === 'setting');
}

export function isAdminOf(clusters: AdminCluster[], clusterName: string): boolean {
  return clusters.some(c => c.name === clusterName);
}

// Whether the home page shows the Admin link. Fails closed without failing the caller: a
// cluster-notebook error on adminClusters must never take the home page down for everyone
// (it did on 2026-11-23); the user just doesn't see the link.
export async function lookupIsAdmin(lookup: () => Promise<AdminCluster[]>): Promise<boolean> {
  try {
    return (await lookup()).length > 0;
  } catch (e) {
    console.error('adminClusters lookup failed; hiding the Admin link', e);
    return false;
  }
}

const STATUS_WORDS: Record<InvitationStatus, string> = { PENDING: 'pending', ACCEPTED: 'accepted', EXPIRED: 'expired', REVOKED: 'cancelled' };
export function invitationStatusWord(s: InvitationStatus): string {
  return STATUS_WORDS[s];
}

const day = (iso: string) => iso.slice(0, 10);

export function invitationLine(i: Invitation): string {
  const role = i.role ? (i.entity ? `${roleLabel(i.role).label} at ${i.entity.name}` : roleLabel(i.role).label) : '';
  return [
    individualDisplayName(i.individual),
    i.email,
    role,
    i.invitedBy ? `invited by ${individualDisplayName(i.invitedBy)} ${day(i.createdAt)}` : '',
    `expires ${day(i.expiresAt)}`,
  ].filter(Boolean).join(' · ');
}

export function accountLine(a: AccountInfo): string {
  return [
    individualDisplayName(a.individual),
    a.email,
    a.createdAt ? `since ${day(a.createdAt)}` : '',
    a.lastSeenAt ? `last seen ${day(a.lastSeenAt)}` : 'never seen',
  ].filter(Boolean).join(' · ');
}

export function accountRemovedNote(a: AccountInfo): string | null {
  return a.disabledAt ? `access removed ${day(a.disabledAt)}` : null;
}

// The n in "Accounts (n)": logins that can still sign in (removed ones stay listed, greyed, but don't count).
export function activeAccountCount(accounts: AccountInfo[]): number {
  return accounts.filter(a => !a.disabledAt).length;
}

// The login email is not the contact email, but SRP's first email is the best starting guess; the field stays editable.
export function prefillEmail(details: PersonDetails | null): string {
  return details?.emails[0]?.trim() ?? '';
}

export function adminPersonTag(p: AdminPerson): 'has access' | 'invited' | null {
  if (p.hasAccess) return 'has access';
  return p.pendingInvitation ? 'invited' : null;
}

export function removeAccessConfirm(name: string): string {
  return `Remove ${name}'s access?`;
}

export function cancelInvitationConfirm(email: string): string {
  return `Cancel the invitation to ${email}?`;
}

// The Invite card's POST body. role/entityId go only with a chosen place and role ('none' means access only).
// The expiry text is sent as a number when it is one, else as typed, so the route's validateInvite words the error.
export function inviteRequestBody(f: {
  cluster: string; individualId: string; email: string; value: { entityId: string; role: string } | 'none';
  expiresInDays: string; replaceExisting: boolean;
}): Record<string, unknown> {
  const t = f.expiresInDays.trim();
  const n = Number(t);
  return {
    cluster: f.cluster, individualId: f.individualId, email: f.email.trim(),
    ...(f.value === 'none' ? {} : { role: f.value.role, entityId: f.value.entityId }),
    expiresInDays: t !== '' && Number.isFinite(n) ? n : t,
    replaceExisting: f.replaceExisting,
  };
}

export interface InviteInput {
  individualId: string; email: string; role: string | null; entityId: string | null; expiresInDays: number; replaceExisting: boolean;
}

// Validates the body of POST /api/admin/invitations (cluster is checked by the route). Only "Administrator" may
// be given without a place; expiry defaults to 30 days and must be an integer 1-90 when given.
export function validateInvite(body: Record<string, unknown>): { ok: true; value: InviteInput } | { ok: false; error: string } {
  const individualId = typeof body.individualId === 'string' ? body.individualId : '';
  if (!individualId) return { ok: false, error: 'Missing person' };
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email.includes('@')) return { ok: false, error: 'Enter an email address.' };
  const role = typeof body.role === 'string' && body.role ? body.role : null;
  const entityId = typeof body.entityId === 'string' && body.entityId ? body.entityId : null;
  if (role !== null && role !== 'Administrator' && entityId === null) return { ok: false, error: 'Choose where the role applies.' };
  const days = body.expiresInDays === undefined ? 30 : body.expiresInDays;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 90) {
    return { ok: false, error: 'Expiry must be a whole number of days from 1 to 90.' };
  }
  return { ok: true, value: { individualId, email, role, entityId, expiresInDays: days, replaceExisting: body.replaceExisting === true } };
}

// The Invite card shows pending invitations (soonest to expire first) and keeps the rest, newest first, under a
// collapsed "Past invitations" so the card doesn't grow with every invitation ever sent.
export function splitInvitations(list: Invitation[]): { pending: Invitation[]; past: Invitation[] } {
  const pending = list.filter(i => i.status === 'PENDING').sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  const past = list.filter(i => i.status !== 'PENDING').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { pending, past };
}

// The Accounts card's search: every word must appear in the name or the login email (ignoring case). Active
// logins come first, then by name; at most `limit` rows are shown, and `matched` says how many there were.
export function findAccounts(accounts: AccountInfo[], search: string, limit = 20): { shown: AccountInfo[]; matched: number } {
  const name = (a: AccountInfo) => individualDisplayName(a.individual);
  const hits = accounts
    .filter(a => matchesWords(`${name(a)} ${a.email ?? ''}`, search))
    .sort((a, b) => Number(!!a.disabledAt) - Number(!!b.disabledAt) || name(a).localeCompare(name(b)));
  return { shown: hits.slice(0, limit), matched: hits.length };
}

// A person list's search (People not in SRP): every word must appear in the name or the place path (ignoring case).
// Input order is kept (cluster-notebook sends family-name order); at most `limit` rows are shown.
export function findPeople(people: AdminPerson[], search: string, limit = 20): { shown: AdminPerson[]; matched: number } {
  const hits = people.filter(p => matchesWords(`${individualDisplayName(p.individual)} ${p.placePath.join(' ')}`, search));
  return { shown: hits.slice(0, limit), matched: hits.length };
}

// Every word of the search must appear in the text, ignoring case; a blank search matches everything.
function matchesWords(text: string, search: string): boolean {
  const hay = text.toLowerCase();
  return search.trim().toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

// Owner 2026-11-24: a move from the Hidden card also unhides. Being hidden in one nucleus and visible in another makes
// no sense, and someone who later moves back would mysteriously not show up. So every hide in the cluster of everyone
// the move placed (the household moves too; ALREADY_THERE counts as placed) is lifted. Confirmed with cluster-notebook
// 2026-11-24: moveIndividuals never touches hides, so the client unhides.
export function hidesToLift(hidden: HiddenPerson[], results: MoveResult[]): { individualId: string; nucleusName: string }[] {
  const placed = new Set(results.filter(r => r.individual && (r.moved || r.code === 'ALREADY_THERE')).map(r => r.individual!.id));
  return hidden.filter(h => placed.has(h.individual.id)).map(h => ({ individualId: h.individual.id, nucleusName: h.nucleusName }));
}
