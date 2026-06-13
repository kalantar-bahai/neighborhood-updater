import { sheetsGet, sheetsBatchUpdate } from './sheets';
import {
  MASTER_SHEET_ID, SRP_SHEET_ID,
  MASTER_TAB, ACCESS_TAB, DEV_TAB, EDU_TAB,
  MASTER_DATA_ROW, SRP_DATA_ROW,
  COL, DEV_COL, EDU_COL,
} from './config';

function normalize(row: string[], numCols: number): string[] {
  const r = row ? [...row] : [];
  while (r.length < numCols) r.push('');
  return r;
}

function norm(s: string) { return (s || '').toLowerCase().trim(); }

export async function getAllMasterRows() {
  const rows = await sheetsGet(MASTER_SHEET_ID, `${MASTER_TAB}!A${MASTER_DATA_ROW}:AV`);
  return rows.map(r => normalize(r, 48));
}

export async function getGlobalList() {
  const rows = await sheetsGet(MASTER_SHEET_ID, `${ACCESS_TAB}!A:A`);
  return rows.flatMap(r => r[0] ? [r[0]] : []);
}

export async function getAllDevRows() {
  const rows = await sheetsGet(SRP_SHEET_ID, `${DEV_TAB}!A${SRP_DATA_ROW}:N`);
  return rows.map(r => normalize(r, 14));
}

export async function getAllEduRows() {
  const rows = await sheetsGet(SRP_SHEET_ID, `${EDU_TAB}!A${SRP_DATA_ROW}:K`);
  return rows.map(r => normalize(r, 11));
}

export function parseRow(row: string[]) {
  return {
    grouping:            row[COL.GROUPING],
    cluster:             row[COL.CLUSTER],
    pg:                  row[COL.PG],
    clusterCode:         row[COL.CLUSTER_CODE],
    locality:            row[COL.LOCALITY],
    neighborhood:        row[COL.NEIGHBORHOOD],
    parentNeighborhood:  row[COL.PARENT_NEIGHBORHOOD],
    stage:               row[COL.STAGE],
    contact:             row[COL.CONTACT],
    email:               row[COL.EMAIL],
    auxBoard:            row[COL.AUX_BOARD],
    makeup:              row[COL.MAKEUP],
    totalPop:            row[COL.TOTAL_POP],
    totalHH:             row[COL.TOTAL_HH],
    indNum:              row[COL.IND_NUM],
    indPct:              row[COL.IND_PCT],
    hhNum:               row[COL.HH_NUM],
    hhPct:               row[COL.HH_PCT],
    activities: {
      ccs:         { act: row[COL.CC_ACT],        part: row[COL.CC_PART],        fof: row[COL.CC_FOF] },
      jygs:        { act: row[COL.JYG_ACT],       part: row[COL.JYG_PART],       fof: row[COL.JYG_FOF] },
      scs:         { act: row[COL.SC_ACT],        part: row[COL.SC_PART],        fof: row[COL.SC_FOF] },
      devotionals: { act: row[COL.DEV_ACT],       part: row[COL.DEV_PART],       fof: row[COL.DEV_FOF] },
    },
    protagonists:    row[COL.PROTAGONISTS],
    accompaniers:    row[COL.ACCOMPANIERS],
    level:           row[COL.LEVEL],
    notesPrevalence: row[COL.NOTES_PREVALENCE],
    supported:       row[COL.SUPPORTED],
    notesSupported:  row[COL.NOTES_SUPPORTED],
    presence:        row[COL.PRESENCE],
    notesPresence:   row[COL.NOTES_PRESENCE],
    involved:        row[COL.INVOLVED],
    notesInvolved:   row[COL.NOTES_INVOLVED],
    efforts:         row[COL.EFFORTS],
    notesEfforts:    row[COL.NOTES_EFFORTS],
  };
}

export function findSrpRow(name: string, rows: string[][], nameCol: number) {
  const needle = norm(name);
  return rows.find(r => norm(r[nameCol]) === needle) ?? null;
}

export function parseSrpData(devRow: string[] | null, eduRow: string[] | null) {
  if (!devRow && !eduRow) return null;
  return {
    facilitators: eduRow ? eduRow[EDU_COL.FACILITATORS] : '',
    ccs:          eduRow ? { act: eduRow[EDU_COL.CC_ACT],  part: eduRow[EDU_COL.CC_PART],  fof: eduRow[EDU_COL.CC_FOF]  } : null,
    jygs:         eduRow ? { act: eduRow[EDU_COL.JYG_ACT], part: eduRow[EDU_COL.JYG_PART], fof: eduRow[EDU_COL.JYG_FOF] } : null,
    scs:          eduRow ? { act: eduRow[EDU_COL.SC_ACT],  part: eduRow[EDU_COL.SC_PART],  fof: eduRow[EDU_COL.SC_FOF]  } : null,
    devotionals:  devRow ? { act: devRow[DEV_COL.DEV_ACT], part: devRow[DEV_COL.DEV_PART], fof: devRow[DEV_COL.DEV_FOF] } : null,
  };
}

export async function getRowData(neighborhoodName: string) {
  const [masterRows, devRows, eduRows] = await Promise.all([
    getAllMasterRows(), getAllDevRows(), getAllEduRows(),
  ]);

  const masterRow = masterRows.find(r => norm(r[COL.NEIGHBORHOOD]) === norm(neighborhoodName));
  if (!masterRow) return null;

  const lookup = (rows: string[][], nameCol: number) => {
    let match = findSrpRow(neighborhoodName, rows, nameCol);
    if (!match && masterRow[COL.PARENT_NEIGHBORHOOD]) {
      match = findSrpRow(`${masterRow[COL.PARENT_NEIGHBORHOOD]} - ${neighborhoodName}`, rows, nameCol);
    }
    return match;
  };

  return {
    row: parseRow(masterRow),
    srp: parseSrpData(lookup(devRows, DEV_COL.NAME), lookup(eduRows, EDU_COL.NAME)),
  };
}

export async function saveRowData(neighborhoodName: string, formData: Record<string, unknown>, userEmail: string) {
  const allRows = await getAllMasterRows();
  const rowIndex = allRows.findIndex(r => norm(r[COL.NEIGHBORHOOD]) === norm(neighborhoodName));
  if (rowIndex === -1) throw new Error(`Row not found: ${neighborhoodName}`);

  const sheetRow = MASTER_DATA_ROW + rowIndex;
  const d = formData as any;
  const colLetter = (i: number) => {
    let letter = '', idx = i + 1;
    while (idx > 0) { const rem = (idx - 1) % 26; letter = String.fromCharCode(65 + rem) + letter; idx = Math.floor((idx - 1) / 26); }
    return letter;
  };

  const updates = [
    [COL.LOCALITY, d.locality], [COL.STAGE, d.stage], [COL.CONTACT, d.contact],
    [COL.EMAIL, d.email], [COL.AUX_BOARD, d.auxBoard], [COL.MAKEUP, d.makeup],
    [COL.TOTAL_POP, d.totalPop], [COL.TOTAL_HH, d.totalHH],
    [COL.IND_NUM, d.indNum],
    [COL.HH_NUM, d.hhNum],
    [COL.CC_ACT, d.activities.ccs.act], [COL.CC_PART, d.activities.ccs.part], [COL.CC_FOF, d.activities.ccs.fof],
    [COL.JYG_ACT, d.activities.jygs.act], [COL.JYG_PART, d.activities.jygs.part], [COL.JYG_FOF, d.activities.jygs.fof],
    [COL.SC_ACT, d.activities.scs.act], [COL.SC_PART, d.activities.scs.part], [COL.SC_FOF, d.activities.scs.fof],
    [COL.DEV_ACT, d.activities.devotionals.act], [COL.DEV_PART, d.activities.devotionals.part], [COL.DEV_FOF, d.activities.devotionals.fof],
    [COL.PROTAGONISTS, d.protagonists], [COL.ACCOMPANIERS, d.accompaniers],
    [COL.LEVEL, d.level], [COL.NOTES_PREVALENCE, d.notesPrevalence],
    [COL.SUPPORTED, d.supported], [COL.NOTES_SUPPORTED, d.notesSupported],
    [COL.PRESENCE, d.presence], [COL.NOTES_PRESENCE, d.notesPresence],
    [COL.INVOLVED, d.involved], [COL.NOTES_INVOLVED, d.notesInvolved],
    [COL.EFFORTS, d.efforts], [COL.NOTES_EFFORTS, d.notesEfforts],
  ].map(([col, value]) => ({
    range: `${MASTER_TAB}!${colLetter(col as number)}${sheetRow}`,
    values: [[value ?? '']],
  }));

  await sheetsBatchUpdate(MASTER_SHEET_ID, updates);
  return { success: true, savedBy: userEmail, savedAt: new Date().toISOString() };
}
