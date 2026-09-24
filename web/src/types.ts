import type { PermissionSet } from './lib/access';

export type Role = 'read' | 'read-write' | 'collaborator' | 'admin';

export interface AccessEntry {
  name: string;
  email: string;
  role: Role;
  nucleus: string; // specific nucleus name or '*' for all
}

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
  nucleus: string;
  parentNucleus: string;
  grouping: string;
  cluster: string;
  locality: string;
  nucleusType: string;
  stage: string;
  totalAct: number;
  totalPart: number;
  totalFof: number;
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
  indPct: string;
  hhNum: string;
  hhPct: string;
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
  accompanierNames: Worker[];
  protagonistNames: Worker[];
  abmAssistantNames: Worker[];
  // At most one entry -- Contact is a single-person role, unlike the other three.
  contactNames: Worker[];
  promoterNames: Worker[];
}

export interface InitialData {
  access: { isAdministrator: boolean; permissions: Record<string, PermissionSet> };
  rows: NucleusSummary[];
  email: string;
  // For the "+Add" cluster picker (2026-09-14) -- existing clusters only, no
  // inline creation (clusters are real, SRP-sourced geographic entities).
  clusterNames: string[];
}

export type FormData = Omit<NucleusRow,
  'nucleus' | 'parentNucleus' | 'grouping' | 'cluster' |
  'pg' | 'clusterCode'
>;
