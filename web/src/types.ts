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
  protagonists: string;
  accompaniers: string;
  level: string;
  notesPrevalence: string;
  supported: string;
  notesSupported: string;
  presence: string;
  notesPresence: string;
  involved: string;
  notesInvolved: string;
  efforts: string;
  notesEfforts: string;
  gatherings: string;
  notesGatherings: string;
  narrative: string;
}

export interface SrpData {
  facilitators: string;
  ccs: Activity | null;
  jygs: Activity | null;
  scs: Activity | null;
  devotionals: Activity | null;
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
  srp: SrpData | null;
  accompanierNames: Worker[];
  protagonistNames: Worker[];
  abmAssistantNames: Worker[];
  // At most one entry -- Contact is a single-person role, unlike the other three.
  contactNames: Worker[];
}

export interface InitialData {
  access: { roleMap: Record<string, Role> };
  rows: NucleusSummary[];
  email: string;
  srpNames: string[];
  spreadsheetUrl: string;
}

export type FormData = Omit<NucleusRow,
  'nucleus' | 'parentNucleus' | 'grouping' | 'cluster' |
  'pg' | 'clusterCode'
>;
