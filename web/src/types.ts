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
  stage: string;
}

export interface NucleusRow {
  nucleus: string;
  parentNucleus: string;
  grouping: string;
  cluster: string;
  pg: string;
  clusterCode: string;
  locality: string;
  stage: string;
  contact: string;
  email: string;
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
}

export interface SrpData {
  facilitators: string;
  ccs: Activity | null;
  jygs: Activity | null;
  scs: Activity | null;
  devotionals: Activity | null;
}

export interface NucleusDetail {
  row: NucleusRow;
  srp: SrpData | null;
  accompanierNames: string[];
  protagonistNames: string[];
  abmAssistantNames: string[];
}

export interface InitialData {
  role: 'global' | 'contact';
  rows: NucleusSummary[];
  email: string;
  srpNames: string[];
  spreadsheetUrl: string;
}

export type FormData = Omit<NucleusRow,
  'nucleus' | 'parentNucleus' | 'grouping' | 'cluster' |
  'pg' | 'clusterCode'
>;
