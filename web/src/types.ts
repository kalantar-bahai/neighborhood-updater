export interface Activity {
  act: string;
  part: string;
  fof: string;
}

export interface NeighborhoodSummary {
  neighborhood: string;
  parentNeighborhood: string;
  grouping: string;
  cluster: string;
  locality: string;
  stage: string;
}

export interface NeighborhoodRow {
  neighborhood: string;
  parentNeighborhood: string;
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
}

export interface SrpData {
  facilitators: string;
  ccs: Activity | null;
  jygs: Activity | null;
  scs: Activity | null;
  devotionals: Activity | null;
}

export interface NeighborhoodDetail {
  row: NeighborhoodRow;
  srp: SrpData | null;
}

export interface InitialData {
  role: 'global' | 'contact';
  rows: NeighborhoodSummary[];
  email: string;
  srpNames: string[];
}

export type FormData = Omit<NeighborhoodRow,
  'neighborhood' | 'parentNeighborhood' | 'grouping' | 'cluster' |
  'pg' | 'clusterCode'
>;
