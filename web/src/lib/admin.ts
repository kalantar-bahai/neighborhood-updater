// Admin page (phase 1): pure decisions, tested in admin.test.ts.
// Spec: docs/superpowers/specs/ (admin page design); plan: docs/superpowers/plans/2026-11-24-admin-page-phase1.md
import type { AccountInfo, AdminCluster, AdminPerson, AdminPlace, Invitation, InvitationStatus, PersonDetails, RoleHolding } from './clusterNotebook';
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

function holdingLabel(h: RoleHolding): string {
  const { label, icon } = roleLabel(h.role);
  return icon ? `${label} ${icon}` : label;
}

// entity is null for the Administrator role, which has no place attached.
export function roleHoldingLine(h: RoleHolding): string {
  return h.entity ? `${holdingLabel(h)} · ${h.entity.name}` : holdingLabel(h);
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

// The login email is not the contact email, but SRP's first email is the best starting guess; the field stays editable.
export function prefillEmail(details: PersonDetails | null): string {
  return details?.emails[0]?.trim() ?? '';
}

export function adminPersonTag(p: AdminPerson): 'has access' | 'invited' | null {
  if (p.hasAccess) return 'has access';
  return p.pendingInvitation ? 'invited' : null;
}

export function removeAccessConfirm(name: string, isSelf: boolean): string {
  return isSelf ? 'Remove your own access? You will be signed out.' : `Remove ${name}'s access?`;
}
