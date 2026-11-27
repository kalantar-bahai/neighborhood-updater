import type { PermissionSet } from './lib/access';
import type { LastUpdated, LocalityOption, NamedCounts, SrpAction } from './lib/clusterNotebook';
import type { SrpState } from './lib/srp';

export interface Activity {
  act: string;
  part: string;
  fof: string;
  // Single flag for the whole {act, part, fof} triple, mirroring cluster-notebook's
  // ActivitySummary.isOverridden — true means a human entered these values rather
  // than SRP deriving them. Not present for SRP-sourced or totals-only Activity uses.
  isOverridden?: boolean;
}

export interface NucleusSummary {
  // cluster-notebook's stable Nucleus.id; the address bar carries it (see lib/nucleusUrl.ts).
  id: string;
  nucleus: string;
  parentNucleus: string;
  grouping: string;
  cluster: string;
  locality: string;
  nucleusType: string;
  srpState: SrpState | null;
  srpAction: 'create' | 'rename' | 'delete' | null;
  stage: string;
  totalAct: number;
  totalPart: number;
  totalFof: number;
  // Overview card's nine fields (2026-10-08), fetched eagerly for every nucleus
  // here (not just the one being viewed) so Picker's rollup cards can sum them
  // into a popup concentric diagram without a per-nucleus follow-up query. Numeric
  // (unlike NucleusRow's string convention) because these only ever get summed,
  // never edited, on this row shape -- see NucleusFields' own comment in
  // clusterNotebook.ts for the fields' story. `null` means never set (confirmed
  // with cluster-notebook 2026-10-08: most nuclei in dev data have never had any
  // of these nine set) -- kept distinct from 0 all the way out here so Picker's
  // rollup can tell "nobody here has entered this yet" from a real zero, rather
  // than defaulting to 0 at the API boundary and making every unset group look
  // like a real, reported zero.
  totalPop: number | null;
  inConversation: number | null;
  inCommunityActivities: number | null;
  protagonists: number | null;
  devotionalHosts: number | null;
  inEducationalActivities: number | null;
  educationalFacilitators: number | null;
  helpingOthers: number | null;
  accompanying: number | null;
}

export interface NucleusRow {
  nucleus: string;
  parentNucleus: string;
  nucleusType: string;
  grouping: string;
  cluster: string;
  pg: string;
  clusterCode: string;
  locality: string;
  stage: string;
  auxBoard: string;
  makeup: string;
  totalPop: string;
  totalHH: string;
  indNum: string;
  hhNum: string;
  // Added 2026-10-08 -- the raw value `locationName` sets, distinct from locality/
  // cluster above (both derived from it). '' means no location (should now only
  // happen for already-archived nuclei that predate cluster-notebook requiring
  // one). See NucleusFields' own comment in clusterNotebook.ts.
  locationName: string;
  // 'CLUSTER' | 'LOCALITY' | 'SETTING' | '' -- governs whether nucleusType can be
  // edited at all (forced to "Neighborhood" at a SETTING, freely settable at a
  // CLUSTER or LOCALITY). See NucleusFields.location's own comment in
  // clusterNotebook.ts.
  locationType: string;
  // Overview card's nine fields (2026-10-07, totalPop being the ninth) -- hand-
  // entered estimates synced both ways with SRP, deliberately independent of our
  // role-assignment lists (protagonist/promoter/accompanier workers). See
  // NucleusFields' own comment in clusterNotebook.ts for the full story.
  inConversation: string;
  inCommunityActivities: string;
  protagonists: string;
  devotionalHosts: string;
  inEducationalActivities: string;
  educationalFacilitators: string;
  helpingOthers: string;
  accompanying: string;
  activities: {
    ccs: Activity;
    jygs: Activity;
    scs: Activity;
    devotionals: Activity;
  };
  presence: string;
  notesPresence: string;
  gatherings: string;
  notesGatherings: string;
  narrative: string;
  // Combined, deduped facilitatorNames across all four cluster-notebook activity
  // rollups (2026-09-14) -- human-entered on their side, no SRP source, read-only
  // here (no per-activity granularity in our UI). Replaces the old Education-sheet
  // read entirely; no more SRP sheet cache consulted anywhere in this app.
  facilitators: string;
  // Numeric sibling of the above (summed across the same four rollups) -- used only
  // by the concentric diagram's "Facilitating" ring, which needs a count.
  facilitatorsCount: string;
}

// A worker-list entry -- backed by a real cluster-notebook Individual record now,
// not a free-text string. `id` is what gets sent back on save; `name` is a
// display-only string composed from the Individual's actual name fields.
// `email` is the Individual's own email field, surfaced for the Contact role
// where we display it directly rather than storing a separate email string.
export interface Worker {
  id: string;
  name: string;
  email: string | null;
}

export interface NucleusDetail {
  row: NucleusRow;
  // isHome: has its own Setting (any Neighborhood; cluster-notebook isHome), whatever its SRP state.
  // inSrp: linked to SRP (cluster-notebook's inSrp flag).
  srp: { state: SrpState | null; action: SrpAction | null; srpName: string | null; isHome: boolean; inSrp: boolean };
  // Members of this nucleus; 0 when cluster-notebook reports none (a count of people, not a "not recorded" estimate).
  memberCount: number;
  accompanierNames: Worker[];
  protagonistNames: Worker[];
  abmAssistantNames: Worker[];
  // At most one entry -- Contact is a single-person role, unlike the other three.
  contactNames: Worker[];
  promoterNames: Worker[];
  // The "(x)" beside each Overview estimate, counted by cluster-notebook (see NamedCounts). null only if it
  // didn't come back, and then no "(x)" shows.
  namedCounts: NamedCounts | null;
  // Real, persisted "who/when last changed anything on this page" from
  // cluster-notebook's audit log -- aggregated across the Nucleus's own fields and
  // all four activity summaries (confirmed 2026-10-04). Null only when no audit row
  // exists at all (predates audit logging, 2026-09-25); see LastUpdated for what
  // `by` can be once this is non-null.
  lastUpdated: LastUpdated | null;
  // Location picker's options, scoped to this nucleus's own cluster (2026-10-08).
  // Empty for a caller who can't edit location anyway -- their read scope won't
  // reach locality/setting level (confirmed with cluster-notebook directly).
  locationOptions: LocalityOption[];
}

export interface InitialData {
  access: { permissions: Record<string, PermissionSet> };
  rows: NucleusSummary[];
  email: string;
  // For the "+Add" cluster picker -- clusters this user can actually create a
  // nucleus under (2026-10-05; was "existing clusters, unfiltered" before that),
  // no inline creation (clusters are real, SRP-sourced geographic entities). Also
  // doubles as the "+Add nucleus" button's own gate: non-empty means yes. See
  // AppClient.tsx.
  clusterNames: string[];
  // True when the user may open /admin (adminClusters is non-empty).
  isAdmin: boolean;
}

export type FormData = Omit<NucleusRow,
  'nucleus' | 'parentNucleus' | 'grouping' | 'cluster' |
  'pg' | 'clusterCode'
>;
