// Pure functions — testable in Jest
// COL and SRP_COL globals are defined in Config.gs in Apps Script scope.
// Fallbacks allow Jest to import this file without Config.gs.
var COL = typeof COL !== 'undefined' ? COL : {
  GROUPING:0,CLUSTER:1,PG:2,CLUSTER_CODE:3,LOCALITY:4,NEIGHBORHOOD:5,
  PARENT_NEIGHBORHOOD:6,STAGE:7,CONTACT:8,EMAIL:9,AUX_BOARD:10,MAKEUP:11,
  TOTAL_POP:12,TOTAL_HH:13,IND_NUM:14,IND_PCT:15,HH_NUM:16,HH_PCT:17,
  CC_ACT:18,CC_PART:19,CC_FOF:20,JYG_ACT:21,JYG_PART:22,JYG_FOF:23,
  SC_ACT:24,SC_PART:25,SC_FOF:26,TOTAL_ED_ACT:27,TOTAL_ED_PART:28,TOTAL_ED_FOF:29,
  DEV_ACT:30,DEV_PART:31,DEV_FOF:32,TOTAL_ACT:33,TOTAL_PART:34,TOTAL_FOF:35,
  PROTAGONISTS:36,ACCOMPANIERS:37,LEVEL:38,NOTES_PREVALENCE:39,
  SUPPORTED:40,NOTES_SUPPORTED:41,PRESENCE:42,NOTES_PRESENCE:43,
  INVOLVED:44,NOTES_INVOLVED:45,EFFORTS:46,NOTES_EFFORTS:47
};

var DEV_COL = typeof DEV_COL !== 'undefined' ? DEV_COL : {
  NAME:0,LATIN_NAME:1,LOCALITY:2,ELECTORAL_UNIT:3,CLUSTER:4,
  GROUP_OF_CLUSTERS:5,SUBREGION:6,REGION:7,GROUP_OF_REGIONS:8,
  NATIONAL_COMMUNITY:9,DEV_ACT:10,DEV_PART:11,DEV_FOF:12,COMMENTS:13
};
var EDU_COL = typeof EDU_COL !== 'undefined' ? EDU_COL : {
  NAME:0,CC_ACT:1,CC_PART:2,CC_FOF:3,JYG_ACT:4,JYG_PART:5,JYG_FOF:6,
  SC_ACT:7,SC_PART:8,SC_FOF:9,FACILITATORS:10
};

function parseRow(row) {
  return {
    grouping:        row[COL.GROUPING],
    cluster:         row[COL.CLUSTER],
    pg:              row[COL.PG],
    clusterCode:     row[COL.CLUSTER_CODE],
    locality:        row[COL.LOCALITY],
    neighborhood:       row[COL.NEIGHBORHOOD],
    parentNeighborhood: row[COL.PARENT_NEIGHBORHOOD],
    stage:              row[COL.STAGE],
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

function findSrpRow(name, rows, nameCol) {
  var needle = (name || '').toLowerCase().trim();
  return rows.find(function(row) {
    return (row[nameCol] || '').toLowerCase().trim() === needle;
  }) || null;
}

function parseSrpData(devRow, eduRow) {
  if (!devRow && !eduRow) return null;
  return {
    facilitators: eduRow ? eduRow[EDU_COL.FACILITATORS] : '',
    ccs:  eduRow ? { act: eduRow[EDU_COL.CC_ACT],  part: eduRow[EDU_COL.CC_PART],  fof: eduRow[EDU_COL.CC_FOF]  } : null,
    jygs: eduRow ? { act: eduRow[EDU_COL.JYG_ACT], part: eduRow[EDU_COL.JYG_PART], fof: eduRow[EDU_COL.JYG_FOF] } : null,
    scs:  eduRow ? { act: eduRow[EDU_COL.SC_ACT],  part: eduRow[EDU_COL.SC_PART],  fof: eduRow[EDU_COL.SC_FOF]  } : null,
    devotionals: devRow ? { act: devRow[DEV_COL.DEV_ACT], part: devRow[DEV_COL.DEV_PART], fof: devRow[DEV_COL.DEV_FOF] } : null
  };
}

// ── Sheets API via service account ───────────────────────────────────────────

var _saToken_ = null;

function _getServiceAccountToken() {
  if (_saToken_) return _saToken_;
  var key = JSON.parse(PropertiesService.getScriptProperties().getProperty('SERVICE_ACCOUNT'));
  var now = Math.floor(Date.now() / 1000);
  var header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var claim  = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }));
  var toSign = header + '.' + claim;
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(toSign, key.private_key));
  var jwt = toSign + '.' + sig;
  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
    muteHttpExceptions: true
  });
  _saToken_ = JSON.parse(resp.getContentText()).access_token;
  return _saToken_;
}

function _sheetsGet(spreadsheetId, range) {
  var token = _getServiceAccountToken();
  var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId +
            '/values/' + encodeURIComponent(range);
  var resp = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });
  var data = JSON.parse(resp.getContentText());
  return data.values || [];
}

function _sheetsUpdateCells(spreadsheetId, sheetName, sheetRow, updates) {
  var token = _getServiceAccountToken();
  var data = updates.map(function(u) {
    return { range: sheetName + '!' + _colLetter(u.col) + sheetRow, values: [[u.value]] };
  });
  UrlFetchApp.fetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId + '/values:batchUpdate',
    {
      method: 'post',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ valueInputOption: 'RAW', data: data }),
      muteHttpExceptions: true
    }
  );
}

function _colLetter(index) {
  var letter = '';
  index++;
  while (index > 0) {
    var rem = (index - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    index = Math.floor((index - 1) / 26);
  }
  return letter;
}

function _normalizeRow(row, numCols) {
  var r = row ? row.slice() : [];
  while (r.length < numCols) r.push('');
  return r;
}

// ── Sheet readers ─────────────────────────────────────────────────────────────

// COL goes up to index 47 = column AV
function _getAllMasterRows() {
  var rows = _sheetsGet(MASTER_SHEET_ID, MASTER_TAB + '!A' + MASTER_DATA_ROW + ':AV');
  return rows.map(function(r) { return _normalizeRow(r, 48); });
}

function _getCacheRows(sheetId, tabName, numCols, dataRow) {
  var endCol = _colLetter(numCols - 1);
  var rows = _sheetsGet(sheetId, tabName + '!A' + dataRow + ':' + endCol);
  return rows.map(function(r) { return _normalizeRow(r, numCols); });
}

function _getAllDevRows() { return _getCacheRows(SRP_SHEET_ID, DEV_TAB, 14, SRP_DATA_ROW); }
function _getAllEduRows() { return _getCacheRows(SRP_SHEET_ID, EDU_TAB, 11, SRP_DATA_ROW); }

// Returns parsed row data + SRP data for a given neighborhood name
function getRowData(neighborhoodName) {
  var masterRows = _getAllMasterRows();
  var masterRow = masterRows.find(function(r) {
    return (r[COL.NEIGHBORHOOD] || '').toLowerCase().trim() ===
           (neighborhoodName || '').toLowerCase().trim();
  });
  if (!masterRow) return null;

  var devRows = _getAllDevRows();
  var eduRows = _getAllEduRows();

  function lookup(rows, nameCol) {
    var match = findSrpRow(neighborhoodName, rows, nameCol);
    if (!match && masterRow[COL.PARENT_NEIGHBORHOOD]) {
      var combined = masterRow[COL.PARENT_NEIGHBORHOOD] + ' - ' + neighborhoodName;
      match = findSrpRow(combined, rows, nameCol);
    }
    return match;
  }

  var srp = parseSrpData(lookup(devRows, DEV_COL.NAME), lookup(eduRows, EDU_COL.NAME));

  return {
    row: parseRow(masterRow),
    srp: srp,
    lastUpdatedBy: '',
    lastUpdatedAt: ''
  };
}

function saveRowData(neighborhoodName, formData, userEmail) {
  var allRows = _getAllMasterRows();
  var rowIndex = allRows.findIndex(function(r) {
    return (r[COL.NEIGHBORHOOD] || '').toLowerCase().trim() ===
           (neighborhoodName || '').toLowerCase().trim();
  });
  if (rowIndex === -1) throw new Error('Row not found: ' + neighborhoodName);

  var sheetRow = MASTER_DATA_ROW + rowIndex;
  _sheetsUpdateCells(MASTER_SHEET_ID, MASTER_TAB, sheetRow, buildRowUpdate(formData));

  var props = {};
  props['lastUpdatedBy_' + neighborhoodName] = userEmail;
  props['lastUpdatedAt_' + neighborhoodName] = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperties(props);

  return { success: true };
}

function buildRowUpdate(formData) {
  var d = formData;
  return [
    { col: COL.LOCALITY,         value: d.locality },
    { col: COL.STAGE,            value: d.stage },
    { col: COL.CONTACT,          value: d.contact },
    { col: COL.EMAIL,            value: d.email },
    { col: COL.AUX_BOARD,        value: d.auxBoard },
    { col: COL.MAKEUP,           value: d.makeup },
    { col: COL.TOTAL_POP,        value: d.totalPop },
    { col: COL.TOTAL_HH,         value: d.totalHH },
    { col: COL.IND_NUM,          value: d.indNum },
    { col: COL.IND_PCT,          value: d.indPct },
    { col: COL.HH_NUM,           value: d.hhNum },
    { col: COL.HH_PCT,           value: d.hhPct },
    { col: COL.CC_ACT,           value: d.activities.ccs.act },
    { col: COL.CC_PART,          value: d.activities.ccs.part },
    { col: COL.CC_FOF,           value: d.activities.ccs.fof },
    { col: COL.JYG_ACT,          value: d.activities.jygs.act },
    { col: COL.JYG_PART,         value: d.activities.jygs.part },
    { col: COL.JYG_FOF,          value: d.activities.jygs.fof },
    { col: COL.SC_ACT,           value: d.activities.scs.act },
    { col: COL.SC_PART,          value: d.activities.scs.part },
    { col: COL.SC_FOF,           value: d.activities.scs.fof },
    { col: COL.DEV_ACT,          value: d.activities.devotionals.act },
    { col: COL.DEV_PART,         value: d.activities.devotionals.part },
    { col: COL.DEV_FOF,          value: d.activities.devotionals.fof },
    { col: COL.PROTAGONISTS,     value: d.protagonists },
    { col: COL.ACCOMPANIERS,     value: d.accompaniers },
    { col: COL.LEVEL,            value: d.level },
    { col: COL.NOTES_PREVALENCE, value: d.notesPrevalence },
    { col: COL.SUPPORTED,        value: d.supported },
    { col: COL.NOTES_SUPPORTED,  value: d.notesSupported },
    { col: COL.PRESENCE,         value: d.presence },
    { col: COL.NOTES_PRESENCE,   value: d.notesPresence },
    { col: COL.INVOLVED,         value: d.involved },
    { col: COL.NOTES_INVOLVED,   value: d.notesInvolved },
    { col: COL.EFFORTS,          value: d.efforts },
    { col: COL.NOTES_EFFORTS,    value: d.notesEfforts }
  ];
}

if (typeof module !== 'undefined') {
  module.exports = { parseRow: parseRow, findSrpRow: findSrpRow, parseSrpData: parseSrpData };
}
