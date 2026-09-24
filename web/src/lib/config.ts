export const MASTER_SHEET_ID = process.env.MASTER_SHEET_ID!;

export const MASTER_TAB  = 'Nuclei';
export const ACCESS_TAB  = 'Access';
// The SRP cache spreadsheet (Devotionals + Education tabs) is no longer read at
// all, 2026-09-14 -- Education's last live field (facilitators) moved to
// cluster-notebook's ActivitySummary.facilitatorNames, and Devotionals' last use
// (the Picker's "not in SRP" badge) was retired outright.

export const MASTER_DATA_ROW = 4;

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
  CONTACT:             9,  // dead: contact is now the 'contact' role in cluster-notebook
  EMAIL:               10, // dead: contact email now comes from that Individual's own email field
  AUX_BOARD:           11,
  MAKEUP:              12,
  TOTAL_POP:           13,
  TOTAL_HH:            14,
  IND_NUM:             15,
  IND_PCT:             16,
  HH_NUM:              17,
  HH_PCT:              18,
  // CC/JYG/SC/DEV_* (19-33): dead. All four activity rollups (childrensClasses/
  // juniorYouthGroups/studyCircles/devotionalGathering) now come from
  // cluster-notebook's ActivitySummary via updateActivitySummary, 2026-09-14.
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
  // dead: the hand-typed counts are retired -- Helping/Accompanying now show the
  // persisted 'protagonist'/'accompanier' role lists directly (protagonistNames.length/
  // accompanierNames.length), 2026-09-14, matching Promoting's read-only-list pattern.
  PROTAGONISTS:        37,
  ACCOMPANIERS:        38,
  // LEVEL/NOTES_PREVALENCE/SUPPORTED/NOTES_SUPPORTED (39-42): dead. No UI has ever
  // read or written these ("Level"/"Notes" under "Prevalence", "Supported?"/"Notes"
  // under "Assembly Support" in the sheet's own header rows) -- removed entirely,
  // 2026-09-14, rather than left readonly, because round-tripping form.level etc. on
  // every save was silently overwriting any value entered directly in the sheet with
  // a stale copy from page load. Column positions kept in case someone still
  // maintains these columns by hand in the spreadsheet.
  LEVEL:               39,
  NOTES_PREVALENCE:    40,
  SUPPORTED:           41,
  NOTES_SUPPORTED:     42,
  PRESENCE:            43,
  NOTES_PRESENCE:      44,
  // INVOLVED/NOTES_INVOLVED/EFFORTS/NOTES_EFFORTS (45-48): dead, same reasoning as
  // LEVEL/SUPPORTED above ("Involved?"/"Notes" under "Local Leaders Involved in
  // Bahá'í Community Life", "Efforts Made?"/"Notes" under "Specific Efforts Made to
  // Foster Spiritual Health of Neighborhood").
  INVOLVED:            45,
  NOTES_INVOLVED:      46,
  EFFORTS:             47,
  NOTES_EFFORTS:       48,
  GATHERINGS:          49,
  NOTES_GATHERINGS:    50,
  NARRATIVE:           51,
} as const;

// Worker/role lists (accompanier/protagonist/abm-assistant/contact/promoter) now live
// entirely in cluster-notebook (Individual + RoleInNE) -- no Sheet tab/columns
// for them anymore. `contact` is single-valued (see WorkerListModal's `single`
// prop) but otherwise uses the same read/write shape as the others. `promoter`
// (2026-09-14, Overview card restructure) is a fresh role, not tied to any prior
// Sheet-sourced field.
export const WORKER_TYPES = ['accompanier', 'protagonist', 'abm-assistant', 'contact', 'promoter'] as const;
export type WorkerType = typeof WORKER_TYPES[number];

// Confirmed with cluster-notebook 2026-09-24: accompanier/contact/abm-assistant
// are REAL recognized roles now (real permission grants, e.g. accompanier is
// read+write) -- assigning someone into one requires that role name to appear
// in the assigner's PermissionSet.assignableRoles, same as ATC/CIC/CSO/etc.
// protagonist/promoter stay informal (freely assignable whenever canAssignRoles
// is true) -- cluster-notebook's own open question (their issue #14), not
// something this app decides.
export const RECOGNIZED_WORKER_TYPES = ['accompanier', 'contact', 'abm-assistant'] as const;

export const ACCESS_COL = {
  NAME:    0,
  EMAIL:   1,
  ROLE:    2,
  NUCLEUS: 3,
} as const;
