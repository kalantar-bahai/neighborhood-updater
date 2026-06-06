// Auth.gs

// Fallback for COL when running in Node/Jest (Apps Script globals not available)
var COL = typeof COL !== 'undefined' ? COL : { EMAIL: 8 };

// Pure functions — exported for testing via module.exports at end of file
function _isGlobalUser(email, globalList) {
  var norm = email.toLowerCase().trim();
  return globalList.some(function(e) { return (e || '').toLowerCase().trim() === norm; });
}

function _getContactRowIndices(email, rows) {
  var norm = email.toLowerCase().trim();
  return rows.reduce(function(acc, row, i) {
    if ((row[COL.EMAIL] || '').toLowerCase().trim() === norm) acc.push(i);
    return acc;
  }, []);
}

// Apps Script entry point
function getAuthorizedRows() {
  var email = Session.getActiveUser().getEmail();
  var ss = SpreadsheetApp.openById(MASTER_SHEET_ID);

  var globalSheet = ss.getSheetByName(ACCESS_TAB);
  var globalList = globalSheet.getDataRange().getValues().flat().filter(Boolean);

  var dataSheet = ss.getSheetByName(MASTER_TAB);
  var lastRow = dataSheet.getLastRow();
  var lastCol = dataSheet.getLastColumn();
  var numDataRows = lastRow - MASTER_DATA_ROW + 1;
  if (numDataRows < 1) return { role: 'none', rows: [], email: email };

  var allRows = dataSheet
    .getRange(MASTER_DATA_ROW, 1, numDataRows, lastCol)
    .getValues();

  if (_isGlobalUser(email, globalList)) {
    return { role: 'global', rows: allRows, email: email };
  }

  var indices = _getContactRowIndices(email, allRows);
  if (indices.length === 0) return { role: 'none', rows: [], email: email };

  return {
    role: 'contact',
    rows: indices.map(function(i) { return allRows[i]; }),
    email: email
  };
}

// Allow jest to import pure functions
if (typeof module !== 'undefined') {
  module.exports = { _isGlobalUser: _isGlobalUser, _getContactRowIndices: _getContactRowIndices };
}
