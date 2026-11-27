import { auth } from '@clerk/nextjs/server';
import { LOG_PAGE } from './admin';

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
// Nucleus's Type/Stage (and rename/relocate -- `name` is now patchable, see updateNucleus) specifically -- a
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
  errors?: { message: string; extensions?: { code?: string; [k: string]: unknown } }[];
}

// Thrown instead of a plain Error when cluster-notebook rejects a call for
// permission reasons (confirmed with cluster-notebook 2026-09-24:
// extensions.code === 'FORBIDDEN' is the contract; the message text is not --
// it's still "Not authenticated." even for a real permission denial, so callers
// should never rely on it, only on this error type).
export class ClusterNotebookForbiddenError extends Error {}

// Any other extensions.code (e.g. SRP_NAME_CLASH) -- callers branch on `.code`,
// never on the message text.
export class ClusterNotebookCodedError extends Error {
  // `message` carries the "cluster-notebook GraphQL error: " prefix for logs;
  // `upstreamMessage` is the raw first-error text, safe to show to users.
  // `extensions` is the full upstream extensions object (e.g. MOVE_REFUSED lists `people`).
  constructor(message: string, public code: string, public upstreamMessage: string, public extensions: Record<string, unknown> = {}) {
    super(message);
  }
}

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
    const message = `cluster-notebook GraphQL error: ${json.errors.map(e => e.message).join('; ')}`;
    const code = json.errors[0]?.extensions?.code;
    if (typeof code === 'string' && code) {
      throw new ClusterNotebookCodedError(message, code, json.errors[0].message, json.errors[0].extensions ?? {});
    }
    throw new Error(message);
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

// Confirmed with cluster-notebook directly, 2026-10-04. `at` is always present
// whenever `lastUpdated` itself is non-null (see below); `by` is one of: a
// person's real name; "SRP sync" (the label is reserved, but can't occur yet --
// the SRP read direction isn't built, only outbox bookkeeping exists so far);
// "System" for script/seed writes that opened no audit context; or null when the
// caller's role lacks a separate `can_see_actors` permission (not part of
// PermissionSet, and not something we pre-check -- the server has already
// decided by the time `by` comes back null, so we just branch on it, never ask
// cluster-notebook to re-derive the same answer ourselves).
export interface LastUpdated {
  at: string;
  by: string | null;
}

// Confirmed with cluster-notebook directly, 2026-10-08.
export type PlaceType = 'CLUSTER' | 'LOCALITY' | 'SETTING';

// Confirmed with cluster-notebook 2026-11-16: srpAction is the latest SRP
// create/rename/delete request for a nucleus (null when none). `status` is a
// plain string so values we don't know yet survive.
export interface SrpAction {
  action: 'create' | 'rename' | 'delete';
  status: string;
  requestedAt: string;
  error: string | null;
  individuals: number | null;
  activities: number | null;
  // Confirmed with cluster-notebook 2026-11-17: true when SRP has applied the change, or may have.
  // Meaningful when status is 'failed'.
  srpChanged: boolean;
}

// The "(x)" beside each Overview estimate: counts of named people. Confirmed with cluster-notebook 2026-11-27: every
// rule is theirs (which nuclei: a Neighborhood plus all its Neighborhood descendants; each person once; hides),
// so the app shows these as they come. Keys are the Overview estimate fields; nucleiCounted is how many nuclei the
// counts cover (1 = just this one). memberCount stays this nucleus's own, for the type-change prompts.
export type NamedCounts = {
  inConversation: number; inEducationalActivities: number; educationalFacilitators: number; devotionalHosts: number;
  protagonists: number; helpingOthers: number; accompanying: number; nucleiCounted: number;
};
const NAMED_COUNTS_SELECTION = 'namedCounts { inConversation inEducationalActivities educationalFacilitators devotionalHosts protagonists helpingOthers accompanying nucleiCounted }';

// Group activity totals for the activities card's "With N under it" view. Confirmed with cluster-notebook 2026-11-27
// (their PR #61): each figure sums every nucleus's effective value (override, else SRP-derived) over this nucleus and
// all its live descendants of any type; null when no nucleus in the tree has one. nucleiCounted - 1 is how many are
// under it, a different N from namedCounts.nucleiCounted (Neighborhood descendants only). The owner chose summing.
export interface ActivityCounts { number: number | null; participants: number | null; participantsFof: number | null }
export interface ActivityTotals {
  nucleiCounted: number;
  devotionalGathering: ActivityCounts; childrensClasses: ActivityCounts;
  juniorYouthGroups: ActivityCounts; studyCircles: ActivityCounts;
}
const ACTIVITY_COUNTS = '{ number participants participantsFof }';
const ACTIVITY_TOTALS_SELECTION = `activityTotals { nucleiCounted devotionalGathering ${ACTIVITY_COUNTS} childrensClasses ${ACTIVITY_COUNTS} juniorYouthGroups ${ACTIVITY_COUNTS} studyCircles ${ACTIVITY_COUNTS} }`;

const SRP_SELECTION = 'inSrp srpName srpAction { action status requestedAt error individuals activities srpChanged }';

export interface NucleusFields {
  // Optional: `inSrp` isn't on the cluster-notebook branch yet; `srpAction` is
  // optional here only so existing NucleusFields fixtures keep compiling.
  inSrp?: boolean;
  // Confirmed with cluster-notebook (members of a nucleus; not deployed yet at time of writing): isHome means the
  // nucleus has its own Setting (any Neighborhood; inSrp = linked to SRP); memberCount counts the nucleus's members; srpPlace is the
  // SRP neighbourhood it is linked to. Optional for the same reason as inSrp: existing fixtures keep compiling.
  isHome?: boolean;
  memberCount?: number;
  namedCounts?: NamedCounts;
  activityTotals?: ActivityTotals;
  srpPlace?: { id: string; name: string } | null;
  // Confirmed with cluster-notebook 2026-11-18 (#39): SRP's last-known name for a home nucleus's FN; null unless inSrp.
  srpName?: string | null;
  srpAction?: SrpAction | null;
  stage: string | null;
  locality: string | null;
  populationMakeup: string | null;
  population: number | null;
  households: number | null;
  connectedPopulation: number | null;
  connectedHouseholds: number | null;
  // The following eight, added 2026-10-07, are a different kind of field from
  // population/households/connectedPopulation/connectedHouseholds above: hand-
  // entered estimates, synced BOTH WAYS with SRP's FocusNeighbourhood record (SRP
  // sums across co-located nuclei on write -- same rule as households). Null means
  // "not recorded", never coerce to 0. Deliberately NOT derived from our own role-
  // assignment lists (protagonist/promoter/accompanier workers()) or from activity-
  // summary totals -- SRP itself only stores numbers, never names, so a count
  // derived from our lists could never round-trip with it. The role lists stay,
  // for naming specific individuals, but these numbers are now independently
  // editable -- confirmed with cluster-notebook directly. `protagonists` is their
  // term for what our UI calls "Promoting" (SRP: "protagonists promoting") --
  // unrelated to our own 'protagonist' role, which we display as "Helping Others".
  inConversation: number | null;
  inCommunityActivities: number | null;
  protagonists: number | null;
  devotionalHosts: number | null;
  inEducationalActivities: number | null;
  educationalFacilitators: number | null;
  helpingOthers: number | null;
  accompanying: number | null;
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
  // The raw value `locationName` sets -- distinct from locality/cluster above,
  // which are both DERIVED by walking up from this. Every nucleus has one (at
  // minimum its own Cluster) -- cluster-notebook commit c40fb54, 2026-10-08,
  // superseding their own earlier guidance that null was legitimate here
  // (including for a "pocket" -- see parentNucleus above; a pocket now needs a
  // Cluster or Locality too, specifically to stay off a Setting, which is the one
  // place SRP sums counts together). `type` says which tier `name` is at, and
  // governs nucleusType below: at a SETTING, type is always forced to
  // "Neighborhood" (attempting to set anything else now raises a real error,
  // not a silent revert); at a CLUSTER or LOCALITY, nucleusType is freely
  // settable. Naming a Nucleus here is rejected server-side (that's
  // parentNucleusName's job, not this field's); `null` is also rejected now --
  // this should only ever actually be null for a handful of already-archived
  // (soft-deleted) nuclei that predate this rule.
  location: { name: string; type: PlaceType } | null;
  // Aggregated server-side across this Nucleus's own fields AND all four
  // ActivitySummary rows -- whichever changed most recently (so an activity-only
  // edit moves this too, by design: both show up on the same detail page).
  // Non-null only once something has actually been audited -- null for a nucleus
  // created/last-touched before cluster-notebook's audit logging began,
  // 2026-09-25 (no row to report, not an unknown actor). See LastUpdated above
  // for what `by` can be.
  lastUpdated: LastUpdated | null;
}

// Deliberately not `extends NucleusFields` — the picker (getAllNuclei's caller)
// doesn't need population/households/connected*, and its query below doesn't
// request them, so keep this decoupled from NucleusFields' full shape.
export interface NucleusSummary {
  // Confirmed with cluster-notebook 2026-11-25: a stable uuid that survives renames. Used for the address bar.
  id: string;
  name: string;
  inSrp?: boolean;
  srpAction: SrpAction | null;
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
  // Only `type` is requested here; srpStateFor uses it to show a given-up (moved to Cluster) nucleus as local-only.
  location?: { type: PlaceType } | null;
  // Added 2026-09-24 for real per-nucleus authorization -- fetched in the same
  // request as the rest of the list (cluster-notebook designed this as a field
  // specifically so a list of nuclei costs one request, not one per nucleus).
  myPermissions: PermissionSet;
  // Overview card's nine fields, added 2026-10-08 so Picker's rollup cards can
  // sum them into a popup concentric diagram without a per-nucleus follow-up
  // query (confirmed with cluster-notebook: these are plain columns on the
  // nucleus row, so selecting them in the list query adds no per-nucleus work,
  // unlike computed fields such as workers/myPermissions's own activity-summary
  // siblings). `population` kept under that name here, not renamed to totalPop
  // -- the totalPop rename only happens where this gets mapped onto the row
  // shape, in data.ts/route.ts.
  population: number | null;
  inConversation: number | null;
  inCommunityActivities: number | null;
  protagonists: number | null;
  devotionalHosts: number | null;
  inEducationalActivities: number | null;
  educationalFacilitators: number | null;
  helpingOthers: number | null;
  accompanying: number | null;
}

// Deliberately not `extends ClusterFields` -- same reasoning as NucleusSummary not
// extending NucleusFields above: this is the create-flow's own purpose-built shape,
// decoupled from the fuller ClusterFields nested under Nucleus/NucleusSummary, which
// has no use for myPermissions and never requests it.
export interface ClusterSummary {
  name: string;
  myPermissions: PermissionSet;
}

// No top-level clusters query existed until 2026-09-14 (Cluster was only reachable
// nested under Nucleus.cluster) -- added specifically to back our "+Add" cluster
// picker. Deliberately no inline cluster creation: clusters are real, SRP-sourced
// geographic entities, not something a user invents ad hoc.
//
// myPermissions added 2026-10-05, mirroring Nucleus.myPermissions (same reason:
// cluster-notebook designed it as a field so a list of clusters costs one request,
// not one per cluster) -- determines whether "+Add nucleus" shows at all (true if
// ANY cluster's createableEntityTypes includes 'nucleus') and which clusters
// CreateNucleusModal's dropdown should actually offer, so the UI and the PUT route's
// own enforcement agree by construction rather than by coincidence. Dropped
// groupOfClusters/growthMilestone/auxiliaryBoardMembers from the query -- confirmed
// unused by this function's one caller, which only ever read `.name`.
export async function getClusters(): Promise<ClusterSummary[]> {
  const query = `
    query GetClusters {
      clusters { name myPermissions { ${PERMISSION_SET_SELECTION} } }
    }
  `;
  const data = await request<{ clusters: ClusterSummary[] }>(query, {});
  return data.clusters;
}

// Backs the Location picker (2026-10-08) -- scoped to one cluster at a time (a
// nucleus's own cluster is fixed, so there's never a reason to fetch every
// cluster's tree). `clusters`/`Cluster.localities`/`Locality.settings` all take
// an optional name to narrow the query like a path; passing it at the top level
// here is enough to get just this one cluster's localities back. Each level is
// already scoped to what the caller can read -- a Locality/Setting simply isn't
// in the tree if it isn't readable, so an empty array here can mean either "this
// cluster really has none" or "the caller can't see any"; either way there's
// nothing to offer. `srpLinked`/`nuclei` (confirmed with cluster-notebook
// directly) are what let the picker warn before summing a nucleus's counts into
// a Setting that already has others -- `nuclei` lists whoever's already there
// (filter out this nucleus's own name before displaying it as "shared with").
export interface SettingOption {
  name: string;
  srpLinked: boolean;
  nuclei: string[];
}
export interface LocalityOption {
  id: string;
  name: string;
  settings: SettingOption[];
}

export async function getLocationOptions(clusterName: string): Promise<LocalityOption[]> {
  const query = `
    query GetLocationOptions($clusterName: String) {
      clusters(name: $clusterName) {
        localities { id name settings { name srpLinked nuclei } }
      }
    }
  `;
  const data = await request<{ clusters: { localities: LocalityOption[] }[] }>(query, { clusterName });
  return data.clusters[0]?.localities ?? [];
}

// Identity-only at creation -- everything else (location, nucleusType, stage,
// population, activities, worker roles) goes through the same update mutations
// used for editing, not through this call. Returns null for an unknown
// clusterName (same "not found -> null" convention as everywhere else); throws a
// real GraphQL error for a duplicate name (global uniqueness, enforced at the DB
// level on cluster-notebook's side, 2026-09-14) -- distinguishable from the null
// case so callers can tell "bad cluster" from "name taken".
// Confirmed with cluster-notebook 2026-11-16: the optional srpLocalityName asks
// cluster-notebook to also create the nucleus in SRP under that locality; SRP
// failures surface as coded errors (e.g. SRP_NAME_CLASH, see
// ClusterNotebookCodedError). Sent only when given.
export async function createNucleus(name: string, clusterName: string, srpLocalityName?: string): Promise<NucleusFields | null> {
  const mutation = `
    mutation CreateNucleus($name: String!, $clusterName: String!, $srpLocalityName: String) {
      createNucleus(name: $name, clusterName: $clusterName, srpLocalityName: $srpLocalityName) {
        ${NUCLEUS_FIELDS_SELECTION}
      }
    }
  `;
  const variables: Record<string, unknown> = { name, clusterName };
  if (srpLocalityName !== undefined) variables.srpLocalityName = srpLocalityName;
  const data = await request<{ createNucleus: NucleusFields | null }>(mutation, variables);
  return data.createNucleus;
}

// Confirmed with cluster-notebook 2026-11-16: pushes an existing nucleus to SRP.
// Returns the refreshed fields (srpAction reflects the new request).
export async function pushNucleusToSrp(name: string): Promise<NucleusFields | null> {
  const mutation = `
    mutation PushNucleusToSrp($name: String!) {
      pushNucleusToSrp(name: $name) {
        ${NUCLEUS_FIELDS_SELECTION}
      }
    }
  `;
  const data = await request<{ pushNucleusToSrp: NucleusFields | null }>(mutation, { name });
  return data.pushNucleusToSrp;
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
        id name stage locality populationMakeup nucleusType
        devotionalGathering { ${ACTIVITY_SUMMARY_SELECTION} }
        childrensClasses { ${ACTIVITY_SUMMARY_SELECTION} }
        juniorYouthGroups { ${ACTIVITY_SUMMARY_SELECTION} }
        studyCircles { ${ACTIVITY_SUMMARY_SELECTION} }
        cluster { name groupOfClusters growthMilestone auxiliaryBoardMembers }
        parentNucleus { name }
        location { type }
        myPermissions { ${PERMISSION_SET_SELECTION} }
        population inConversation inCommunityActivities protagonists devotionalHosts
        inEducationalActivities educationalFacilitators helpingOthers accompanying
        ${SRP_SELECTION}
      }
    }
  `;
  const data = await request<{ nuclei: NucleusSummary[] }>(query, {});
  return data.nuclei;
}

const NUCLEUS_FIELDS_SELECTION = 'stage locality populationMakeup population households connectedPopulation connectedHouseholds '
  + 'inConversation inCommunityActivities protagonists devotionalHosts inEducationalActivities educationalFacilitators helpingOthers accompanying '
  + 'hasSocialAction socialActionDescription hasCommunityGatherings communityGatheringDescription narrative nucleusType '
  + 'cluster { name groupOfClusters growthMilestone auxiliaryBoardMembers } parentNucleus { name } lastUpdated { at by } '
  + 'location { name type } isHome memberCount ' + NAMED_COUNTS_SELECTION + ' ' + ACTIVITY_TOTALS_SELECTION + ' ' + SRP_SELECTION;

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
  // NOTE: no `locality` here -- REMOVED from NucleusPatch 2026-09-13, and never
  // coming back: it's a read-only derived value (walked up from `locationName`
  // below), not a hand-entered field.
  patch: {
    // Confirmed with cluster-notebook 2026-11-16: rename via the patch (gated by
    // canChangeIdentity; for SRP-linked nuclei it queues an SRP rename action).
    name?: string;
    stage?: string; populationMakeup?: string;
    population?: number | null; households?: number | null;
    connectedPopulation?: number | null; connectedHouseholds?: number | null;
    // The following eight -- see NucleusFields' own comment above for what makes
    // them different (SRP-synced estimates, independent of our role lists).
    inConversation?: number | null; inCommunityActivities?: number | null;
    protagonists?: number | null; devotionalHosts?: number | null;
    inEducationalActivities?: number | null; educationalFacilitators?: number | null;
    helpingOthers?: number | null; accompanying?: number | null;
    hasSocialAction?: boolean | null; socialActionDescription?: string;
    hasCommunityGatherings?: boolean | null; communityGatheringDescription?: string;
    narrative?: string;
    nucleusType?: string;
    // Members of a nucleus (not deployed yet): localityId places a nucleus in a locality (NEEDS_LOCALITY when
    // a Neighborhood has none); membersOnTypeChange says what to do with members when the type changes
    // (HAS_MEMBERS when omitted and there are some).
    localityId?: string;
    membersOnTypeChange?: 'MOVE_IN' | 'END';
    // Added 2026-09-14 -- a plain string (unlike the `parentNucleus { name }` query
    // field), not nested. null clears the parent; an unknown name throws a real
    // error rather than silently no-opping.
    parentNucleusName?: string | null;
    // Added 2026-10-08 -- any Cluster/Locality/Setting name (never a Nucleus --
    // cluster-notebook rejects that, pointing at parentNucleusName instead, as of
    // their commit 7142aab). `null` is ALSO rejected as of commit c40fb54, same
    // day -- every nucleus must have a location (at minimum its own Cluster), so
    // our UI should never actually send null here; the type stays nullable only
    // because the field itself is (not because sending null is ever a good idea).
    // Same gate as `name`/identity changes generally (canChangeIdentity).
    locationName?: string | null;
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
  // Each field is genuinely optional, not just nullable -- confirmed with
  // cluster-notebook directly, 2026-10-03. Their resolver defaults these three
  // arguments to strawberry.UNSET and only assigns a field when it's not UNSET,
  // so a field this function is never TOLD about must be omitted from the GraphQL
  // variables entirely, not defaulted to null -- null is a real, explicit "clear
  // this field", indistinguishable server-side from a deliberate clear. request()'s
  // JSON.stringify drops object keys whose value is undefined, so building
  // `variables` by only setting the keys actually present in `fields` (never
  // `?? null`) is what gets this right.
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
  const variables: Record<string, unknown> = { nucleusName, activityType };
  if ('number' in fields) variables.number = fields.number;
  if ('participants' in fields) variables.participants = fields.participants;
  if ('participantsFof' in fields) variables.participantsFof = fields.participantsFof;
  const data = await request<{ updateActivitySummary: ActivitySummaries | null }>(mutation, variables);
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

// The name fields only. Confirmed with cluster-notebook 2026-11-18: individuals() returns PersonSummary,
// which has no sex, phone, email or ageCategory. These fields are valid on both Individual and PersonSummary.
export type PersonName = Pick<Individual, 'id' | 'firstName' | 'familyName' | 'middleNames' | 'nickname'>;
const PERSON_NAME_SELECTION = 'id firstName familyName middleNames nickname';

// Confirmed with cluster-notebook 2026-11-18 (People card, phase 1): a person's place is a Cluster,
// Locality or Setting. `locality` is set only for a SETTING; `cluster` is null for a CLUSTER.
// Phase 2 (2026-11-19): `id` identifies the place for moves (never move by name: names repeat, #41).
// `localityId` is the containing Locality's id for a SETTING, else null. `homeNucleus` is the name of
// the home nucleus whose FN this Setting is, else null (shown to anyone who sees the place).
export interface PlaceSummary {
  id: string; name: string; type: PlaceType; locality: string | null; cluster: string | null;
  localityId: string | null; homeNucleus: string | null;
}
// Confirmed with cluster-notebook 2026-11-19: the person's latest place change, or null if none.
// Key off `code`, never the raw `error` text (#43).
export interface PlaceSync {
  status: 'pending' | 'in_flight' | 'synced' | 'refused' | 'failed' | 'not_in_srp';
  code: string | null;
}
// Confirmed with cluster-notebook 2026-11-19 (PR #45): inSrp is true if SRP has given us this person, false if
// they exist only here (createIndividual never creates anyone in SRP). False doesn't prove SRP lacks them: someone
// typed in here may duplicate a person SRP holds.
export interface PersonSummary extends PersonName { place: PlaceSummary | null; placeSync: PlaceSync | null; inSrp: boolean }
// roles: those held on this nucleus itself (not at its Cluster or Locality). isResident: placed at this
// nucleus's Setting, and only ever true on a home nucleus.
export type AgeCategory = 'CHILD' | 'JUNIOR_YOUTH' | 'YOUTH' | 'ADULT';
export type DevotionalHostRole = 'HOST' | 'CO_HOST';
// Confirmed with cluster-notebook 2026-11-21 (phase B, deployed): participates / facilitates come from the roster of
// an activity that is not completed (facilitates: a current facilitator). participation is newest first and visible
// to anyone who can read the nucleus: one entry per study item (book, grade or text) the person was on, plus one per
// activity with no study item (studyItem null, the activity's own dates). SRP activities have no name; heldAt is
// the name of the activity's nucleus, Setting or Locality. activityType is cc, jyg or sc. Rosters are read with
// each locality read, not live.
export type ActivityRole = 'PARTICIPANT' | 'FACILITATOR';
export interface Participation {
  activityId: string; activityType: string; heldAt: string | null; role: ActivityRole;
  studyItem: string | null; studyItemTitle: string | null;
  startDate: string | null; endDate: string | null; completed: boolean; current: boolean;
  // Confirmed with cluster-notebook 2026-11-23: studyItemShortName is SRP's short name ("B3 (G1)", "G1", "BC"),
  // null only when there is no study item. personCompleted is whether this participant completed it, null for
  // facilitators or when SRP records nothing. completed stays the item's (or activity's) own completion.
  studyItemShortName: string | null; personCompleted: boolean | null;
}
// hide is null unless the person is hidden AND the caller can edit the nucleus.
export interface PersonHide { hiddenAt: string; hiddenBy: PersonSummary | null; reason: string | null }
export interface NucleusPerson {
  individual: PersonSummary; roles: string[]; isResident: boolean;
  ageCategory: AgeCategory | null; devotionalHost: DevotionalHostRole | null;
  participates: boolean; facilitates: boolean; participation: Participation[];
  hidden: boolean; hide: PersonHide | null;
}
const PARTICIPATION_SELECTION = 'activityId activityType heldAt role studyItem studyItemTitle startDate endDate completed current studyItemShortName personCompleted';
const PLACE_SELECTION = 'id name type locality cluster localityId homeNucleus';
const PERSON_SUMMARY_SELECTION = `${PERSON_NAME_SELECTION} inSrp place { ${PLACE_SELECTION} } placeSync { status code }`;

// individualDisplayName lives in personName.ts so browser code can use it without importing this
// server-only module; re-exported here for existing callers.
export { individualDisplayName } from './personName';

// Everyone placed in the cluster containing nucleusName (needs WRITE on the nucleus; a reader
// gets []), ordered by family then first name -- confirmed with cluster-notebook 2026-11-18. Never
// notebook-wide. `search` is optional token matching across name fields; `limit` caps the result.
export async function searchIndividuals(nucleusName: string, search?: string, limit?: number): Promise<PersonSummary[]> {
  const query = `
    query SearchIndividuals($nucleusName: String!, $search: String, $limit: Int) {
      individuals(nucleusName: $nucleusName, search: $search, limit: $limit) { ${PERSON_SUMMARY_SELECTION} }
    }
  `;
  const data = await request<{ individuals: PersonSummary[] }>(query, { nucleusName, search: search ?? null, limit: limit ?? null });
  return data.individuals;
}

// Just the counts, re-read after each change on the page so the "(x)" figures update at once. null when the
// nucleus isn't found.
export type NucleusCounts = { memberCount: number; namedCounts: NamedCounts; activityTotals: ActivityTotals };
export async function getNucleusCounts(nucleusName: string): Promise<NucleusCounts | null> {
  const query = `
    query NucleusCounts($name: String!) {
      nucleus(name: $name) { memberCount ${NAMED_COUNTS_SELECTION} ${ACTIVITY_TOTALS_SELECTION} }
    }
  `;
  const data = await request<{ nucleus: NucleusCounts | null }>(query, { name: nucleusName });
  return data.nucleus;
}

const NUCLEUS_PERSON_SELECTION = `individual { ${PERSON_SUMMARY_SELECTION} } roles isResident ageCategory devotionalHost participates facilitates participation { ${PARTICIPATION_SELECTION} } hidden hide { hiddenAt reason hiddenBy { ${PERSON_SUMMARY_SELECTION} } }`;

// Everyone connected to the nucleus: role holders here, plus residents on a home nucleus.
// Includes hidden people (flagged `hidden`); `hide` is only filled for callers who can edit.
// null when the nucleus isn't found.
export async function getNucleusPeople(nucleusName: string): Promise<NucleusPerson[] | null> {
  const query = `
    query GetNucleusPeople($name: String!) {
      nucleus(name: $name) { people(includeHidden: true) { ${NUCLEUS_PERSON_SELECTION} } }
    }
  `;
  const data = await request<{ nucleus: { people: NucleusPerson[] } | null }>(query, { name: nucleusName });
  return data.nucleus?.people ?? null;
}

export interface PersonChecks { backgroundCheckExpiration: string | null; motorVehicleClearance: boolean | null }
export interface PersonDetails {
  individual: PersonSummary; estimatedAge: number | null; isRegistered: boolean | null; registrationDate: string | null;
  address: string | null; phones: string[]; emails: string[]; srpComments: string | null; checks: PersonChecks | null;
}

// Confirmed with cluster-notebook 2026-11-20 (PR #46): null means not permitted, unknown nucleus, or the
// person isn't one of that nucleus's people. `checks` is null unless the caller has tier 2.
export async function getPersonDetails(individualId: string, nucleusName: string | null): Promise<PersonDetails | null> {
  // Confirmed with cluster-notebook 2026-11-24: with no nucleusName, an Administrator or a CSO of the person's
  // cluster may read the details. With a nucleus we send the original `String!` query unchanged, so the People
  // card works whether or not cluster-notebook's nullable change is deployed; only the no-nucleus case needs it.
  const body = `
        individual { ${PERSON_SUMMARY_SELECTION} } estimatedAge isRegistered registrationDate address phones emails srpComments
        checks { backgroundCheckExpiration motorVehicleClearance }
      }
    }
  `;
  const query = nucleusName === null
    ? `
    query GetPersonDetails($individualId: String!) {
      personDetails(individualId: $individualId) {${body}`
    : `
    query GetPersonDetails($individualId: String!, $nucleusName: String!) {
      personDetails(individualId: $individualId, nucleusName: $nucleusName) {${body}`;
  const variables = nucleusName === null ? { individualId } : { individualId, nucleusName };
  const data = await request<{ personDetails: PersonDetails | null }>(query, variables);
  return data.personDetails;
}

// Confirmed with cluster-notebook 2026-11-19: one result per person. `individual` is null for
// NOT_FOUND, OTHER_CLUSTER and FORBIDDEN (privacy); `code` is null when moved. Whole-call refusals
// (FORBIDDEN, LOCATION_NOT_FOUND, NOT_A_PLACE) come back as GraphQL errors.
export interface MoveResult { individual: PersonSummary | null; moved: boolean; code: string | null }

export async function moveIndividuals(individualIds: string[], locationId: string, withHousehold: boolean): Promise<MoveResult[]> {
  const mutation = `
    mutation MoveIndividuals($individualIds: [String!]!, $locationId: String!, $withHousehold: Boolean) {
      moveIndividuals(individualIds: $individualIds, locationId: $locationId, withHousehold: $withHousehold) {
        individual { ${PERSON_SUMMARY_SELECTION} } moved code
      }
    }
  `;
  const data = await request<{ moveIndividuals: MoveResult[] }>(mutation, { individualIds, locationId, withHousehold });
  return data.moveIndividuals;
}

// Where a nucleus is, and its parent, to work out where "move out" goes. null when not found.
export interface MoveContext {
  location: PlaceSummary | null; parent: { inSrp: boolean; location: PlaceSummary | null } | null;
  isHome: boolean; inSrp: boolean; srpPlace: PlaceSummary | null;
}

export async function getMoveContext(nucleusName: string): Promise<MoveContext | null> {
  const query = `
    query GetMoveContext($name: String!) {
      nucleus(name: $name) {
        location { ${PLACE_SELECTION} }
        parentNucleus { inSrp location { ${PLACE_SELECTION} } }
        isHome inSrp srpPlace { ${PLACE_SELECTION} }
      }
    }
  `;
  const data = await request<{ nucleus: (Omit<MoveContext, 'parent'> & { parentNucleus: MoveContext['parent'] }) | null }>(query, { name: nucleusName });
  if (!data.nucleus) return null;
  const n = data.nucleus;
  return { location: n.location, parent: n.parentNucleus, isHome: n.isHome, inSrp: n.inSrp, srpPlace: n.srpPlace };
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
export async function getNucleusWorkers(nucleusName: string, role: string, includeHidden = false): Promise<Individual[]> {
  const query = `
    query GetNucleusWorkers($name: String!, $role: String!, $includeHidden: Boolean) {
      nucleus(name: $name) { workers(role: $role, includeHidden: $includeHidden) { ${INDIVIDUAL_SELECTION} } }
    }
  `;
  const data = await request<{ nucleus: { workers: Individual[] } | null }>(query, { name: nucleusName, role, includeHidden });
  return data.nucleus?.workers ?? [];
}

// Full-list replace, same pattern as updateNucleus -- personIds is the complete
// ordered list for this (nucleus, role) pair, not an incremental add/remove.
// Note the mutation argument is `includesHidden` (the queries say `includeHidden`): pass true when
// personIds contains hidden people, so they aren't dropped from the role.
export async function updateNucleusWorkers(nucleusName: string, role: string, personIds: string[], includesHidden = false): Promise<Individual[]> {
  const mutation = `
    mutation UpdateNucleusWorkers($name: String!, $role: String!, $personIds: [String!]!, $includesHidden: Boolean) {
      updateNucleusWorkers(nucleusName: $name, role: $role, personIds: $personIds, includesHidden: $includesHidden) {
        workers(role: $role, includeHidden: $includesHidden) { ${INDIVIDUAL_SELECTION} }
      }
    }
  `;
  const data = await request<{ updateNucleusWorkers: { workers: Individual[] } | null }>(mutation, { name: nucleusName, role, personIds, includesHidden });
  if (data.updateNucleusWorkers === null) {
    throw new Error(`cluster-notebook has no nucleus named "${nucleusName}" — workers not saved`);
  }
  return data.updateNucleusWorkers.workers;
}

// Hide / unhide a person at one nucleus (FORBIDDEN unless the caller can edit it; coded error
// NOT_AT_NUCLEUS when the person isn't connected there). null when the nucleus isn't found.
export async function hideIndividual(individualId: string, nucleusName: string, reason: string | null): Promise<NucleusPerson | null> {
  const mutation = `
    mutation HideIndividual($individualId: String!, $nucleusName: String!, $reason: String) {
      hideIndividual(individualId: $individualId, nucleusName: $nucleusName, reason: $reason) { ${NUCLEUS_PERSON_SELECTION} }
    }
  `;
  const data = await request<{ hideIndividual: NucleusPerson | null }>(mutation, { individualId, nucleusName, reason });
  return data.hideIndividual;
}

export async function unhideIndividual(individualId: string, nucleusName: string): Promise<NucleusPerson | null> {
  const mutation = `
    mutation UnhideIndividual($individualId: String!, $nucleusName: String!) {
      unhideIndividual(individualId: $individualId, nucleusName: $nucleusName) { ${NUCLEUS_PERSON_SELECTION} }
    }
  `;
  const data = await request<{ unhideIndividual: NucleusPerson | null }>(mutation, { individualId, nucleusName });
  return data.unhideIndividual;
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

// ---- Admin page (Phase 1) ----

export interface AdminCluster { id: string; name: string }

// Confirmed with cluster-notebook 2026-11-24: every cluster for an Administrator; for a CSO, the clusters at or
// below each current CSO role. Empty means no Admin link. Cheap enough for every home-page load.
export async function getAdminClusters(): Promise<AdminCluster[]> {
  const data = await request<{ adminClusters: AdminCluster[] }>(`query GetAdminClusters { adminClusters { id name } }`, {});
  return data.adminClusters;
}

export interface AdminPerson { individual: PersonSummary; ageCategory: AgeCategory | null; placePath: string[]; hasAccess: boolean;
  // Confirmed with cluster-notebook 2026-11-24: the person's pending invitation, if any. Selected only by this admin search.
  pendingInvitation: { id: string; expiresAt: string } | null;
  // Confirmed with cluster-notebook 2026-11-25 (5a0b624): selected only by getRoleHoldersWithoutAccess. accessRemovedAt
  // is when the account was disabled (null if enabled or never had one); roles lists every current role.
  roles?: RoleHolding[];
  accessRemovedAt?: string | null;
  // Confirmed with cluster-notebook 2026-11-25: selected only by getPeopleNotInSrp. createdAt is from the audit log
  // (null before auditing began); createdBy is null for the SRP sync, scripts, or before auditing.
  createdAt?: string | null;
  createdBy?: PersonSummary | null;
}

const ADMIN_PERSON_SELECTION = `individual { ${PERSON_SUMMARY_SELECTION} } ageCategory placePath hasAccess pendingInvitation { id expiresAt }`;

// Confirmed with cluster-notebook 2026-11-24: allowed for an Administrator or a CSO of the cluster. Names repeat,
// so every result carries ageCategory and placePath; later calls use the person's id.
export async function searchPeople(clusterName: string, search: string, limit = 20): Promise<AdminPerson[]> {
  const query = `
    query SearchPeople($clusterName: String!, $search: String!, $limit: Int) {
      searchPeople(clusterName: $clusterName, search: $search, limit: $limit) {
        ${ADMIN_PERSON_SELECTION}
      }
    }
  `;
  const data = await request<{ searchPeople: AdminPerson[] }>(query, { clusterName, search, limit });
  return data.searchPeople;
}

// Confirmed with cluster-notebook 2026-11-25: people placed in the cluster with no SRP link (holding a role there
// doesn't count), ordered by family name, first name, id. Same admin gate as hiddenPeople; unknown cluster is [].
export async function getPeopleNotInSrp(clusterName: string): Promise<AdminPerson[]> {
  const query = `
    query GetPeopleNotInSrp($clusterName: String!) {
      peopleNotInSrp(clusterName: $clusterName) {
        ${ADMIN_PERSON_SELECTION} createdAt createdBy { ${PERSON_SUMMARY_SELECTION} }
      }
    }
  `;
  const data = await request<{ peopleNotInSrp: AdminPerson[] }>(query, { clusterName });
  return data.peopleNotInSrp;
}

// Confirmed with cluster-notebook 2026-11-25 (5a0b624): holdsRole = a current recognised role (not Administrator,
// promoter or protagonist) at a live place in the cluster; hasAccess false includes people whose access was removed.
// No maximum limit, so 1000 reads them all; the card caps what it shows.
export async function getRoleHoldersWithoutAccess(clusterName: string): Promise<AdminPerson[]> {
  const query = `
    query GetRoleHoldersWithoutAccess($clusterName: String!, $search: String!, $limit: Int!, $holdsRole: Boolean, $hasAccess: Boolean) {
      searchPeople(clusterName: $clusterName, search: $search, limit: $limit, holdsRole: $holdsRole, hasAccess: $hasAccess) {
        ${ADMIN_PERSON_SELECTION} roles { id role entity { id name type } start } accessRemovedAt
      }
    }
  `;
  const data = await request<{ searchPeople: AdminPerson[] }>(query, { clusterName, search: '', limit: 1000, holdsRole: true, hasAccess: false });
  return data.searchPeople;
}

// Confirmed with cluster-notebook 2026-11-25: `changes` is { field: { old, new } } (create: old null; delete: new null;
// update: changed fields only). actor is null for the SRP sync, scripts, anything not done by a signed-in person.
export interface LogEntry { id: string; occurredAt: string; actor: PersonSummary | null; mutation: string | null; entityType: string; entityId: string; changeType: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  // Confirmed with cluster-notebook 2026-11-25: the place, person, invitation or account name (or a role/hide
  // description); null if the row is gone. The Log card's headline uses it.
  entityName?: string | null;
  // Members of a nucleus (not deployed yet): why the change was made (null if none given), and id -> display
  // name for the ids that appear in `changes`.
  reason: string | null;
  names: Record<string, string> }

// Confirmed with cluster-notebook 2026-11-25: newest first (occurredAt desc, id desc). Keyset: strictly older than
// (before, beforeId), which are the last row's occurredAt and id. limit 1..500; beforeId without before is BAD_INPUT.
// Same admin gate as hiddenPeople; unknown cluster is []. `changes` is a JSON scalar: no subselection.
export async function getChangeLog(clusterName: string, page?: { before: string; beforeId: string }): Promise<LogEntry[]> {
  const query = `
    query GetChangeLog($clusterName: String!, $limit: Int!, $before: DateTime, $beforeId: String) {
      changeLog(clusterName: $clusterName, limit: $limit, before: $before, beforeId: $beforeId) {
        id occurredAt actor { ${PERSON_SUMMARY_SELECTION} } mutation entityType entityId changeType changes entityName reason names
      }
    }
  `;
  const variables: Record<string, unknown> = { clusterName, limit: LOG_PAGE };
  if (page) { variables.before = page.before; variables.beforeId = page.beforeId; }
  const data = await request<{ changeLog: LogEntry[] }>(query, variables);
  return data.changeLog;
}

export interface AdminLocation { id: string; name: string; type: string }
export interface RoleHolding { id: string; role: string; entity: AdminLocation | null; start: string | null }

// Confirmed with cluster-notebook 2026-11-24: the roles the caller may see. `entity` is null for Administrator.
export async function getIndividualRoles(individualId: string): Promise<RoleHolding[]> {
  const query = `
    query GetIndividualRoles($individualId: String!) {
      individualRoles(individualId: $individualId) { id role entity { id name type } start }
    }
  `;
  const data = await request<{ individualRoles: RoleHolding[] }>(query, { individualId });
  return data.individualRoles;
}

export interface AdminPlace { id: string; name: string; type: 'cluster' | 'locality' | 'setting' | 'nucleus'; parentId: string | null; parentName: string | null }

// Confirmed with cluster-notebook 2026-11-24: the cluster and every locality, setting and live nucleus under it,
// parents first. Names such as "Chapel Hill" repeat, so places are chosen by id.
export async function getAdminPlaces(clusterName: string): Promise<AdminPlace[]> {
  const query = `
    query GetAdminPlaces($clusterName: String!) {
      adminPlaces(clusterName: $clusterName) { id name type parentId parentName }
    }
  `;
  const data = await request<{ adminPlaces: AdminPlace[] }>(query, { clusterName });
  return data.adminPlaces;
}

// Confirmed with cluster-notebook 2026-11-24: exactly grantRole's gate, so the picker offers only roles that will succeed.
export async function getAssignableRolesAt(entityId: string): Promise<RoleGrant[]> {
  const query = `
    query GetAssignableRolesAt($entityId: String!) {
      assignableRolesAt(entityId: $entityId) { role permissions { ${PERMISSION_SET_SELECTION} } }
    }
  `;
  const data = await request<{ assignableRolesAt: RoleGrant[] }>(query, { entityId });
  return data.assignableRolesAt;
}

// Confirmed with cluster-notebook 2026-11-24: gated like assignableRoles; granting a role already held is unchanged.
export async function grantRole(individualId: string, role: string, entityId: string): Promise<RoleHolding> {
  const mutation = `
    mutation GrantRole($individualId: String!, $role: String!, $entityId: String!) {
      grantRole(individualId: $individualId, role: $role, entityId: $entityId) { id role entity { id name type } start }
    }
  `;
  const data = await request<{ grantRole: RoleHolding }>(mutation, { individualId, role, entityId });
  return data.grantRole;
}

// Confirmed with cluster-notebook 2026-11-24: SELF_LOCKOUT when ending the caller's own last role that gives
// admin standing over a cluster (last Administrator, or last CSO covering it).
export async function endRole(roleId: string): Promise<boolean> {
  const mutation = `
    mutation EndRole($roleId: String!) {
      endRole(roleId: $roleId)
    }
  `;
  const data = await request<{ endRole: boolean }>(mutation, { roleId });
  return data.endRole;
}

export interface HiddenPerson { individual: PersonSummary; nucleusName: string; roles: string[]; isResident: boolean; hide: PersonHide }

// Confirmed with cluster-notebook 2026-11-24: an Administrator or a CSO of the cluster can read, unhide and
// move anyone hidden in it (they inherit WRITE down from the cluster).
export async function getHiddenPeople(clusterName: string): Promise<HiddenPerson[]> {
  const query = `
    query GetHiddenPeople($clusterName: String!) {
      hiddenPeople(clusterName: $clusterName) {
        individual { ${PERSON_SUMMARY_SELECTION} } nucleusName roles isResident hide { hiddenAt reason hiddenBy { ${PERSON_SUMMARY_SELECTION} } }
      }
    }
  `;
  const data = await request<{ hiddenPeople: HiddenPerson[] }>(query, { clusterName });
  return data.hiddenPeople;
}

// ---- Admin page (Phase 2): invitations and accounts ----

// Confirmed with cluster-notebook 2026-11-24: the caller as a person; null when they have no Individual record.
export async function getMe(): Promise<PersonSummary | null> {
  const data = await request<{ me: PersonSummary | null }>(`query GetMe { me { ${PERSON_SUMMARY_SELECTION} } }`, {});
  return data.me;
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
export interface Invitation {
  id: string; individual: PersonSummary; email: string; role: string | null; entity: AdminLocation | null;
  status: InvitationStatus; invitedBy: PersonSummary | null; createdAt: string; expiresAt: string;
  acceptedAt: string | null; replacedBy: string | null;
}
export interface AccountInfo {
  individual: PersonSummary; email: string | null; provider: string | null; createdAt: string | null;
  lastSeenAt: string | null; disabledAt: string | null;
}

const INVITATION_SELECTION = `id individual { ${PERSON_SUMMARY_SELECTION} } email role entity { id name type } status invitedBy { ${PERSON_SUMMARY_SELECTION} } createdAt expiresAt acceptedAt replacedBy`;

// Confirmed with cluster-notebook 2026-11-24: cluster-notebook owns invitations end to end (permission, Clerk, record,
// link at first sign-in). role/entityId may be null (access only); replaceExisting re-invites someone who already
// has a login. Needs an Administrator, or a caller able to end every current role the person holds.
export async function inviteIndividual(input: {
  individualId: string; email: string; role: string | null; entityId: string | null; expiresInDays: number; replaceExisting: boolean;
}): Promise<Invitation> {
  const mutation = `
    mutation InviteIndividual($individualId: String!, $email: String!, $role: String, $entityId: String, $expiresInDays: Int!, $replaceExisting: Boolean!) {
      inviteIndividual(individualId: $individualId, email: $email, role: $role, entityId: $entityId, expiresInDays: $expiresInDays, replaceExisting: $replaceExisting) { ${INVITATION_SELECTION} }
    }
  `;
  const data = await request<{ inviteIndividual: Invitation }>(mutation, input);
  return data.inviteIndividual;
}

export async function resendInvitation(id: string): Promise<Invitation> {
  const mutation = `mutation ResendInvitation($id: String!) { resendInvitation(id: $id) { ${INVITATION_SELECTION} } }`;
  const data = await request<{ resendInvitation: Invitation }>(mutation, { id });
  return data.resendInvitation;
}

export async function revokeInvitation(id: string): Promise<Invitation> {
  const mutation = `mutation RevokeInvitation($id: String!) { revokeInvitation(id: $id) { ${INVITATION_SELECTION} } }`;
  const data = await request<{ revokeInvitation: Invitation }>(mutation, { id });
  return data.revokeInvitation;
}

// Confirmed with cluster-notebook 2026-11-24: removeAccess disables the login (endRoles also ends their roles).
export async function removeAccess(individualId: string, endRoles: boolean): Promise<boolean> {
  const mutation = `
    mutation RemoveAccess($individualId: String!, $endRoles: Boolean!) {
      removeAccess(individualId: $individualId, endRoles: $endRoles)
    }
  `;
  const data = await request<{ removeAccess: boolean }>(mutation, { individualId, endRoles });
  return data.removeAccess;
}

// Confirmed with cluster-notebook 2026-11-24: same login back (lifts the Clerk ban, re-enables the link); roles
// ended earlier stay ended; false when there is no disabled login.
export async function restoreAccess(individualId: string): Promise<boolean> {
  const mutation = `mutation RestoreAccess($individualId: String!) { restoreAccess(individualId: $individualId) }`;
  const data = await request<{ restoreAccess: boolean }>(mutation, { individualId });
  return data.restoreAccess;
}

export async function getInvitations(clusterName: string, status: InvitationStatus | null): Promise<Invitation[]> {
  const query = `
    query GetInvitations($clusterName: String!, $status: InvitationStatus) {
      invitations(clusterName: $clusterName, status: $status) { ${INVITATION_SELECTION} }
    }
  `;
  const data = await request<{ invitations: Invitation[] }>(query, { clusterName, status });
  return data.invitations;
}

export async function getAccounts(clusterName: string): Promise<AccountInfo[]> {
  const query = `
    query GetAccounts($clusterName: String!) {
      accounts(clusterName: $clusterName) { individual { ${PERSON_SUMMARY_SELECTION} } email provider createdAt lastSeenAt disabledAt }
    }
  `;
  const data = await request<{ accounts: AccountInfo[] }>(query, { clusterName });
  return data.accounts;
}
