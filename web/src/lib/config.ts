export const MASTER_SHEET_ID = process.env.MASTER_SHEET_ID!;
export const SRP_SHEET_ID    = process.env.SRP_SHEET_ID!;

export const MASTER_TAB  = 'Nuclei';
export const ACCESS_TAB  = 'GlobalAccess';
export const DEV_TAB     = 'Devotionals';
export const EDU_TAB     = 'Education';

export const MASTER_DATA_ROW = 4;
export const SRP_DATA_ROW    = 2;

export const COL = {
  GROUPING:            0,
  CLUSTER:             1,
  PG:                  2,
  CLUSTER_CODE:        3,
  LOCALITY:            4,
  NUCLEUS:             5,
  PARENT_NUCLEUS:      6,
  TYPE:                7,
  STAGE:               8,
  CONTACT:             9,
  EMAIL:               10,
  AUX_BOARD:           11,
  MAKEUP:              12,
  TOTAL_POP:           13,
  TOTAL_HH:            14,
  IND_NUM:             15,
  IND_PCT:             16,
  HH_NUM:              17,
  HH_PCT:              18,
  CC_ACT:              19,
  CC_PART:             20,
  CC_FOF:              21,
  JYG_ACT:             22,
  JYG_PART:            23,
  JYG_FOF:             24,
  SC_ACT:              25,
  SC_PART:             26,
  SC_FOF:              27,
  TOTAL_ED_ACT:        28,
  TOTAL_ED_PART:       29,
  TOTAL_ED_FOF:        30,
  DEV_ACT:             31,
  DEV_PART:            32,
  DEV_FOF:             33,
  TOTAL_ACT:           34,
  TOTAL_PART:          35,
  TOTAL_FOF:           36,
  PROTAGONISTS:        37,
  ACCOMPANIERS:        38,
  LEVEL:               39,
  NOTES_PREVALENCE:    40,
  SUPPORTED:           41,
  NOTES_SUPPORTED:     42,
  PRESENCE:            43,
  NOTES_PRESENCE:      44,
  INVOLVED:            45,
  NOTES_INVOLVED:      46,
  EFFORTS:             47,
  NOTES_EFFORTS:       48,
  GATHERINGS:          49,
  NOTES_GATHERINGS:    50,
} as const;

export const DEV_COL = {
  NAME: 0, LATIN_NAME: 1, LOCALITY: 2, ELECTORAL_UNIT: 3, CLUSTER: 4,
  GROUP_OF_CLUSTERS: 5, SUBREGION: 6, REGION: 7, GROUP_OF_REGIONS: 8,
  NATIONAL_COMMUNITY: 9, DEV_ACT: 10, DEV_PART: 11, DEV_FOF: 12, COMMENTS: 13,
} as const;

export const EDU_COL = {
  NAME: 0,
  CC_ACT: 1,  CC_PART: 2,  CC_FOF: 3,
  JYG_ACT: 4, JYG_PART: 5, JYG_FOF: 6,
  SC_ACT: 7,  SC_PART: 8,  SC_FOF: 9,
  FACILITATORS: 10,
} as const;

export const WORKERS_TAB = 'Workers';
export const WORKERS_DATA_ROW = 2;
export const WORKER_TYPES = ['accompanier', 'protagonist', 'abm-assistant'] as const;
export type WorkerType = typeof WORKER_TYPES[number];

export const ACC_COL = {
  CLUSTER:             0,
  CLUSTER_CODE:        1,
  LOCALITY:            2,
  PARENT_NUCLEUS:      3,
  NUCLEUS:             4,
  TYPE:                5,
  NAME:                6,
} as const;
