// Auth.gs

// Pure functions — exported for testing via module.exports at end of file
function _isGlobalUser(email, globalList) {
  var norm = email.toLowerCase().trim();
  return globalList.some(function(e) { return (e || '').toLowerCase().trim() === norm; });
}

function _getContactRowIndices(email, rows, emailCol) {
  var norm = email.toLowerCase().trim();
  return rows.reduce(function(acc, row, i) {
    if ((row[emailCol] || '').toLowerCase().trim() === norm) acc.push(i);
    return acc;
  }, []);
}

// Apps Script entry point — identity comes from Google (USER_ACCESSING)
function getAuthorizedRows() {
  var email = Session.getActiveUser().getEmail();

  var globalRows = _sheetsGet(MASTER_SHEET_ID, ACCESS_TAB + '!A:A');
  var globalList = globalRows.reduce(function(acc, r) {
    if (r[0]) acc.push(r[0]);
    return acc;
  }, []);

  var allRows = _getAllMasterRows();
  if (allRows.length === 0) return { role: 'none', rows: [], email: email };

  if (_isGlobalUser(email, globalList)) {
    return { role: 'global', rows: allRows, email: email };
  }

  var indices = _getContactRowIndices(email, allRows, COL.EMAIL);
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
