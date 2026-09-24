import {
  getActivitySummaries, updateActivitySummary, getNucleusFields, updateNucleus,
  getNucleusWorkers, individualDisplayName, createNucleus, deleteNucleus,
} from './clusterNotebook';
import type { ActivitySummary, ActivitySummaries, ActivityType, NucleusFields, Individual } from './clusterNotebook';
import type { Activity, Worker } from '@/types';

// Lets callers (route handlers) distinguish error cases (e.g. 409 vs 400)
// without an `as any` cast on `.code`.
export class CodedError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

function stripCommas(s: string) { return s ? s.replace(/,/g, '') : s; }

function activityFromSummary(summary: ActivitySummary | null): Activity {
  return {
    act: summary?.number != null ? String(summary.number) : '',
    part: summary?.participants != null ? String(summary.participants) : '',
    fof: summary?.participantsFof != null ? String(summary.participantsFof) : '',
    isOverridden: summary?.isOverridden ?? false,
  };
}

// Maps all four cluster-notebook activity rollups onto NucleusRow.activities' shape.
// Used both for a single nucleus's detail (getRowData) and the picker summary
// (/api/initial-data), so both stay in sync rather than drifting apart.
export function activitiesFromClusterNotebook(summaries: ActivitySummaries | null) {
  return {
    ccs: activityFromSummary(summaries?.childrensClasses ?? null),
    jygs: activityFromSummary(summaries?.juniorYouthGroups ?? null),
    scs: activityFromSummary(summaries?.studyCircles ?? null),
    devotionals: activityFromSummary(summaries?.devotionalGathering ?? null),
  };
}

// Our UI shows one combined facilitators line per nucleus, not per activity type --
// collect the distinct non-empty facilitatorNames across all four rollups.
export function facilitatorsFromClusterNotebook(summaries: ActivitySummaries | null): string {
  if (!summaries) return '';
  const names = [summaries.childrensClasses, summaries.juniorYouthGroups, summaries.studyCircles, summaries.devotionalGathering]
    .map(s => s?.facilitatorNames?.trim())
    .filter((s): s is string => !!s);
  return Array.from(new Set(names)).join('; ');
}

// Summed count across all four rollups' `facilitators` -- the numeric sibling of
// facilitatorNames above, used for the concentric diagram's "Facilitating" ring
// (which needs a number, not a name string).
export function facilitatorsCountFromClusterNotebook(summaries: ActivitySummaries | null): string {
  if (!summaries) return '';
  const counts = [summaries.childrensClasses, summaries.juniorYouthGroups, summaries.studyCircles, summaries.devotionalGathering]
    .map(s => s?.facilitators)
    .filter((n): n is number => n != null);
  if (counts.length === 0) return '';
  return String(counts.reduce((a, b) => a + b, 0));
}

function toIntOrNull(value: unknown): number | null {
  const cleaned = stripCommas(String(value ?? ''));
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? null : n;
}

// Tri-state mapping for our Yes/No toggles onto cluster-notebook's nullable
// booleans: 'Yes' -> true, 'No' -> explicit false, anything else (never
// touched) -> null. Symmetric with boolToYesNo below.
function toBoolOrNull(value: unknown): boolean | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'yes') return true;
  if (v === 'no') return false;
  return null;
}

function boolToYesNo(value: boolean | null | undefined): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return '';
}

// cluster-notebook's Cluster.growthMilestone stores SRP's own verbatim strings;
// our UI's "PG" field uses short M1/M2/M3 codes. Confirmed 2026-09-13 (the user
// directly): this is the complete set of values SRP produces, no others exist.
const GROWTH_MILESTONE_TO_PG: Record<string, string> = {
  'Programme of Growth (PG)': 'M1',
  'Intensive Program of Growth (IPG)': 'M2',
  'IPG Embracing Large Numbers': 'M3',
};

function pgFromGrowthMilestone(value: string | null | undefined): string {
  if (!value) return '';
  return GROWTH_MILESTONE_TO_PG[value] ?? '';
}

// clusterCode has no separate field on cluster-notebook's side (confirmed 2026-09-13) --
// it's just the first whitespace-separated token of the cluster's full name,
// e.g. "NC-215" from "NC-215 Triangle". Derived here rather than stored/edited.
function clusterCodeFromClusterName(name: string | undefined): string {
  return (name || '').trim().split(/\s+/)[0] || '';
}

function nucleusFieldsFromClusterNotebook(fields: NucleusFields | null) {
  return {
    stage: fields?.stage ?? '',
    locality: fields?.locality ?? '',
    makeup: fields?.populationMakeup ?? '',
    totalPop: fields?.population != null ? String(fields.population) : '',
    totalHH: fields?.households != null ? String(fields.households) : '',
    indNum: fields?.connectedPopulation != null ? String(fields.connectedPopulation) : '',
    hhNum: fields?.connectedHouseholds != null ? String(fields.connectedHouseholds) : '',
    presence: boolToYesNo(fields?.hasSocialAction),
    notesPresence: fields?.socialActionDescription ?? '',
    gatherings: boolToYesNo(fields?.hasCommunityGatherings),
    notesGatherings: fields?.communityGatheringDescription ?? '',
    narrative: fields?.narrative ?? '',
    // "Pocket" grouping (2026-09-14) -- one nucleus nested under another in the
    // picker, unrelated to the cluster/grouping hierarchy. Now cluster-notebook's
    // own field (parentNucleus { name }), not a Sheet column.
    parentNucleus: fields?.parentNucleus?.name ?? '',
    // Read-only on cluster-notebook's side — no mutation exists for any of these four.
    cluster: fields?.cluster.name ?? '',
    grouping: fields?.cluster.groupOfClusters ?? '',
    pg: pgFromGrowthMilestone(fields?.cluster.growthMilestone),
    auxBoard: fields?.cluster.auxiliaryBoardMembers ?? '',
    // Derived client-side (not a cluster-notebook field at all) from cluster.name.
    clusterCode: clusterCodeFromClusterName(fields?.cluster.name),
    // Writable, but only truly settable when the nucleus has no location — see
    // NucleusFields.nucleusType's own comment in clusterNotebook.ts.
    nucleusType: fields?.nucleusType ?? '',
  };
}

function toWorkers(individuals: Individual[]): Worker[] {
  return individuals.map(ind => ({ id: ind.id, name: individualDisplayName(ind), email: ind.email }));
}

export async function getRowData(nucleusName: string) {
  const [accompanierWorkers, protagonistWorkers, abmAssistantWorkers, contactWorkers, promoterWorkers, activitySummaries, nucleusFields] = await Promise.all([
    getNucleusWorkers(nucleusName, 'accompanier'),
    getNucleusWorkers(nucleusName, 'protagonist'),
    getNucleusWorkers(nucleusName, 'abm-assistant'),
    getNucleusWorkers(nucleusName, 'contact'),
    getNucleusWorkers(nucleusName, 'promoter'),
    getActivitySummaries(nucleusName),
    getNucleusFields(nucleusName),
  ]);

  // cluster-notebook is the sole source of truth now -- nucleusFields is the
  // authoritative "does this exist" check.
  if (nucleusFields === null) return null;

  const row = {
    // The list of valid nuclei comes from cluster-notebook, not any hand-typed
    // copy (2026-09-13, the user directly) -- `nucleusName` (this function's own
    // parameter) already IS that canonical value once it flows from the picker,
    // so it's authoritative here.
    nucleus: nucleusName,
    activities: activitiesFromClusterNotebook(activitySummaries),
    facilitators: facilitatorsFromClusterNotebook(activitySummaries),
    facilitatorsCount: facilitatorsCountFromClusterNotebook(activitySummaries),
    ...nucleusFieldsFromClusterNotebook(nucleusFields),
  };

  return {
    row,
    accompanierNames: toWorkers(accompanierWorkers),
    protagonistNames: toWorkers(protagonistWorkers),
    abmAssistantNames: toWorkers(abmAssistantWorkers),
    contactNames: toWorkers(contactWorkers),
    promoterNames: toWorkers(promoterWorkers),
  };
}

// Fully cluster-notebook's call now, 2026-09-14 -- no Sheet interaction at all (matching
// createRowData/saveRowData). Their deleteNucleus is a soft delete: the row persists but
// disappears from nuclei/nucleus(name) immediately, ActivitySummaryOverride rows are
// hard-deleted, real Activity rows are reassigned (never deleted) up the parentNucleus/
// locality/cluster chain, and role-holders are ended. Returns false for "never existed" and
// "already deleted" alike -- we surface that to the caller so the route can 404 on it,
// same as getRowData's existence check.
export async function deleteRowData(nucleusName: string): Promise<boolean> {
  return deleteNucleus(nucleusName);
}

// Shape of the bits of submitted form data activityUpdateWrites/
// nucleusPatchFromFormData actually read -- formData itself arrives as
// Record<string, unknown> from the API route, so this is a narrowing, not a
// claim about the full form shape.
interface FormDataInput {
  activities?: Partial<Record<'ccs' | 'jygs' | 'scs' | 'devotionals', { act?: string; part?: string; fof?: string }>>;
  stage?: string; makeup?: string;
  totalPop?: string; totalHH?: string; indNum?: string; hhNum?: string;
  presence?: string; notesPresence?: string;
  gatherings?: string; notesGatherings?: string;
  narrative?: string;
  identity?: { nucleusType?: string; parentNucleus?: string };
}

// Shared between createRowData and saveRowData -- each of the four activity
// rollups writes straight to cluster-notebook's updateActivitySummary, one call
// per activity type present in the submitted form.
function activityUpdateWrites(nucleusName: string, d: FormDataInput): Promise<unknown>[] {
  const ACTIVITY_KEYS: [keyof NonNullable<FormDataInput['activities']>, ActivityType][] = [
    ['ccs', 'CHILDRENS_CLASS'],
    ['jygs', 'JUNIOR_YOUTH_GROUP'],
    ['scs', 'STUDY_CIRCLE'],
    ['devotionals', 'DEVOTIONAL_GATHERING'],
  ];
  const writes: Promise<unknown>[] = [];
  for (const [key, activityType] of ACTIVITY_KEYS) {
    const act = d.activities?.[key];
    if (act) {
      writes.push(updateActivitySummary(nucleusName, activityType, {
        number: toIntOrNull(act.act),
        participants: toIntOrNull(act.part),
        participantsFof: toIntOrNull(act.fof),
      }));
    }
  }
  return writes;
}

// Shared between createRowData and saveRowData -- builds the same NucleusPatch
// shape from submitted form data either way. No `locality`: cluster-notebook
// removed NucleusPatch.locality 2026-09-13 (it's now a read-only value derived
// from Nucleus.location's own containment chain, not a hand-entered field).
function nucleusPatchFromFormData(d: FormDataInput) {
  const nucleusPatch: {
    stage?: string; populationMakeup?: string;
    population?: number | null; households?: number | null;
    connectedPopulation?: number | null; connectedHouseholds?: number | null;
    hasSocialAction?: boolean | null; socialActionDescription?: string;
    hasCommunityGatherings?: boolean | null; communityGatheringDescription?: string;
    narrative?: string;
    nucleusType?: string;
    parentNucleusName?: string | null;
  } = {};
  if (d.stage !== undefined) nucleusPatch.stage = d.stage;
  if (d.makeup !== undefined) nucleusPatch.populationMakeup = d.makeup;
  if (d.totalPop !== undefined) nucleusPatch.population = toIntOrNull(d.totalPop);
  if (d.totalHH !== undefined) nucleusPatch.households = toIntOrNull(d.totalHH);
  if (d.indNum !== undefined) nucleusPatch.connectedPopulation = toIntOrNull(d.indNum);
  if (d.hhNum !== undefined) nucleusPatch.connectedHouseholds = toIntOrNull(d.hhNum);
  if (d.presence !== undefined) nucleusPatch.hasSocialAction = toBoolOrNull(d.presence);
  if (d.notesPresence !== undefined) nucleusPatch.socialActionDescription = d.notesPresence;
  if (d.gatherings !== undefined) nucleusPatch.hasCommunityGatherings = toBoolOrNull(d.gatherings);
  if (d.notesGatherings !== undefined) nucleusPatch.communityGatheringDescription = d.notesGatherings;
  if (d.narrative !== undefined) nucleusPatch.narrative = d.narrative;
  // nucleusType is nested under identity (admin/create-only), unlike the other patch fields above.
  if (d.identity && d.identity.nucleusType !== undefined) nucleusPatch.nucleusType = d.identity.nucleusType;
  // parentNucleus likewise -- '' (cleared in the UI) means "no parent", so it maps to
  // null, not an empty-string patch value.
  if (d.identity && d.identity.parentNucleus !== undefined) nucleusPatch.parentNucleusName = d.identity.parentNucleus || null;
  return nucleusPatch;
}

// Identity (name + cluster) is established via cluster-notebook's createNucleus,
// 2026-09-14 -- everything else (stage, population, activities, narrative,
// parentNucleus, etc.) goes through the exact same update calls saveRowData uses
// for editing, not a separate seed-write. No Sheet row is written at all anymore --
// access control no longer requires one (see access.ts) and parentNucleus, the
// last field that needed one, is now cluster-notebook's own field.
export async function createRowData(formData: Record<string, unknown>, userEmail: string) {
  const d = formData as any;
  const newNucleus = ((d.identity?.nucleus) || '').trim();
  const clusterName = ((d.identity?.cluster) || '').trim();

  if (!newNucleus) throw new Error('Nucleus name is required');
  if (!clusterName) throw new Error('Cluster is required');

  let created;
  try {
    created = await createNucleus(newNucleus, clusterName);
  } catch (e) {
    // Global uniqueness is enforced at cluster-notebook's DB level (2026-09-14) --
    // this is now our only duplicate-name check (the Sheet-based pre-check that used
    // to run here was dropped along with the Sheet stub-row write it existed to guard).
    if (e instanceof Error && /already exists/i.test(e.message)) {
      throw new CodedError(`A nucleus named "${newNucleus}" already exists`, 'CONFLICT');
    }
    throw e;
  }
  if (created === null) {
    throw new CodedError(`cluster-notebook has no cluster named "${clusterName}" — nucleus not created`, 'BAD_CLUSTER');
  }

  const writes: Promise<unknown>[] = [...activityUpdateWrites(newNucleus, d)];
  const nucleusPatch = nucleusPatchFromFormData(d);
  if (Object.keys(nucleusPatch).length > 0) {
    writes.push(updateNucleus(newNucleus, nucleusPatch));
  }
  await Promise.all(writes);

  return { success: true, savedBy: userEmail, savedAt: new Date().toISOString() };
}

// nucleus/grouping/cluster/pg/clusterCode are deliberately absent from nucleusPatch below —
// nucleus (the name itself) is no longer editable at all: cluster-notebook's own name is
// the canonical identifier now (2026-09-13, the user directly), and cluster-notebook has no
// rename mutation. grouping/cluster/pg are read-only from cluster-notebook
// (Cluster.groupOfClusters/name/growthMilestone, no mutation exists); clusterCode is derived
// client-side from cluster.name, not a stored field at all. Every field this function writes,
// including parentNucleus now, routes entirely through cluster-notebook -- no Sheet write at
// all anymore, 2026-09-14.
export async function saveRowData(nucleusName: string, formData: Record<string, unknown>, userEmail: string) {
  const d = formData as any;

  // cc/jyg/sc/devotionals are no longer Sheet columns at all (see COL.CC_ACT etc.'s
  // "dead" comments) -- each now writes straight to cluster-notebook's shared
  // updateActivitySummary mutation, one call per activity type.
  const writes: Promise<unknown>[] = [...activityUpdateWrites(nucleusName, d)];
  const nucleusPatch = nucleusPatchFromFormData(d);
  if (Object.keys(nucleusPatch).length > 0) {
    writes.push(updateNucleus(nucleusName, nucleusPatch));
  }
  await Promise.all(writes);

  // If activities were part of this save, hand back the fresh post-write state (in
  // particular isOverridden) so the caller can update its display without a reload --
  // cluster-notebook recomputes isOverridden server-side (value comparison against its
  // own SRP-derived numbers), so there's no way for the client to know the new value
  // from what it sent.
  const activities = d.activities
    ? activitiesFromClusterNotebook(await getActivitySummaries(nucleusName))
    : undefined;

  return { success: true, savedBy: userEmail, savedAt: new Date().toISOString(), activities };
}
