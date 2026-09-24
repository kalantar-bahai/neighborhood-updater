import { auth } from '@clerk/nextjs/server';

const CLUSTER_NOTEBOOK_URL = process.env.CLUSTER_NOTEBOOK_URL || 'http://localhost:8000';

// Shared shape for all four activity rollups (devotionalGathering/childrensClasses/
// juniorYouthGroups/studyCircles). `isOverridden` is per-object, not per-field: true
// when any of number/participants/participantsFof is a human-entered override rather
// than the SRP-derived value (2026-09-14, cluster-notebook).
export interface ActivitySummary {
  number: number | null;
  participants: number | null;
  participantsFof: number | null;
  isOverridden: boolean;
  // Added 2026-09-14. Both human-entered only -- no SRP source exists for either
  // (srp-client has no per-activity roster data yet), so these never get
  // SRP-derived when unset, unlike number/participants/participantsFof.
  facilitators: number | null;
  facilitatorNames: string | null;
}

// ActivityType enum values are singular (CHILDRENS_CLASS, not CHILDRENS_CLASSES),
// confirmed against cluster-notebook's schema 2026-09-14.
export type ActivityType = 'DEVOTIONAL_GATHERING' | 'CHILDRENS_CLASS' | 'JUNIOR_YOUTH_GROUP' | 'STUDY_CIRCLE';

// Confirmed live with cluster-notebook 2026-09-24. canChangeIdentity gates a
// Nucleus's Type/Stage (and any future rename/relocate) specifically -- a
// stricter tier than plain canWrite. assignableRoles lists which RECOGNIZED
// roles this caller may grant here; informal roles (protagonist/promoter) are
// always assignable whenever canAssignRoles is true, regardless of this list.
export interface PermissionSet {
  canRead: boolean;
  canWrite: boolean;
  canChangeIdentity: boolean;
  canDelete: boolean;
  canAssignRoles: boolean;
  assignableRoles: string[];
  createableEntityTypes: string[];
}

const ACTIVITY_SUMMARY_SELECTION = 'number participants participantsFof isOverridden facilitators facilitatorNames';

const PERMISSION_SET_SELECTION = 'canRead canWrite canChangeIdentity canDelete canAssignRoles assignableRoles createableEntityTypes';

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
}

// Thrown instead of a plain Error when cluster-notebook rejects a call for
// permission reasons (confirmed with cluster-notebook 2026-09-24:
// extensions.code === 'FORBIDDEN' is the contract; the message text is not --
// it's still "Not authenticated." even for a real permission denial, so callers
// should never rely on it, only on this error type).
export class ClusterNotebookForbiddenError extends Error {}

async function request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) {
    console.warn('cluster-notebook request: no Clerk session token available, sending unauthenticated');
  }

  const res = await fetch(CLUSTER_NOTEBOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`cluster-notebook request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    if (json.errors.some(e => e.extensions?.code === 'FORBIDDEN')) {
      throw new ClusterNotebookForbiddenError('cluster-notebook denied this request (FORBIDDEN)');
    }
    throw new Error(`cluster-notebook GraphQL error: ${json.errors.map(e => e.message).join('; ')}`);
  }
  if (json.data === undefined) {
    throw new Error('cluster-notebook response contained neither data nor errors');
  }
  return json.data as T;
}

export interface ClusterFields {
  name: string;
  groupOfClusters: string | null;
  growthMilestone: string | null;
  // Plain text, comma-separated "<Name> (<Portfolio>)" entries, sourced from SRP.
  // Read-only, no mutation -- same precedent as groupOfClusters/growthMilestone.
  // Per-person Individual/RoleInNE linkage is explicitly deferred on cluster-notebook's side.
  auxiliaryBoardMembers: string | null;
}

export interface NucleusFields {
  stage: string | null;
  locality: string | null;
  populationMakeup: string | null;
  population: number | null;
  households: number | null;
  connectedPopulation: number | null;
  connectedHouseholds: number | null;
  hasSocialAction: boolean | null;
  socialActionDescription: string | null;
  hasCommunityGatherings: boolean | null;
  communityGatheringDescription: string | null;
  narrative: string | null;
  // Read-only, no mutation on cluster-notebook's side for any of these three —
  // every Nucleus is guaranteed a Cluster (non-null), per cluster-notebook 2026-09-13.
  cluster: ClusterFields;
  // Writable, but only meaningfully so when the nucleus has no `location`: when a
  // location IS set, this always reads "Neighborhood" regardless of what's stored
  // or written (cluster-notebook 2026-09-13). By design, not a bug -- Network/
  // Population nuclei aren't location-bound, so they naturally take the settable path.
  nucleusType: string | null;
  // Added 2026-09-14 -- backed by the same generic containment primitive (parentId)
  // used for the Setting->Locality->Cluster geographic chain, now also applied to
  // Nucleus->Nucleus for our "pocket" grouping (e.g. distinct population-specific
  // nuclei nested under a shared parent neighborhood). One-hop lookup, null if
  // unset. Write side is updateNucleus's `parentNucleusName` patch field (a plain
  // string, not nested) -- no cycle-guard on their side, human-entered data.
  parentNucleus: { name: string } | null;
}

// Deliberately not `extends NucleusFields` — the picker (getAllNuclei's caller)
// doesn't need population/households/connected*, and its query below doesn't
// request them, so keep this decoupled from NucleusFields' full shape.
export interface NucleusSummary {
  name: string;
  stage: string | null;
  locality: string | null;
  populationMakeup: string | null;
  nucleusType: string | null;
  devotionalGathering: ActivitySummary | null;
  childrensClasses: ActivitySummary | null;
  juniorYouthGroups: ActivitySummary | null;
  studyCircles: ActivitySummary | null;
  // Added 2026-09-14 so the picker's own grouping/cluster display can source
  // from cluster-notebook instead of the (now often blank, for newly-created
  // nuclei) Sheet columns r[COL.GROUPING]/r[COL.CLUSTER].
  cluster: ClusterFields;
  // Added 2026-09-14 for the same reason -- see NucleusFields.parentNucleus.
  parentNucleus: { name: string } | null;
  // Added 2026-09-24 for real per-nucleus authorization -- fetched in the same
  // request as the rest of the list (cluster-notebook designed this as a field
  // specifically so a list of nuclei costs one request, not one per nucleus).
  myPermissions: PermissionSet;
}

// No top-level clusters query existed until 2026-09-14 (Cluster was only reachable
// nested under Nucleus.cluster) -- added specifically to back our "+Add" cluster
// picker. Deliberately no inline cluster creation: clusters are real, SRP-sourced
// geographic entities, not something a user invents ad hoc.
export async function getClusters(): Promise<ClusterFields[]> {
  const query = `
    query GetClusters {
      clusters { name groupOfClusters growthMilestone auxiliaryBoardMembers }
    }
  `;
  const data = await request<{ clusters: ClusterFields[] }>(query, {});
  return data.clusters;
}

// Identity-only at creation -- everything else (location, nucleusType, stage,
// population, activities, worker roles) goes through the same update mutations
// used for editing, not through this call. Returns null for an unknown
// clusterName (same "not found -> null" convention as everywhere else); throws a
// real GraphQL error for a duplicate name (global uniqueness, enforced at the DB
// level on cluster-notebook's side, 2026-09-14) -- distinguishable from the null
// case so callers can tell "bad cluster" from "name taken".
export async function createNucleus(name: string, clusterName: string): Promise<NucleusFields | null> {
  const mutation = `
    mutation CreateNucleus($name: String!, $clusterName: String!) {
      createNucleus(name: $name, clusterName: $clusterName) {
        ${NUCLEUS_FIELDS_SELECTION}
      }
    }
  `;
  const data = await request<{ createNucleus: NucleusFields | null }>(mutation, { name, clusterName });
  return data.createNucleus;
}

// Soft delete on cluster-notebook's side (2026-09-14) -- the Nucleus row persists
// (archivedAt set) but disappears from nuclei/nucleus(name)/parentNucleus immediately.
// ActivitySummaryOverride rows are hard-deleted; real Activity rows are reassigned
// (never deleted) to parentNucleus, else resolved Locality, else resolved Cluster;
// current RoleInNE role-holders are ended. Children pointing here via parentNucleus
// are nulled out, not cascade-deleted. Returns false for "never existed" and
// "already deleted" alike -- the same idempotent-delete convention used elsewhere.
export async function deleteNucleus(name: string): Promise<boolean> {
  const mutation = `
    mutation DeleteNucleus($name: String!) {
      deleteNucleus(name: $name)
    }
  `;
  const data = await request<{ deleteNucleus: boolean }>(mutation, { name });
  return data.deleteNucleus;
}

export async function getAllNuclei(): Promise<NucleusSummary[]> {
  const query = `
    query GetAllNuclei {
      nuclei {
        name stage locality populationMakeup nucleusType
        devotionalGathering { ${ACTIVITY_SUMMARY_SELECTION} }
        childrensClasses { ${ACTIVITY_SUMMARY_SELECTION} }
        juniorYouthGroups { ${ACTIVITY_SUMMARY_SELECTION} }
        studyCircles { ${ACTIVITY_SUMMARY_SELECTION} }
        cluster { name groupOfClusters growthMilestone auxiliaryBoardMembers }
        parentNucleus { name }
        myPermissions { ${PERMISSION_SET_SELECTION} }
      }
    }
  `;
  const data = await request<{ nuclei: NucleusSummary[] }>(query, {});
  return data.nuclei;
}

const NUCLEUS_FIELDS_SELECTION = 'stage locality populationMakeup population households connectedPopulation connectedHouseholds '
  + 'hasSocialAction socialActionDescription hasCommunityGatherings communityGatheringDescription narrative nucleusType '
  + 'cluster { name groupOfClusters growthMilestone auxiliaryBoardMembers } parentNucleus { name }';

export async function getNucleusFields(nucleusName: string): Promise<NucleusFields | null> {
  const query = `
    query GetNucleusFields($name: String!) {
      nucleus(name: $name) { ${NUCLEUS_FIELDS_SELECTION} }
    }
  `;
  const data = await request<{ nucleus: NucleusFields | null }>(query, { name: nucleusName });
  return data.nucleus;
}

export async function updateNucleus(
  nucleusName: string,
  // NOTE: no `locality` here — REMOVED from NucleusPatch 2026-09-13. `locality`
  // is now a read-only derived value (walked up from Nucleus.location's own
  // containment chain), not a hand-entered field; cluster-notebook has no
  // write path for it at all right now (setting `location` isn't wired up
  // either). It's still readable via NucleusFields/getNucleusFields/getAllNuclei.
  patch: {
    stage?: string; populationMakeup?: string;
    population?: number | null; households?: number | null;
    connectedPopulation?: number | null; connectedHouseholds?: number | null;
    hasSocialAction?: boolean | null; socialActionDescription?: string;
    hasCommunityGatherings?: boolean | null; communityGatheringDescription?: string;
    narrative?: string;
    nucleusType?: string;
    // Added 2026-09-14 -- a plain string (unlike the `parentNucleus { name }` query
    // field), not nested. null clears the parent; an unknown name throws a real
    // error rather than silently no-opping.
    parentNucleusName?: string | null;
  }
): Promise<NucleusFields | null> {
  const mutation = `
    mutation UpdateNucleus($name: String!, $patch: NucleusPatch!) {
      updateNucleus(name: $name, patch: $patch) {
        ${NUCLEUS_FIELDS_SELECTION}
      }
    }
  `;
  const data = await request<{ updateNucleus: NucleusFields | null }>(mutation, { name: nucleusName, patch });
  if (data.updateNucleus === null) {
    throw new Error(`cluster-notebook has no nucleus named "${nucleusName}" — nucleus fields not saved`);
  }
  return data.updateNucleus;
}

export interface ActivitySummaries {
  devotionalGathering: ActivitySummary | null;
  childrensClasses: ActivitySummary | null;
  juniorYouthGroups: ActivitySummary | null;
  studyCircles: ActivitySummary | null;
}

export async function getActivitySummaries(nucleusName: string): Promise<ActivitySummaries | null> {
  const query = `
    query GetActivitySummaries($name: String!) {
      nucleus(name: $name) {
        devotionalGathering { ${ACTIVITY_SUMMARY_SELECTION} }
        childrensClasses { ${ACTIVITY_SUMMARY_SELECTION} }
        juniorYouthGroups { ${ACTIVITY_SUMMARY_SELECTION} }
        studyCircles { ${ACTIVITY_SUMMARY_SELECTION} }
      }
    }
  `;
  const data = await request<{ nucleus: ActivitySummaries | null }>(query, { name: nucleusName });
  return data.nucleus;
}

export async function updateActivitySummary(
  nucleusName: string,
  activityType: ActivityType,
  fields: { number?: number | null; participants?: number | null; participantsFof?: number | null }
): Promise<ActivitySummaries | null> {
  const mutation = `
    mutation UpdateActivitySummary($nucleusName: String!, $activityType: ActivityType!, $number: Int, $participants: Int, $participantsFof: Int) {
      updateActivitySummary(
        nucleusName: $nucleusName, activityType: $activityType,
        number: $number, participants: $participants, participantsFof: $participantsFof
      ) {
        devotionalGathering { ${ACTIVITY_SUMMARY_SELECTION} }
        childrensClasses { ${ACTIVITY_SUMMARY_SELECTION} }
        juniorYouthGroups { ${ACTIVITY_SUMMARY_SELECTION} }
        studyCircles { ${ACTIVITY_SUMMARY_SELECTION} }
      }
    }
  `;
  const data = await request<{ updateActivitySummary: ActivitySummaries | null }>(
    mutation,
    {
      nucleusName,
      activityType,
      number: fields.number ?? null,
      participants: fields.participants ?? null,
      participantsFof: fields.participantsFof ?? null,
    }
  );
  if (data.updateActivitySummary === null) {
    throw new Error(`cluster-notebook has no nucleus named "${nucleusName}" — activity summary not saved`);
  }
  return data.updateActivitySummary;
}

export interface Individual {
  id: string;
  firstName: string | null;
  familyName: string | null;
  middleNames: string | null;
  nickname: string | null;
  sex: string | null;
  phone: string | null;
  email: string | null;
  ageCategory: string | null;
}

const INDIVIDUAL_SELECTION = 'id firstName familyName middleNames nickname sex phone email ageCategory';

// Simple display-name composition -- cluster-notebook's Individual already has
// firstName/middleNames/familyName/nickname as separate fields (unlike SRP's own
// single-string convention), so no parsing needed, just a readable join.
export function individualDisplayName(ind: Individual): string {
  const parts = [ind.firstName, ind.middleNames, ind.familyName].filter(Boolean);
  const name = parts.join(' ') || '(unnamed)';
  return ind.nickname ? `${name} (${ind.nickname})` : name;
}

// PII-scoped to the cluster containing nucleusName (via existing role assignments) --
// never notebook-wide. `search` is optional token matching across name fields; pass
// undefined/omit for no filter (still scoped to the cluster).
export async function searchIndividuals(nucleusName: string, search?: string): Promise<Individual[]> {
  const query = `
    query SearchIndividuals($nucleusName: String!, $search: String) {
      individuals(nucleusName: $nucleusName, search: $search) { ${INDIVIDUAL_SELECTION} }
    }
  `;
  const data = await request<{ individuals: Individual[] }>(query, { nucleusName, search: search ?? null });
  return data.individuals;
}

// Intentionally dumb on cluster-notebook's side: `name` becomes the entire
// firstName, nothing else populated or split. Reconciling with a real SRP record
// is a separate, not-yet-built step.
export async function createIndividual(name: string, nucleusName: string): Promise<Individual> {
  const mutation = `
    mutation CreateIndividual($name: String!, $nucleusName: String!) {
      createIndividual(name: $name, nucleusName: $nucleusName) { ${INDIVIDUAL_SELECTION} }
    }
  `;
  const data = await request<{ createIndividual: Individual | null }>(mutation, { name, nucleusName });
  if (data.createIndividual === null) {
    throw new Error(`cluster-notebook has no nucleus named "${nucleusName}" — individual not created`);
  }
  return data.createIndividual;
}

// `role` is a fully open string on cluster-notebook's side (no fixed enum) --
// "accompanier"/"protagonist"/"abm-assistant" today, anything else works the same way.
export async function getNucleusWorkers(nucleusName: string, role: string): Promise<Individual[]> {
  const query = `
    query GetNucleusWorkers($name: String!, $role: String!) {
      nucleus(name: $name) { workers(role: $role) { ${INDIVIDUAL_SELECTION} } }
    }
  `;
  const data = await request<{ nucleus: { workers: Individual[] } | null }>(query, { name: nucleusName, role });
  return data.nucleus?.workers ?? [];
}

// Full-list replace, same pattern as updateNucleus -- personIds is the complete
// ordered list for this (nucleus, role) pair, not an incremental add/remove.
export async function updateNucleusWorkers(nucleusName: string, role: string, personIds: string[]): Promise<Individual[]> {
  const mutation = `
    mutation UpdateNucleusWorkers($name: String!, $role: String!, $personIds: [String!]!) {
      updateNucleusWorkers(nucleusName: $name, role: $role, personIds: $personIds) {
        workers(role: $role) { ${INDIVIDUAL_SELECTION} }
      }
    }
  `;
  const data = await request<{ updateNucleusWorkers: { workers: Individual[] } | null }>(mutation, { name: nucleusName, role, personIds });
  if (data.updateNucleusWorkers === null) {
    throw new Error(`cluster-notebook has no nucleus named "${nucleusName}" — workers not saved`);
  }
  return data.updateNucleusWorkers.workers;
}

// Ad hoc, single-entity permission check -- works on Nucleus, Cluster, Locality,
// or Setting names (confirmed live). Null means cluster-notebook doesn't
// recognize entityName; callers normalize that themselves (see access.ts's
// getNucleusPermissions) rather than this function guessing at a default.
export async function getMyPermissions(entityName: string): Promise<PermissionSet | null> {
  const query = `
    query GetMyPermissions($entityName: String!) {
      myPermissions(entityName: $entityName) { ${PERMISSION_SET_SELECTION} }
    }
  `;
  const data = await request<{ myPermissions: PermissionSet | null }>(query, { entityName });
  return data.myPermissions;
}

// role + its real PermissionSet together, so a picker can describe what a role
// actually does ("can edit this nucleus's name/location") instead of showing a
// bare role name.
export interface RoleGrant {
  role: string;
  permissions: PermissionSet;
}

export async function getAssignableRoleDetails(entityName: string): Promise<RoleGrant[]> {
  const query = `
    query GetAssignableRoleDetails($entityName: String!) {
      assignableRoleDetails(entityName: $entityName) { role permissions { ${PERMISSION_SET_SELECTION} } }
    }
  `;
  const data = await request<{ assignableRoleDetails: RoleGrant[] | null }>(query, { entityName });
  return data.assignableRoleDetails ?? [];
}

// The one true global/org-wide concept (the Administrator role, no entity
// attached) -- confirmed live 2026-09-24. Not the same as having elevated
// PermissionSet values everywhere; this is a direct, explicit check.
export async function getIsAdministrator(): Promise<boolean> {
  const query = `
    query GetIsAdministrator {
      isAdministrator
    }
  `;
  const data = await request<{ isAdministrator: boolean }>(query, {});
  return data.isAdministrator;
}
