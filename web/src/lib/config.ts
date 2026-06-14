export const MASTER_SHEET_ID = process.env.MASTER_SHEET_ID!;
export const SRP_SHEET_ID    = process.env.SRP_SHEET_ID!;

export const MASTER_TAB  = 'Neighborhoods';
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
  NEIGHBORHOOD:        5,
  PARENT_NEIGHBORHOOD: 6,
  STAGE:               7,
  CONTACT:             8,
  EMAIL:               9,
  AUX_BOARD:           10,
  MAKEUP:              11,
  TOTAL_POP:           12,
  TOTAL_HH:            13,
  IND_NUM:             14,
  IND_PCT:             15,
  HH_NUM:              16,
  HH_PCT:              17,
  CC_ACT:              18,
  CC_PART:             19,
  CC_FOF:              20,
  JYG_ACT:             21,
  JYG_PART:            22,
  JYG_FOF:             23,
  SC_ACT:              24,
  SC_PART:             25,
  SC_FOF:              26,
  TOTAL_ED_ACT:        27,
  TOTAL_ED_PART:       28,
  TOTAL_ED_FOF:        29,
  DEV_ACT:             30,
  DEV_PART:            31,
  DEV_FOF:             32,
  TOTAL_ACT:           33,
  TOTAL_PART:          34,
  TOTAL_FOF:           35,
  PROTAGONISTS:        36,
  ACCOMPANIERS:        37,
  LEVEL:               38,
  NOTES_PREVALENCE:    39,
  SUPPORTED:           40,
  NOTES_SUPPORTED:     41,
  PRESENCE:            42,
  NOTES_PRESENCE:      43,
  INVOLVED:            44,
  NOTES_INVOLVED:      45,
  EFFORTS:             46,
  NOTES_EFFORTS:       47,
  GATHERINGS:          48,
  NOTES_GATHERINGS:    49,
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
