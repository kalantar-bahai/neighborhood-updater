// Pure functions — testable in Jest
// COL and SRP_COL globals are defined in Config.gs in Apps Script scope.
// Fallbacks allow Jest to import this file without Config.gs.
var COL = typeof COL !== 'undefined' ? COL : {
  GROUPING:0,CLUSTER:1,PG:2,CLUSTER_CODE:3,LOCALITY:4,NEIGHBORHOOD:5,
  STAGE:6,CONTACT:7,EMAIL:8,AUX_BOARD:9,MAKEUP:10,TOTAL_POP:11,TOTAL_HH:12,
  IND_NUM:13,IND_PCT:14,HH_NUM:15,HH_PCT:16,
  CC_ACT:17,CC_PART:18,CC_FOF:19,JYG_ACT:20,JYG_PART:21,JYG_FOF:22,
  SC_ACT:23,SC_PART:24,SC_FOF:25,TOTAL_ED_ACT:26,TOTAL_ED_PART:27,TOTAL_ED_FOF:28,
  DEV_ACT:29,DEV_PART:30,DEV_FOF:31,TOTAL_ACT:32,TOTAL_PART:33,TOTAL_FOF:34,
  PROTAGONISTS:35,ACCOMPANIERS:36,LEVEL:37,NOTES_PREVALENCE:38,
  SUPPORTED:39,NOTES_SUPPORTED:40,PRESENCE:41,NOTES_PRESENCE:42,
  INVOLVED:43,NOTES_INVOLVED:44,EFFORTS:45,NOTES_EFFORTS:46
};

var SRP_COL = typeof SRP_COL !== 'undefined' ? SRP_COL : {
  NAME:0,CC_ACT:1,CC_PART:2,CC_FOF:3,JYG_ACT:4,JYG_PART:5,JYG_FOF:6,
  SC_ACT:7,SC_PART:8,SC_FOF:9,FACILITATORS:10,DEV_ACT:14,DEV_PART:15,DEV_FOF:16
};

function parseRow(row) {
  return {
    grouping:        row[COL.GROUPING],
    cluster:         row[COL.CLUSTER],
    pg:              row[COL.PG],
    clusterCode:     row[COL.CLUSTER_CODE],
    locality:        row[COL.LOCALITY],
    neighborhood:    row[COL.NEIGHBORHOOD],
    stage:           row[COL.STAGE],
    contact:         row[COL.CONTACT],
    email:           row[COL.EMAIL],
    auxBoard:        row[COL.AUX_BOARD],
    makeup:          row[COL.MAKEUP],
    totalPop:        row[COL.TOTAL_POP],
    totalHH:         row[COL.TOTAL_HH],
    indNum:          row[COL.IND_NUM],
    indPct:          row[COL.IND_PCT],
    hhNum:           row[COL.HH_NUM],
    hhPct:           row[COL.HH_PCT],
    activities: {
      ccs:         { act: row[COL.CC_ACT],       part: row[COL.CC_PART],       fof: row[COL.CC_FOF] },
      jygs:        { act: row[COL.JYG_ACT],      part: row[COL.JYG_PART],      fof: row[COL.JYG_FOF] },
      scs:         { act: row[COL.SC_ACT],       part: row[COL.SC_PART],       fof: row[COL.SC_FOF] },
      totalEd:     { act: row[COL.TOTAL_ED_ACT], part: row[COL.TOTAL_ED_PART], fof: row[COL.TOTAL_ED_FOF] },
      devotionals: { act: row[COL.DEV_ACT],      part: row[COL.DEV_PART],      fof: row[COL.DEV_FOF] },
      totalAll:    { act: row[COL.TOTAL_ACT],    part: row[COL.TOTAL_PART],    fof: row[COL.TOTAL_FOF] }
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
    notesEfforts:    row[COL.NOTES_EFFORTS]
  };
}

function findSrpRow(neighborhoodName, srpRows) {
  var name = (neighborhoodName || '').toLowerCase().trim();
  return srpRows.find(function(row) {
    return (row[SRP_COL.NAME] || '').toLowerCase().trim() === name;
  }) || null;
}

function parseSrpRow(row) {
  if (!row) return null;
  return {
    facilitators: row[SRP_COL.FACILITATORS],
    ccs:          { act: row[SRP_COL.CC_ACT],  part: row[SRP_COL.CC_PART],  fof: row[SRP_COL.CC_FOF] },
    jygs:         { act: row[SRP_COL.JYG_ACT], part: row[SRP_COL.JYG_PART], fof: row[SRP_COL.JYG_FOF] },
    scs:          { act: row[SRP_COL.SC_ACT],  part: row[SRP_COL.SC_PART],  fof: row[SRP_COL.SC_FOF] },
    devotionals:  { act: row[SRP_COL.DEV_ACT], part: row[SRP_COL.DEV_PART], fof: row[SRP_COL.DEV_FOF] }
  };
}

if (typeof module !== 'undefined') {
  module.exports = { parseRow: parseRow, findSrpRow: findSrpRow, parseSrpRow: parseSrpRow };
}
