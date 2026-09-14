import { sheetsGet, sheetsBatchUpdate, sheetsClear, sheetsDeleteRow } from './sheets';
import {
  MASTER_SHEET_ID, SRP_SHEET_ID,
  MASTER_TAB, ACCESS_TAB, DEV_TAB,
  MASTER_DATA_ROW, SRP_DATA_ROW,
  COL,
  ACCESS_COL,
} from './config';
import {
  getActivitySummaries, updateActivitySummary, getNucleusFields, updateNucleus,
  getNucleusWorkers, individualDisplayName,
} from './clusterNotebook';
import type { ActivitySummary, ActivitySummaries, ActivityType, NucleusFields, Individual } from './clusterNotebook';
import type { AccessEntry, Activity, Worker } from '@/types';

function normalize(row: string[], numCols: number): string[] {
  const r = row ? [...row] : [];
  while (r.length < numCols) r.push('');
  return r;
}

function norm(s: string) { return (s || '').toLowerCase().trim(); }

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

export async function getAccessEntries(): Promise<AccessEntry[]> {
  const rows = await sheetsGet(MASTER_SHEET_ID, `${ACCESS_TAB}!A2:D`);
  return rows
    .filter(r => (r[ACCESS_COL.EMAIL] || '').trim() !== '')
    .map(r => ({
      name:    r[ACCESS_COL.NAME]    || '',
      email:   r[ACCESS_COL.EMAIL]   || '',
      role:    (r[ACCESS_COL.ROLE]   || 'read') as AccessEntry['role'],
      nucleus: r[ACCESS_COL.NUCLEUS] || '*',
    }));
}

export async function saveAccessEntries(entries: AccessEntry[]): Promise<void> {
  await sheetsClear(MASTER_SHEET_ID, `${ACCESS_TAB}!A2:D`);
  if (entries.length === 0) return;
  await sheetsBatchUpdate(MASTER_SHEET_ID, [{
    range: `${ACCESS_TAB}!A2`,
    values: entries.map(e => [e.name, e.email, e.role, e.nucleus]),
  }]);
}

export async function getAllMasterRows() {
  const rows = await sheetsGet(MASTER_SHEET_ID, `${MASTER_TAB}!A${MASTER_DATA_ROW}:AZ`);
  return rows.map(r => normalize(r, 52));
}

export async function getAllDevRows() {
  const rows = await sheetsGet(SRP_SHEET_ID, `${DEV_TAB}!A${SRP_DATA_ROW}:N`);
  return rows.map(r => normalize(r, 14));
}

export function parseRow(row: string[]) {
  return {
    grouping:            row[COL.GROUPING],
    cluster:             row[COL.CLUSTER],
    pg:                  row[COL.PG],
    clusterCode:         row[COL.CLUSTER_CODE],
    locality:            row[COL.LOCALITY],
    nucleus:             row[COL.NUCLEUS],
    parentNucleus:       row[COL.PARENT_NUCLEUS],
    nucleusType:         row[COL.TYPE],
    stage:               row[COL.STAGE],
    auxBoard:            row[COL.AUX_BOARD],
    makeup:              row[COL.MAKEUP],
    totalPop:            stripCommas(row[COL.TOTAL_POP]),
    totalHH:             stripCommas(row[COL.TOTAL_HH]),
    indNum:              stripCommas(row[COL.IND_NUM]),
    indPct:              row[COL.IND_PCT],
    hhNum:               stripCommas(row[COL.HH_NUM]),
    hhPct:               row[COL.HH_PCT],
    activities: {
      ccs:         { act: stripCommas(row[COL.CC_ACT]),   part: stripCommas(row[COL.CC_PART]),   fof: stripCommas(row[COL.CC_FOF]) },
      jygs:        { act: stripCommas(row[COL.JYG_ACT]),  part: stripCommas(row[COL.JYG_PART]),  fof: stripCommas(row[COL.JYG_FOF]) },
      scs:         { act: stripCommas(row[COL.SC_ACT]),   part: stripCommas(row[COL.SC_PART]),   fof: stripCommas(row[COL.SC_FOF]) },
      devotionals: { act: stripCommas(row[COL.DEV_ACT]),  part: stripCommas(row[COL.DEV_PART]),  fof: stripCommas(row[COL.DEV_FOF]) },
    },
    level:           row[COL.LEVEL],
    notesPrevalence: row[COL.NOTES_PREVALENCE],
    supported:       row[COL.SUPPORTED],
    notesSupported:  row[COL.NOTES_SUPPORTED],
    presence:        row[COL.PRESENCE],
    notesPresence:   row[COL.NOTES_PRESENCE],
    involved:        row[COL.INVOLVED],
    notesInvolved:   row[COL.NOTES_INVOLVED],
    efforts:          row[COL.EFFORTS],
    notesEfforts:     row[COL.NOTES_EFFORTS],
    gatherings:       row[COL.GATHERINGS],
    notesGatherings:  row[COL.NOTES_GATHERINGS],
    narrative:        row[COL.NARRATIVE],
    // No sheet column -- always overwritten from cluster-notebook right after
    // parseRow runs (see facilitatorsFromClusterNotebook/facilitatorsCountFromClusterNotebook in getRowData).
    facilitators:     '',
    facilitatorsCount: '',
  };
}

export function findSrpRow(name: string, rows: string[][], nameCol: number) {
  const needle = norm(name);
  return rows.find(r => norm(r[nameCol]) === needle) ?? null;
}

function toWorkers(individuals: Individual[]): Worker[] {
  return individuals.map(ind => ({ id: ind.id, name: individualDisplayName(ind), email: ind.email }));
}

export async function getRowData(nucleusName: string) {
  const [masterRows, accompanierWorkers, protagonistWorkers, abmAssistantWorkers, contactWorkers, promoterWorkers, activitySummaries, nucleusFields] = await Promise.all([
    getAllMasterRows(),
    getNucleusWorkers(nucleusName, 'accompanier'),
    getNucleusWorkers(nucleusName, 'protagonist'),
    getNucleusWorkers(nucleusName, 'abm-assistant'),
    getNucleusWorkers(nucleusName, 'contact'),
    getNucleusWorkers(nucleusName, 'promoter'),
    getActivitySummaries(nucleusName),
    getNucleusFields(nucleusName),
  ]);

  const masterRow = masterRows.find(r => norm(r[COL.NUCLEUS]) === norm(nucleusName));
  if (!masterRow) return null;

  const row = parseRow(masterRow);
  // parseRow's nucleus/activities/facilitators/stage/locality/makeup/totalPop/totalHH/indNum/
  // hhNum/presence/notesPresence/gatherings/notesGatherings/narrative/grouping/cluster/pg/
  // clusterCode/nucleusType/auxBoard reads (from the corresponding COL.* sheet columns, where
  // any even exist) are all overwritten below — none of these sheet columns are read by
  // anything else anymore either (/api/initial-data's picker summary sources the same fields
  // from cluster-notebook now too), so they're fully dead. grouping/cluster/pg are read-only
  // from cluster-notebook (no mutation exists for them there); clusterCode is derived
  // client-side from cluster.name, not read from anywhere. facilitators has no sheet column at
  // all anymore — the old Education-sheet read (getAllEduRows/EDU_TAB/EDU_COL) is fully retired,
  // 2026-09-14.
  // nucleus itself: the list of valid nuclei comes from cluster-notebook, not the Sheet
  // (2026-09-13, the user directly) — `nucleusName` (this function's own parameter) already IS
  // that canonical value once it flows from the picker, so it's authoritative here too, not the
  // Sheet's own (possibly stale, or just differently-cased) copy of the same name.
  row.nucleus = nucleusName;
  row.activities = activitiesFromClusterNotebook(activitySummaries);
  row.facilitators = facilitatorsFromClusterNotebook(activitySummaries);
  row.facilitatorsCount = facilitatorsCountFromClusterNotebook(activitySummaries);
  Object.assign(row, nucleusFieldsFromClusterNotebook(nucleusFields));

  return {
    row,
    accompanierNames: toWorkers(accompanierWorkers),
    protagonistNames: toWorkers(protagonistWorkers),
    abmAssistantNames: toWorkers(abmAssistantWorkers),
    contactNames: toWorkers(contactWorkers),
    promoterNames: toWorkers(promoterWorkers),
  };
}

export async function deleteRowData(nucleusName: string): Promise<void> {
  const allRows = await getAllMasterRows();
  const rowIndex = allRows.findIndex(r => norm(r[COL.NUCLEUS]) === norm(nucleusName));
  if (rowIndex === -1) throw new Error(`Row not found: ${nucleusName}`);
  const sheetRowIndex = MASTER_DATA_ROW + rowIndex - 1; // 0-based index for deleteDimension
  await sheetsDeleteRow(MASTER_SHEET_ID, MASTER_TAB, sheetRowIndex);
}

export async function createRowData(formData: Record<string, unknown>, userEmail: string) {
  const allRows = await getAllMasterRows();
  const d = formData as any;
  const newNucleus = ((d.identity?.nucleus) || '').trim();

  if (!newNucleus) throw new Error('Nucleus name is required');

  if (allRows.some(r => norm(r[COL.NUCLEUS]) === norm(newNucleus))) {
    const err = new Error(`A nucleus named "${newNucleus}" already exists`);
    (err as any).code = 'CONFLICT';
    throw err;
  }

  const sheetRow = MASTER_DATA_ROW + allRows.length;
  const newRow = new Array(52).fill('');

  newRow[COL.GROUPING]       = d.identity?.grouping       || '';
  newRow[COL.CLUSTER]        = d.identity?.cluster        || '';
  newRow[COL.PG]             = d.identity?.pg             || '';
  newRow[COL.CLUSTER_CODE]   = d.identity?.clusterCode    || '';
  newRow[COL.LOCALITY]       = d.locality                 || '';
  newRow[COL.NUCLEUS]        = d.identity?.nucleus        || '';
  newRow[COL.PARENT_NUCLEUS] = d.identity?.parentNucleus  || '';
  newRow[COL.TYPE]           = d.identity?.nucleusType    || '';
  newRow[COL.STAGE]          = d.stage                    || '';
  newRow[COL.AUX_BOARD]      = d.auxBoard                 || '';
  newRow[COL.MAKEUP]         = d.makeup                   || '';
  newRow[COL.TOTAL_POP]      = d.totalPop                 || '';
  newRow[COL.TOTAL_HH]       = d.totalHH                  || '';
  newRow[COL.IND_NUM]        = d.indNum                   || '';
  newRow[COL.HH_NUM]         = d.hhNum                    || '';
  newRow[COL.CC_ACT]         = d.activities?.ccs?.act     || '';
  newRow[COL.CC_PART]        = d.activities?.ccs?.part    || '';
  newRow[COL.CC_FOF]         = d.activities?.ccs?.fof     || '';
  newRow[COL.JYG_ACT]        = d.activities?.jygs?.act    || '';
  newRow[COL.JYG_PART]       = d.activities?.jygs?.part   || '';
  newRow[COL.JYG_FOF]        = d.activities?.jygs?.fof    || '';
  newRow[COL.SC_ACT]         = d.activities?.scs?.act     || '';
  newRow[COL.SC_PART]        = d.activities?.scs?.part    || '';
  newRow[COL.SC_FOF]         = d.activities?.scs?.fof     || '';
  newRow[COL.DEV_ACT]        = d.activities?.devotionals?.act  || '';
  newRow[COL.DEV_PART]       = d.activities?.devotionals?.part || '';
  newRow[COL.DEV_FOF]        = d.activities?.devotionals?.fof  || '';
  newRow[COL.LEVEL]          = d.level                    || '';
  newRow[COL.NOTES_PREVALENCE] = d.notesPrevalence        || '';
  newRow[COL.SUPPORTED]      = d.supported                || '';
  newRow[COL.NOTES_SUPPORTED]= d.notesSupported           || '';
  newRow[COL.PRESENCE]       = d.presence                 || '';
  newRow[COL.NOTES_PRESENCE] = d.notesPresence            || '';
  newRow[COL.INVOLVED]       = d.involved                 || '';
  newRow[COL.NOTES_INVOLVED] = d.notesInvolved            || '';
  newRow[COL.EFFORTS]        = d.efforts                  || '';
  newRow[COL.NOTES_EFFORTS]  = d.notesEfforts             || '';
  newRow[COL.GATHERINGS]     = d.gatherings               || '';
  newRow[COL.NOTES_GATHERINGS] = d.notesGatherings        || '';
  newRow[COL.NARRATIVE]      = d.narrative                || '';

  await sheetsBatchUpdate(MASTER_SHEET_ID, [{
    range: `${MASTER_TAB}!A${sheetRow}`,
    values: [newRow],
  }]);

  return { success: true, savedBy: userEmail, savedAt: new Date().toISOString() };
}

export async function saveRowData(nucleusName: string, formData: Record<string, unknown>, userEmail: string) {
  const allRows = await getAllMasterRows();
  const rowIndex = allRows.findIndex(r => norm(r[COL.NUCLEUS]) === norm(nucleusName));
  if (rowIndex === -1) throw new Error(`Row not found: ${nucleusName}`);

  const sheetRow = MASTER_DATA_ROW + rowIndex;
  const d = formData as any;
  const colLetter = (i: number) => {
    let letter = '', idx = i + 1;
    while (idx > 0) { const rem = (idx - 1) % 26; letter = String.fromCharCode(65 + rem) + letter; idx = Math.floor((idx - 1) / 26); }
    return letter;
  };

  // nucleus/grouping/cluster/pg/clusterCode/nucleusType are deliberately absent here —
  // nucleus (the name itself) is no longer editable at all: cluster-notebook's own name is
  // the canonical identifier now (2026-09-13, the user directly), and cluster-notebook has no
  // rename mutation, so writing a new name to the sheet would just silently revert on next
  // load (the picker/detail view would keep showing cluster-notebook's unchanged name).
  // grouping/cluster/pg are read-only from cluster-notebook now
  // (Cluster.groupOfClusters/name/growthMilestone, no mutation exists); clusterCode is derived
  // client-side from cluster.name, not a stored field at all; nucleusType moved to
  // cluster-notebook's own Nucleus.nucleusType (see nucleusPatch below). Writing any of them to
  // the sheet would be silently discarded on next load anyway.
  const identityPairs: [number, unknown][] = d.identity ? [
    [COL.PARENT_NUCLEUS, d.identity.parentNucleus],
  ] : [];

  const updates = [
    ...identityPairs,
    [COL.LEVEL, d.level], [COL.NOTES_PREVALENCE, d.notesPrevalence],
    [COL.SUPPORTED, d.supported], [COL.NOTES_SUPPORTED, d.notesSupported],
    [COL.INVOLVED, d.involved], [COL.NOTES_INVOLVED, d.notesInvolved],
    [COL.EFFORTS, d.efforts], [COL.NOTES_EFFORTS, d.notesEfforts],
  ].filter(([, value]) => value !== undefined)
    .map(([col, value]) => ({
      range: `${MASTER_TAB}!${colLetter(col as number)}${sheetRow}`,
      values: [[(value ?? '') as string]],
    }));

  const writes: Promise<unknown>[] = [sheetsBatchUpdate(MASTER_SHEET_ID, updates)];
  // cc/jyg/sc/devotionals are no longer Sheet columns at all (see COL.CC_ACT etc.'s
  // "dead" comments) -- each now writes straight to cluster-notebook's shared
  // updateActivitySummary mutation, one call per activity type.
  const ACTIVITY_KEYS: [keyof typeof d.activities, ActivityType][] = [
    ['ccs', 'CHILDRENS_CLASS'],
    ['jygs', 'JUNIOR_YOUTH_GROUP'],
    ['scs', 'STUDY_CIRCLE'],
    ['devotionals', 'DEVOTIONAL_GATHERING'],
  ];
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
  // NOTE: no `locality` patching — cluster-notebook removed NucleusPatch.locality
  // 2026-09-13 (it's now a read-only value derived from Nucleus.location's own
  // containment chain, not a hand-entered field). We still read it in
  // nucleusFieldsFromClusterNotebook; there's just no write path anymore.
  const nucleusPatch: {
    stage?: string; populationMakeup?: string;
    population?: number | null; households?: number | null;
    connectedPopulation?: number | null; connectedHouseholds?: number | null;
    hasSocialAction?: boolean | null; socialActionDescription?: string;
    hasCommunityGatherings?: boolean | null; communityGatheringDescription?: string;
    narrative?: string;
    nucleusType?: string;
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
  if (Object.keys(nucleusPatch).length > 0) {
    writes.push(updateNucleus(nucleusName, nucleusPatch));
  }
  await Promise.all(writes);

  return { success: true, savedBy: userEmail, savedAt: new Date().toISOString() };
}
