# Neighborhood Row Detail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Google Apps Script web app that lets authorized users view and edit one neighborhood row at a time, backed by the master Google Sheet, with activity data pre-filled from the SRP cache sheet.

**Architecture:** A Google Apps Script project (developed locally with `clasp`, deployed as a web app) serves an HTML/CSS/JS frontend. Server-side `.gs` files handle authentication (checking a `GlobalAccess` sheet tab + row-level Contact Email) and all Sheets API calls. The client communicates with the server via `google.script.run`. Column mapping is by index, not name, because the master sheet has duplicate header names.

**Tech Stack:** Google Apps Script, HTML/CSS/JavaScript, `clasp` CLI, `jest` (for pure utility function tests)

---

## File Structure

```
neighborhood/
├── .clasp.json              # clasp project config (script ID)
├── appsscript.json          # Apps Script manifest (scopes, webapp config)
├── package.json             # jest dependency only
├── .gitignore
├── Config.gs                # Constants: sheet IDs, column indices, sheet names
├── Auth.gs                  # Permission checking (global list + row contact email)
├── Data.gs                  # Read/write master sheet rows; read SRP cache
├── Code.gs                  # doGet() entry point + server functions exposed to client
├── Index.html               # Shell page (loads CSS/JS, triggers getInitialData)
├── Stylesheet.html          # All CSS
├── JavaScript.html          # All client-side JS
└── tests/
    ├── auth.test.js         # Jest tests for pure auth logic
    └── data.test.js         # Jest tests for row parsing and SRP matching
```

---

## Spreadsheet Setup

**Master sheet** (`1FwM4TLET45DibGyAljN-jyj6CJsXK-4rZuokliCwA44`):
- Tab `Neighborhoods`: 3-row header, data from row 4. Column mapping by index (see Config.gs).
- Tab `GlobalAccess` (to be created): single column of email addresses, one per row, no header.

**SRP cache sheet** (`1w8eRljld_O4vkSPNwRuKWO6YL7uJIJXZ3AtqWUPi5Eo`):
- Tab `Sheet1`: 3-row header, data from row 4. Column 0 = neighborhood name (matches `Neighborhood & Pockets` in master sheet).

---

## Column Indices

### Master sheet (Neighborhoods tab, 0-based)
```
0  Grouping                    28 Total Ed FOF
1  Cluster                     29 Devotionals Act.
2  PG                          30 Devotionals Part.
3  Cluster Code                31 Devotionals FOF
4  Locality                    32 Total Activities Act.
5  Neighborhood & Pockets      33 Total Activities Part.
6  Neighborhood Stage          34 Total Activities FOF
7  Neighborhood Contact        35 Protagonists/Workers #
8  Contact Email               36 Accompaniers in Nucleus #
9  Auxiliary Board member      37 Level
10 Makeup of population        38 Notes (Prevalence)
11 Total Population            39 Supported?
12 Total Households            40 Notes (Assembly Support)
13 Individuals Connected #     41 Presence?
14 Individuals Connected %     42 Notes (Social Action)
15 Households Connected #      43 Involved?
16 Households Connected %      44 Notes (Local Leaders)
17 CCs Act.                    45 Efforts Made?
18 CCs Part.                   46 Notes (Spiritual Health)
19 CCs FOF
20 JYGs Act.
21 JYGs Part.
22 JYGs FOF
23 SCs Act.
24 SCs Part.
25 SCs FOF
26 Total Ed Act.
27 Total Ed Part.
```

### SRP cache sheet (Sheet1 tab, 0-based)
```
0  Focus Neighbourhood     10 All Ed Facilitators
1  CCs No.                 11 All Ed No.
2  CCs Participation       12 All Ed Participation
3  CCs FoF                 13 All Ed FoF
4  JYGs No.                14 Devotionals No.
5  JYGs Participation      15 Devotionals Participation
6  JYGs FoF                16 Devotionals FoF
7  SCs No.
8  SCs Participation
9  SCs FoF
```

---

## Task 1: Project Setup

**Files:**
- Create: `.clasp.json`
- Create: `appsscript.json`
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Install clasp globally**

```bash
npm install -g @google/clasp
clasp login
```

Expected: browser opens for Google auth. Complete login.

- [ ] **Step 2: Create the Apps Script project**

Go to https://script.google.com → New project → rename it "Neighborhood Detail".
Copy the script ID from the URL: `https://script.google.com/home/projects/<SCRIPT_ID>/edit`

- [ ] **Step 3: Create .clasp.json**

```json
{
  "scriptId": "<SCRIPT_ID_FROM_STEP_2>",
  "rootDir": "."
}
```

- [ ] **Step 4: Create appsscript.json**

```json
{
  "timeZone": "America/New_York",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_ACCESSING",
    "access": "ANYONE_WITH_GOOGLE_ACCOUNT"
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}
```

Note: `executeAs: USER_ACCESSING` means the script runs as the logged-in user. That user must have been granted access to both Google Sheets by the service account or as an editor. For this app, the service account owns the sheets — the Apps Script project needs to be shared with users separately, or the sheet shared directly with users. See Task 15 for deployment notes.

- [ ] **Step 5: Create package.json**

```json
{
  "name": "neighborhood",
  "private": true,
  "scripts": {
    "test": "jest",
    "push": "clasp push"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  }
}
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
.clasp.json
```

Note: `.clasp.json` contains the script ID which is semi-sensitive — keep it out of git.

- [ ] **Step 7: Install dependencies**

```bash
npm install
```

- [ ] **Step 8: Add GlobalAccess tab to master sheet**

Open https://docs.google.com/spreadsheets/d/1FwM4TLET45DibGyAljN-jyj6CJsXK-4rZuokliCwA44
Click the `+` to add a new tab. Name it `GlobalAccess`.
In cell A1, enter your own email address (for testing).
Leave no header row — just emails, one per row.

- [ ] **Step 9: Commit**

```bash
git init
git add appsscript.json package.json package-lock.json .gitignore
git commit -m "chore: initialize Apps Script project with clasp"
```

---

## Task 2: Config.gs

**Files:**
- Create: `Config.gs`

- [ ] **Step 1: Create Config.gs**

```javascript
var MASTER_SHEET_ID = '1FwM4TLET45DibGyAljN-jyj6CJsXK-4rZuokliCwA44';
var SRP_SHEET_ID    = '1w8eRljld_O4vkSPNwRuKWO6YL7uJIJXZ3AtqWUPi5Eo';

var MASTER_TAB      = 'Neighborhoods';
var ACCESS_TAB      = 'GlobalAccess';
var SRP_TAB         = 'Sheet1';

var MASTER_DATA_ROW = 4; // 1-based: data starts here
var SRP_DATA_ROW    = 4;

var COL = {
  GROUPING:         0,
  CLUSTER:          1,
  PG:               2,
  CLUSTER_CODE:     3,
  LOCALITY:         4,
  NEIGHBORHOOD:     5,
  STAGE:            6,
  CONTACT:          7,
  EMAIL:            8,
  AUX_BOARD:        9,
  MAKEUP:           10,
  TOTAL_POP:        11,
  TOTAL_HH:         12,
  IND_NUM:          13,
  IND_PCT:          14,
  HH_NUM:           15,
  HH_PCT:           16,
  CC_ACT:           17,
  CC_PART:          18,
  CC_FOF:           19,
  JYG_ACT:          20,
  JYG_PART:         21,
  JYG_FOF:          22,
  SC_ACT:           23,
  SC_PART:          24,
  SC_FOF:           25,
  TOTAL_ED_ACT:     26,
  TOTAL_ED_PART:    27,
  TOTAL_ED_FOF:     28,
  DEV_ACT:          29,
  DEV_PART:         30,
  DEV_FOF:          31,
  TOTAL_ACT:        32,
  TOTAL_PART:       33,
  TOTAL_FOF:        34,
  PROTAGONISTS:     35,
  ACCOMPANIERS:     36,
  LEVEL:            37,
  NOTES_PREVALENCE: 38,
  SUPPORTED:        39,
  NOTES_SUPPORTED:  40,
  PRESENCE:         41,
  NOTES_PRESENCE:   42,
  INVOLVED:         43,
  NOTES_INVOLVED:   44,
  EFFORTS:          45,
  NOTES_EFFORTS:    46
};

var SRP_COL = {
  NAME:         0,
  CC_ACT:       1,
  CC_PART:      2,
  CC_FOF:       3,
  JYG_ACT:      4,
  JYG_PART:     5,
  JYG_FOF:      6,
  SC_ACT:       7,
  SC_PART:      8,
  SC_FOF:       9,
  FACILITATORS: 10,
  DEV_ACT:      14,
  DEV_PART:     15,
  DEV_FOF:      16
};
```

- [ ] **Step 2: Push to Apps Script**

```bash
npm run push
```

Expected: `Pushed N files.`

- [ ] **Step 3: Commit**

```bash
git add Config.gs
git commit -m "feat: add column index constants"
```

---

## Task 3: Auth.gs

**Files:**
- Create: `Auth.gs`
- Create: `tests/auth.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/auth.test.js
const { _isGlobalUser, _getContactRowIndices } = require('../Auth.gs');

describe('_isGlobalUser', () => {
  const globalList = ['admin@example.com', 'coord@example.com'];

  test('returns true for exact match', () => {
    expect(_isGlobalUser('admin@example.com', globalList)).toBe(true);
  });

  test('is case-insensitive', () => {
    expect(_isGlobalUser('Admin@Example.COM', globalList)).toBe(true);
  });

  test('returns false for unknown email', () => {
    expect(_isGlobalUser('stranger@example.com', globalList)).toBe(false);
  });

  test('returns false for empty list', () => {
    expect(_isGlobalUser('admin@example.com', [])).toBe(false);
  });
});

describe('_getContactRowIndices', () => {
  const rows = [
    ['', '', '', '', '', 'Alpha', '', 'Alice', 'alice@x.com'],
    ['', '', '', '', '', 'Beta',  '', 'Bob',   'bob@x.com'],
    ['', '', '', '', '', 'Gamma', '', 'Alice', 'alice@x.com']
  ];

  test('returns indices of rows matching email', () => {
    expect(_getContactRowIndices('alice@x.com', rows)).toEqual([0, 2]);
  });

  test('is case-insensitive', () => {
    expect(_getContactRowIndices('BOB@X.COM', rows)).toEqual([1]);
  });

  test('returns empty array for no match', () => {
    expect(_getContactRowIndices('nobody@x.com', rows)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/auth.test.js
```

Expected: FAIL — `Cannot find module '../Auth.gs'`

- [ ] **Step 3: Create Auth.gs with pure functions + Apps Script wrapper**

```javascript
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
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm test -- tests/auth.test.js
```

Expected: PASS — 7 tests pass

- [ ] **Step 5: Push and commit**

```bash
npm run push
git add Auth.gs tests/auth.test.js
git commit -m "feat: add auth module with global access list and row contact check"
```

---

## Task 4: Data.gs — Row Parsing and SRP Matching

**Files:**
- Create: `Data.gs`
- Create: `tests/data.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/data.test.js
const { parseRow, parseSrpRow, findSrpRow } = require('../Data.gs');

// Minimal row — 47 elements, zeroed out except key fields
function makeRow(overrides) {
  var row = new Array(47).fill('');
  Object.assign(row, overrides);
  return row;
}

describe('parseRow', () => {
  test('maps identity fields correctly', () => {
    var row = makeRow({ 0: 'NC Piedmont', 1: 'Charlotte Area', 5: 'Albemarle Corridor', 8: 'mike@x.com' });
    var result = parseRow(row);
    expect(result.grouping).toBe('NC Piedmont');
    expect(result.cluster).toBe('Charlotte Area');
    expect(result.neighborhood).toBe('Albemarle Corridor');
    expect(result.email).toBe('mike@x.com');
  });

  test('maps activity fields into nested object', () => {
    var row = makeRow({ 17: '3', 18: '28', 19: '24', 29: '98', 30: '163', 31: '148' });
    var result = parseRow(row);
    expect(result.activities.ccs).toEqual({ act: '3', part: '28', fof: '24' });
    expect(result.activities.devotionals).toEqual({ act: '98', part: '163', fof: '148' });
  });

  test('maps assessment fields', () => {
    var row = makeRow({ 39: 'Yes', 40: 'Great support', 43: 'No', 44: '' });
    var result = parseRow(row);
    expect(result.supported).toBe('Yes');
    expect(result.notesSupported).toBe('Great support');
    expect(result.involved).toBe('No');
  });
});

describe('findSrpRow', () => {
  var srpRows = [
    ['Alabama', '1', '3', '3', '1', '8', '8', '1', '8', '1', '4', '3', '19', '12', '1', '3', '3'],
    ['Albemarle Corridor', '3', '28', '24', '5', '28', '27', '9', '26', '23', '18', '17', '82', '74', '3', '28', '24']
  ];

  test('finds row by exact name', () => {
    expect(findSrpRow('Albemarle Corridor', srpRows)[0]).toBe('Albemarle Corridor');
  });

  test('is case-insensitive', () => {
    expect(findSrpRow('albemarle corridor', srpRows)[0]).toBe('Albemarle Corridor');
  });

  test('returns null when not found', () => {
    expect(findSrpRow('Unknown Place', srpRows)).toBeNull();
  });
});

describe('parseSrpRow', () => {
  var row = ['Albemarle Corridor', '3', '28', '24', '5', '28', '27', '9', '26', '23', '18', '17', '82', '74', '3', '28', '24'];

  test('parses activity counts', () => {
    var result = parseSrpRow(row);
    expect(result.ccs).toEqual({ act: '3', part: '28', fof: '24' });
    expect(result.jygs).toEqual({ act: '5', part: '28', fof: '27' });
    expect(result.scs).toEqual({ act: '9', part: '26', fof: '23' });
    expect(result.devotionals).toEqual({ act: '3', part: '28', fof: '24' });
    expect(result.facilitators).toBe('18');
  });

  test('returns null for null input', () => {
    expect(parseSrpRow(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/data.test.js
```

Expected: FAIL — `Cannot find module '../Data.gs'`

- [ ] **Step 3: Create Data.gs with pure parsing functions**

```javascript
// Pure functions — testable
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
      ccs:       { act: row[COL.CC_ACT],       part: row[COL.CC_PART],       fof: row[COL.CC_FOF] },
      jygs:      { act: row[COL.JYG_ACT],      part: row[COL.JYG_PART],      fof: row[COL.JYG_FOF] },
      scs:       { act: row[COL.SC_ACT],       part: row[COL.SC_PART],       fof: row[COL.SC_FOF] },
      totalEd:   { act: row[COL.TOTAL_ED_ACT], part: row[COL.TOTAL_ED_PART], fof: row[COL.TOTAL_ED_FOF] },
      devotionals: { act: row[COL.DEV_ACT],    part: row[COL.DEV_PART],      fof: row[COL.DEV_FOF] },
      totalAll:  { act: row[COL.TOTAL_ACT],    part: row[COL.TOTAL_PART],    fof: row[COL.TOTAL_FOF] }
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
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm test -- tests/data.test.js
```

Expected: PASS — 10 tests pass

- [ ] **Step 5: Push and commit**

```bash
npm run push
git add Data.gs tests/data.test.js
git commit -m "feat: add row and SRP parsing functions"
```

---

## Task 5: Data.gs — Read from Sheets

**Files:**
- Modify: `Data.gs`

Add Apps Script functions that read from both sheets. These call the pure parsing functions from Task 4.

- [ ] **Step 1: Append sheet-reading functions to Data.gs**

Add the following to the bottom of `Data.gs` (above the `module.exports` block):

```javascript
// Apps Script: read all rows from master sheet
function _getAllMasterRows() {
  var ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
  var sheet = ss.getSheetByName(MASTER_TAB);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var numRows = lastRow - MASTER_DATA_ROW + 1;
  if (numRows < 1) return [];
  return sheet.getRange(MASTER_DATA_ROW, 1, numRows, lastCol).getValues();
}

// Apps Script: read all rows from SRP cache sheet
function _getAllSrpRows() {
  var ss = SpreadsheetApp.openById(SRP_SHEET_ID);
  var sheet = ss.getSheetByName(SRP_TAB);
  var lastRow = sheet.getLastRow();
  var numRows = lastRow - SRP_DATA_ROW + 1;
  if (numRows < 1) return [];
  return sheet.getRange(SRP_DATA_ROW, 1, numRows, 17).getValues();
}

// Returns parsed row data + SRP data for a given neighborhood name
function getRowData(neighborhoodName) {
  var masterRows = _getAllMasterRows();
  var masterRow = masterRows.find(function(r) {
    return (r[COL.NEIGHBORHOOD] || '').toLowerCase().trim() ===
           (neighborhoodName || '').toLowerCase().trim();
  });
  if (!masterRow) return null;

  var srpRows = _getAllSrpRows();
  var srpMatch = findSrpRow(neighborhoodName, srpRows);
  var srp = parseSrpRow(srpMatch);

  return {
    row: parseRow(masterRow),
    srp: srp,
    lastUpdatedBy: '',  // placeholder — populated in Task 6 via PropertiesService
    lastUpdatedAt: ''
  };
}
```

- [ ] **Step 2: Push**

```bash
npm run push
```

- [ ] **Step 3: Manual test in Apps Script editor**

Open the script at https://script.google.com → open `Data.gs` → run `getRowData` with test input:

Add a temporary test function, run it, check logs:
```javascript
function _testGetRowData() {
  var result = getRowData('Albemarle Corridor');
  Logger.log(JSON.stringify(result));
}
```

Run `_testGetRowData`. Expected: log shows parsed row with `neighborhood: "Albemarle Corridor"` and SRP data with `ccs: {act: "3", ...}`.

- [ ] **Step 4: Remove test function, push, commit**

```bash
npm run push
git add Data.gs
git commit -m "feat: add sheet-reading functions to Data module"
```

---

## Task 6: Data.gs — Write + Code.gs Server Functions

**Files:**
- Modify: `Data.gs`
- Create: `Code.gs`

- [ ] **Step 1: Add saveRowData to Data.gs**

Append to `Data.gs` (above `module.exports`):

```javascript
function saveRowData(neighborhoodName, formData, userEmail) {
  var ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
  var sheet = ss.getSheetByName(MASTER_TAB);
  var lastRow = sheet.getLastRow();
  var numRows = lastRow - MASTER_DATA_ROW + 1;
  var allRows = sheet.getRange(MASTER_DATA_ROW, 1, numRows, sheet.getLastColumn()).getValues();

  var rowIndex = allRows.findIndex(function(r) {
    return (r[COL.NEIGHBORHOOD] || '').toLowerCase().trim() ===
           (neighborhoodName || '').toLowerCase().trim();
  });
  if (rowIndex === -1) throw new Error('Row not found: ' + neighborhoodName);

  var sheetRow = MASTER_DATA_ROW + rowIndex; // 1-based sheet row
  var updates = buildRowUpdate(formData);

  updates.forEach(function(u) {
    sheet.getRange(sheetRow, u.col + 1).setValue(u.value); // col is 0-based, getRange is 1-based
  });

  // Record last updated metadata
  PropertiesService.getDocumentProperties().setProperties({
    'lastUpdatedBy_' + neighborhoodName: userEmail,
    'lastUpdatedAt_' + neighborhoodName: new Date().toISOString()
  });

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
```

Note: Total Ed and Total Activities columns (26-28, 32-34) are not written — they are computed in the spreadsheet or by the client display only, not saved.

- [ ] **Step 2: Create Code.gs**

```javascript
function doGet() {
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Neighborhood Detail')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Called by client on page load
function getInitialData() {
  var auth = getAuthorizedRows();
  if (auth.role === 'none') {
    return { error: 'Access denied. Your account (' + auth.email + ') is not authorized.' };
  }

  var rows = auth.rows.map(function(r) {
    return {
      neighborhood: r[COL.NEIGHBORHOOD],
      cluster:      r[COL.CLUSTER],
      locality:     r[COL.LOCALITY],
      stage:        r[COL.STAGE]
    };
  });

  return { role: auth.role, rows: rows, email: auth.email };
}

// Called by client when user selects a neighborhood
function getNeighborhoodData(neighborhoodName) {
  var auth = getAuthorizedRows();
  var allowed = auth.role === 'global' || auth.rows.some(function(r) {
    return (r[COL.NEIGHBORHOOD] || '').toLowerCase().trim() ===
           (neighborhoodName || '').toLowerCase().trim();
  });
  if (!allowed) throw new Error('Access denied');

  var data = getRowData(neighborhoodName);
  if (!data) throw new Error('Neighborhood not found: ' + neighborhoodName);

  var props = PropertiesService.getDocumentProperties().getProperties();
  data.lastUpdatedBy = props['lastUpdatedBy_' + neighborhoodName] || '';
  data.lastUpdatedAt = props['lastUpdatedAt_' + neighborhoodName] || '';

  return data;
}

// Called by client on save
function saveNeighborhood(neighborhoodName, formData) {
  var auth = getAuthorizedRows();
  var allowed = auth.role === 'global' || auth.rows.some(function(r) {
    return (r[COL.NEIGHBORHOOD] || '').toLowerCase().trim() ===
           (neighborhoodName || '').toLowerCase().trim();
  });
  if (!allowed) throw new Error('Access denied');
  return saveRowData(neighborhoodName, formData, auth.email);
}
```

- [ ] **Step 3: Push and commit**

```bash
npm run push
git add Data.gs Code.gs
git commit -m "feat: add save function and server entry points"
```

---

## Task 7: Stylesheet.html

**Files:**
- Create: `Stylesheet.html`

- [ ] **Step 1: Create Stylesheet.html**

```html
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f4f8; color: #2d3748; }

  /* Page header */
  .page-header { background: #2c5282; color: white; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
  .page-header h1 { font-size: 17px; font-weight: 700; }
  .page-header .meta { font-size: 12px; opacity: 0.7; margin-top: 2px; }
  .page-header .last-updated { font-size: 11px; opacity: 0.6; margin-top: 2px; }
  .save-btn { background: #48bb78; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .save-btn:disabled { background: #a0aec0; cursor: default; }

  /* Layout */
  .container { max-width: 900px; margin: 20px auto; padding: 0 16px 40px; display: flex; flex-direction: column; gap: 14px; }

  /* Cards */
  .card { background: white; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; }
  .card-header { background: #ebf4ff; border-bottom: 1px solid #bee3f8; padding: 9px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #2b6cb0; display: flex; align-items: center; justify-content: space-between; }
  .srp-badge { font-size: 10px; font-weight: 600; background: #ebf8ff; color: #2b6cb0; border: 1px solid #bee3f8; border-radius: 10px; padding: 2px 8px; text-transform: none; letter-spacing: 0; }
  .card-body { padding: 14px; display: flex; flex-direction: column; gap: 10px; }

  /* Fields */
  .row { display: grid; gap: 10px; }
  .row-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
  .row-3 { grid-template-columns: 1fr 1fr 1fr; }
  .row-2 { grid-template-columns: 1fr 1fr; }
  .field { display: flex; flex-direction: column; gap: 3px; }
  .field label { font-size: 10px; font-weight: 700; color: #718096; text-transform: uppercase; letter-spacing: 0.4px; }
  .field input, .field select, .field textarea { border: 1px solid #cbd5e0; border-radius: 6px; padding: 7px 10px; font-size: 13px; color: #2d3748; background: #fff; font-family: inherit; width: 100%; }
  .field input:focus, .field select:focus, .field textarea:focus { outline: none; border-color: #4299e1; box-shadow: 0 0 0 3px rgba(66,153,225,0.15); }
  .field input.ro { background: #f7fafc; color: #718096; }
  .field textarea { resize: vertical; min-height: 60px; }

  /* Pair fields (# and %) */
  .pair-field { display: flex; flex-direction: column; gap: 3px; }
  .pair-field label { font-size: 10px; font-weight: 700; color: #718096; text-transform: uppercase; letter-spacing: 0.4px; }
  .pair-inputs { display: flex; gap: 6px; }
  .pair-inputs input { border: 1px solid #cbd5e0; border-radius: 6px; padding: 7px 10px; font-size: 13px; color: #2d3748; flex: 1; font-family: inherit; }
  .pair-inputs .pct { max-width: 72px; }

  /* Activity table */
  .act-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .act-table th { background: #f7fafc; border: 1px solid #e2e8f0; padding: 5px 8px; text-align: center; font-size: 10px; font-weight: 700; color: #4a5568; text-transform: uppercase; letter-spacing: 0.3px; }
  .act-table th.left { text-align: left; min-width: 170px; }
  .act-table th.srp-col { color: #a0aec0; font-weight: 600; font-size: 9px; }
  .act-table td { border: 1px solid #e2e8f0; padding: 4px 5px; vertical-align: middle; }
  .act-table td.row-label { font-weight: 600; font-size: 12px; color: #2d3748; padding-left: 10px; }
  .act-table td.srp-cell { background: #f7fafc; text-align: center; font-size: 11px; color: #a0aec0; white-space: nowrap; }
  .act-table td.srp-cell.differs { color: #dd6b20; background: #fffaf0; }
  .act-table td.srp-cell .reset-btn { font-size: 9px; color: #3182ce; background: none; border: none; cursor: pointer; padding: 0 0 0 3px; text-decoration: underline; }
  .act-table tr.total-row td { background: #f0f4f8; }
  .act-table tr.total-row td.row-label { color: #4a5568; }
  .act-table td input { width: 100%; border: 1px solid #cbd5e0; border-radius: 4px; padding: 5px 4px; font-size: 12px; text-align: center; background: #fff; }
  .act-table td input:focus { outline: none; border-color: #4299e1; background: #ebf8ff; }
  .act-table td input.overridden { border-color: #f6ad55; background: #fffaf0; }
  .act-table td input.plain { border: none; background: #f7fafc; color: #4a5568; }

  /* SRP reference line */
  .srp-ref { font-size: 11px; color: #a0aec0; background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; }
  .srp-ref strong { color: #718096; }

  /* Sync note */
  .sync-note { font-size: 11px; color: #718096; background: #f7fafc; border-radius: 6px; padding: 7px 12px; border: 1px solid #e2e8f0; }

  /* Divider */
  .divider { height: 1px; background: #e2e8f0; margin: 2px 0; }

  /* Additional details */
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .detail-item { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
  .detail-item .q { font-weight: 700; font-size: 13px; margin-bottom: 7px; }
  .toggle-row { display: flex; gap: 6px; margin-bottom: 8px; }
  .tb { padding: 4px 14px; border-radius: 20px; border: 1px solid #cbd5e0; background: white; font-size: 12px; cursor: pointer; color: #718096; }
  .tb.yes { background: #c6f6d5; border-color: #9ae6b4; color: #276749; font-weight: 700; }
  .tb.no { background: #fed7d7; border-color: #feb2b2; color: #9b2c2c; font-weight: 700; }
  .detail-item textarea { width: 100%; border: 1px solid #cbd5e0; border-radius: 6px; padding: 7px 9px; font-size: 12px; font-family: inherit; resize: vertical; min-height: 52px; }

  /* Picker */
  .picker-container { max-width: 600px; margin: 40px auto; padding: 0 16px; }
  .picker-title { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
  .picker-sub { font-size: 13px; color: #718096; margin-bottom: 20px; }
  .picker-item { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; }
  .picker-item:hover { border-color: #4299e1; background: #ebf8ff; }
  .picker-item .name { font-weight: 600; font-size: 14px; }
  .picker-item .sub { font-size: 12px; color: #718096; margin-top: 2px; }
  .stage-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; background: #c6f6d5; color: #276749; }

  /* States */
  .error-state { text-align: center; padding: 60px 20px; color: #e53e3e; }
  .loading-state { text-align: center; padding: 60px 20px; color: #718096; }
  #picker-view, #detail-view { display: none; }

  /* Footer */
  .footer { background: white; border-top: 1px solid #e2e8f0; padding: 12px 24px; display: flex; justify-content: flex-end; gap: 8px; position: sticky; bottom: 0; }
  .btn-cancel { padding: 7px 16px; border-radius: 6px; border: 1px solid #cbd5e0; background: white; font-size: 13px; cursor: pointer; color: #4a5568; }
  .btn-save { padding: 7px 22px; border-radius: 6px; border: none; background: #3182ce; color: white; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-save:disabled { background: #a0aec0; cursor: default; }

  .save-status { font-size: 12px; color: #718096; align-self: center; margin-right: auto; }
  .save-status.error { color: #e53e3e; }
  .save-status.success { color: #38a169; }
</style>
```

- [ ] **Step 2: Push and commit**

```bash
npm run push
git add Stylesheet.html
git commit -m "feat: add stylesheet"
```

---

## Task 8: Index.html Shell

**Files:**
- Create: `Index.html`

- [ ] **Step 1: Create Index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Neighborhood Detail</title>
  <?!= include('Stylesheet'); ?>
</head>
<body>

  <div id="loading-state" class="loading-state">Loading...</div>
  <div id="error-state" class="error-state" style="display:none"></div>

  <!-- Row picker (shown when user has access to multiple rows) -->
  <div id="picker-view">
    <div class="picker-container">
      <div class="picker-title">My Neighborhoods</div>
      <div class="picker-sub" id="picker-email"></div>
      <div id="picker-list"></div>
    </div>
  </div>

  <!-- Detail view (shown after row is selected) -->
  <div id="detail-view">
    <div class="page-header">
      <div>
        <h1 id="header-name"></h1>
        <div class="meta" id="header-meta"></div>
        <div class="last-updated" id="header-updated"></div>
      </div>
      <button class="save-btn" id="save-btn" onclick="handleSave()">Save to spreadsheet</button>
    </div>

    <div class="container" id="form-container"></div>

    <div class="footer">
      <span class="save-status" id="save-status"></span>
      <button class="btn-cancel" onclick="handleDiscard()">Discard changes</button>
      <button class="btn-save" id="save-btn-footer" onclick="handleSave()">Save to spreadsheet</button>
    </div>
  </div>

  <?!= include('JavaScript'); ?>
</body>
</html>
```

- [ ] **Step 2: Push and commit**

```bash
npm run push
git add Index.html
git commit -m "feat: add Index.html shell with picker and detail placeholders"
```

---

## Task 9: JavaScript.html — Init, Picker, and Navigation

**Files:**
- Create: `JavaScript.html`

- [ ] **Step 1: Create JavaScript.html with init and picker logic**

```html
<script>
// ── State ────────────────────────────────────────────────────────────────────
var appState = {
  role: null,
  email: null,
  allRows: [],          // summary list from getInitialData
  currentNeighborhood: null,  // full data from getNeighborhoodData
  srp: null,
  isDirty: false
};

// ── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener('load', function() {
  google.script.run
    .withSuccessHandler(onInitialData)
    .withFailureHandler(onError)
    .getInitialData();
});

function onInitialData(data) {
  document.getElementById('loading-state').style.display = 'none';

  if (data.error) {
    showError(data.error);
    return;
  }

  appState.role = data.role;
  appState.email = data.email;
  appState.allRows = data.rows;

  if (data.rows.length === 1) {
    loadNeighborhood(data.rows[0].neighborhood);
  } else {
    showPicker(data.rows, data.email);
  }
}

function onError(err) {
  showError(err.message || String(err));
}

function showError(msg) {
  document.getElementById('loading-state').style.display = 'none';
  var el = document.getElementById('error-state');
  el.textContent = msg;
  el.style.display = 'block';
}

// ── Picker ───────────────────────────────────────────────────────────────────
function showPicker(rows, email) {
  document.getElementById('picker-email').textContent = email;
  var list = document.getElementById('picker-list');
  list.innerHTML = '';
  rows.forEach(function(r) {
    var item = document.createElement('div');
    item.className = 'picker-item';
    item.innerHTML =
      '<div>' +
      '  <div class="name">' + esc(r.neighborhood) + '</div>' +
      '  <div class="sub">' + esc(r.cluster) + ' · ' + esc(r.locality) + '</div>' +
      '</div>' +
      '<span class="stage-badge">' + esc(r.stage || '') + '</span>';
    item.onclick = function() { loadNeighborhood(r.neighborhood); };
    list.appendChild(item);
  });
  document.getElementById('picker-view').style.display = 'block';
}

// ── Load neighborhood ─────────────────────────────────────────────────────────
function loadNeighborhood(name) {
  document.getElementById('picker-view').style.display = 'none';
  document.getElementById('loading-state').style.display = 'block';
  document.getElementById('loading-state').textContent = 'Loading ' + name + '...';

  google.script.run
    .withSuccessHandler(function(data) {
      document.getElementById('loading-state').style.display = 'none';
      appState.currentNeighborhood = data.row;
      appState.srp = data.srp;
      renderDetail(data);
      document.getElementById('detail-view').style.display = 'block';
    })
    .withFailureHandler(onError)
    .getNeighborhoodData(name);
}

// ── Discard ───────────────────────────────────────────────────────────────────
function handleDiscard() {
  if (appState.isDirty && !confirm('Discard all unsaved changes?')) return;
  appState.isDirty = false;
  loadNeighborhood(appState.currentNeighborhood.neighborhood);
}

// ── Utility ───────────────────────────────────────────────────────────────────
function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function val(id) {
  var el = document.getElementById(id);
  return el ? el.value : '';
}

function setDirty() {
  appState.isDirty = true;
}

// Placeholder — filled in subsequent tasks
function renderDetail(data) {}
function handleSave() {}
</script>
```

- [ ] **Step 2: Push and commit**

```bash
npm run push
git add JavaScript.html
git commit -m "feat: add init, picker, and navigation logic"
```

---

## Task 10: JavaScript.html — Render Detail Form (Identity + Population)

**Files:**
- Modify: `JavaScript.html`

Replace the `renderDetail` placeholder with the full render function built incrementally across Tasks 10–12.

- [ ] **Step 1: Replace renderDetail in JavaScript.html with Identity + Population sections**

Replace `function renderDetail(data) {}` with:

```javascript
function renderDetail(data) {
  var r = data.row;

  // Update page header
  document.getElementById('header-name').textContent = r.neighborhood;
  document.getElementById('header-meta').textContent =
    r.cluster + ' · ' + r.clusterCode + ' · ' + r.locality;
  document.getElementById('header-updated').textContent =
    data.lastUpdatedAt
      ? 'Last saved by ' + data.lastUpdatedBy + ' on ' + new Date(data.lastUpdatedAt).toLocaleString()
      : '';

  var html = '';

  // ── Identity ────────────────────────────────────────────────────────────────
  html += '<div class="card">';
  html += '<div class="card-header">Identity</div>';
  html += '<div class="card-body">';
  html += '<div class="row row-4">';
  html += field('Grouping',     'f-grouping',      r.grouping,     true);
  html += field('Cluster Code', 'f-clusterCode',   r.clusterCode,  true);
  html += field('Cluster',      'f-cluster',       r.cluster,      true);
  html += field('PG',           'f-pg',            r.pg,           true);
  html += '</div>';
  html += '<div class="row row-3">';
  html += field('Locality',               'f-locality',  r.locality);
  html += field('Neighborhood & Pocket',  'f-neighborhood', r.neighborhood);
  html += selectField('Neighborhood Stage', 'f-stage', r.stage, [
    'Emerging Activity', 'Growing Activity', 'Intense Activity (18+ activities)'
  ]);
  html += '</div>';
  html += '<div class="row row-3">';
  html += field('Neighborhood Contact',    'f-contact',  r.contact);
  html += field('Contact Email',           'f-email',    r.email,   false, 'email');
  html += field('Auxiliary Board Member(s)', 'f-auxBoard', r.auxBoard);
  html += '</div>';
  html += '</div></div>';

  // ── Population ─────────────────────────────────────────────────────────────
  html += '<div class="card">';
  html += '<div class="card-header">Population</div>';
  html += '<div class="card-body">';
  html += '<div class="row row-2">';
  html += field('Total Population',  'f-totalPop', r.totalPop);
  html += field('Total Households',  'f-totalHH',  r.totalHH);
  html += '</div>';
  html += '<div class="row row-2">';
  html += pairField('Individuals Connected', 'f-indNum',  r.indNum,  'f-indPct',  r.indPct);
  html += pairField('Households Connected',  'f-hhNum',   r.hhNum,   'f-hhPct',   r.hhPct);
  html += '</div>';
  html += '<div class="field">';
  html += '<label>Makeup of Population</label>';
  html += '<textarea id="f-makeup" onchange="setDirty()">' + esc(r.makeup) + '</textarea>';
  html += '</div>';
  html += '</div></div>';

  document.getElementById('form-container').innerHTML = html;
  attachChangeListeners();
}

// ── Field builders ────────────────────────────────────────────────────────────
function field(label, id, value, readonly, type) {
  var roClass = readonly ? ' class="ro"' : '';
  var roAttr  = readonly ? ' readonly'   : '';
  var t = type || 'text';
  return '<div class="field"><label>' + label + '</label>' +
    '<input type="' + t + '" id="' + id + '" value="' + esc(value) + '"' + roClass + roAttr + ' onchange="setDirty()"></div>';
}

function selectField(label, id, value, options) {
  var opts = options.map(function(o) {
    return '<option' + (o === value ? ' selected' : '') + '>' + esc(o) + '</option>';
  }).join('');
  return '<div class="field"><label>' + label + '</label>' +
    '<select id="' + id + '" onchange="setDirty()">' + opts + '</select></div>';
}

function pairField(label, idNum, valNum, idPct, valPct) {
  return '<div class="pair-field"><label>' + label + '</label>' +
    '<div class="pair-inputs">' +
    '<input type="text" id="' + idNum + '" value="' + esc(valNum) + '" placeholder="#" onchange="setDirty()">' +
    '<input type="text" id="' + idPct + '" value="' + esc(valPct) + '" placeholder="%" class="pct" onchange="setDirty()">' +
    '</div></div>';
}

function attachChangeListeners() {
  // already handled by inline onchange="setDirty()"
}
```

- [ ] **Step 2: Push**

```bash
npm run push
```

- [ ] **Step 3: Manual test — open the web app**

In the Apps Script editor: Deploy → Test deployments → open the web app URL.
Expected: Identity and Population sections render with Albemarle Corridor data (if your email is in GlobalAccess or is the Contact Email for that row).

- [ ] **Step 4: Commit**

```bash
git add JavaScript.html
git commit -m "feat: render Identity and Population sections"
```

---

## Task 11: JavaScript.html — Activities Section with SRP Conflict

**Files:**
- Modify: `JavaScript.html`

- [ ] **Step 1: Add activities section to renderDetail, after the Population card**

Inside `renderDetail`, append after the Population card HTML and before `document.getElementById('form-container').innerHTML = html`:

```javascript
  // ── Activities ─────────────────────────────────────────────────────────────
  var srp = data.srp;
  var srpDate = srp ? 'SRP synced' : 'No SRP data';
  html += '<div class="card">';
  html += '<div class="card-header">Educational Activities &amp; Devotionals';
  html += '<span class="srp-badge">' + srpDate + '</span></div>';
  html += '<div class="card-body">';
  html += '<div class="sync-note">Numbers pre-filled from SRP where available. ' +
          'Edit any value to override — overridden values are highlighted amber with the SRP figure shown for reference.</div>';
  html += '<table class="act-table">';
  html += '<thead><tr>' +
    '<th class="left">Activity</th>' +
    '<th>Active</th><th>Participants</th><th>Friends of the Faith</th>' +
    '<th class="srp-col">SRP</th>' +
    '</tr></thead><tbody>';

  var acts = r.activities;
  var srpActs = srp || {};

  html += actRow('Children\'s Classes (CCs)', 'ccs',
    acts.ccs, srpActs.ccs);
  html += actRow('Junior Youth Groups (JYGs)', 'jygs',
    acts.jygs, srpActs.jygs);
  html += actRow('Study Circles (SCs)', 'scs',
    acts.scs, srpActs.scs);
  html += totalRow('Total Educational Activities',
    computeTotal([acts.ccs, acts.jygs, acts.scs]));
  html += actRow('Devotionals', 'devotionals',
    acts.devotionals, srpActs.devotionals);
  html += totalRow('Total Activities',
    computeTotal([acts.ccs, acts.jygs, acts.scs, acts.devotionals]));

  html += '</tbody></table>';
  html += '</div></div>';
```

- [ ] **Step 2: Add actRow, totalRow, computeTotal helper functions**

Add these after the `pairField` function:

```javascript
function actRow(label, key, userVals, srpVals) {
  var actId  = 'f-' + key + '-act';
  var partId = 'f-' + key + '-part';
  var fofId  = 'f-' + key + '-fof';

  var uAct  = userVals ? (userVals.act  || '') : '';
  var uPart = userVals ? (userVals.part || '') : '';
  var uFof  = userVals ? (userVals.fof  || '') : '';

  var sAct  = srpVals ? (srpVals.act  || '') : null;
  var sPart = srpVals ? (srpVals.part || '') : null;
  var sFof  = srpVals ? (srpVals.fof  || '') : null;

  var actDiffers  = sAct  !== null && String(uAct).trim()  !== String(sAct).trim();
  var partDiffers = sPart !== null && String(uPart).trim() !== String(sPart).trim();
  var fofDiffers  = sFof  !== null && String(uFof).trim()  !== String(sFof).trim();
  var anyDiffers  = actDiffers || partDiffers || fofDiffers;

  var srpText = sAct !== null
    ? sAct + ' / ' + sPart + ' / ' + sFof
    : 'not in SRP';

  var row = '<tr>';
  row += '<td class="row-label">' + label + '</td>';
  row += actCell(actId,  uAct,  actDiffers,  key, 'act');
  row += actCell(partId, uPart, partDiffers, key, 'part');
  row += actCell(fofId,  uFof,  fofDiffers,  key, 'fof');
  row += '<td class="srp-cell' + (anyDiffers ? ' differs' : '') + '">' + srpText;
  if (anyDiffers) {
    row += ' <button class="reset-btn" onclick="resetToSrp(\'' + key + '\')">' +
           'reset</button>';
  }
  row += '</td>';
  row += '</tr>';
  return row;
}

function actCell(id, value, differs, key, field) {
  var cls = differs ? ' class="overridden"' : '';
  return '<td><input type="number" id="' + id + '" value="' + esc(value) + '"' +
    cls + ' onchange="setDirty(); updateTotals()">' +
    '</td>';
}

function totalRow(label, totals) {
  return '<tr class="total-row">' +
    '<td class="row-label">' + label + '</td>' +
    '<td><input class="plain" type="number" id="total-' + slugify(label) + '-act"  value="' + totals.act  + '" readonly></td>' +
    '<td><input class="plain" type="number" id="total-' + slugify(label) + '-part" value="' + totals.part + '" readonly></td>' +
    '<td><input class="plain" type="number" id="total-' + slugify(label) + '-fof"  value="' + totals.fof  + '" readonly></td>' +
    '<td class="srp-cell">—</td>' +
    '</tr>';
}

function computeTotal(actsList) {
  return actsList.reduce(function(acc, a) {
    acc.act  += parseInt(a && a.act  || 0, 10);
    acc.part += parseInt(a && a.part || 0, 10);
    acc.fof  += parseInt(a && a.fof  || 0, 10);
    return acc;
  }, { act: 0, part: 0, fof: 0 });
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function updateTotals() {
  var r = appState.currentNeighborhood;
  var edTotal = computeTotalFromInputs(['ccs', 'jygs', 'scs']);
  setTotalInputs('total-educational-activities', edTotal);
  var allTotal = computeTotalFromInputs(['ccs', 'jygs', 'scs', 'devotionals']);
  setTotalInputs('total-activities', allTotal);
}

function computeTotalFromInputs(keys) {
  return keys.reduce(function(acc, key) {
    acc.act  += parseInt(document.getElementById('f-' + key + '-act')  && document.getElementById('f-' + key + '-act').value  || 0, 10);
    acc.part += parseInt(document.getElementById('f-' + key + '-part') && document.getElementById('f-' + key + '-part').value || 0, 10);
    acc.fof  += parseInt(document.getElementById('f-' + key + '-fof')  && document.getElementById('f-' + key + '-fof').value  || 0, 10);
    return acc;
  }, { act: 0, part: 0, fof: 0 });
}

function setTotalInputs(prefix, totals) {
  var actEl  = document.getElementById(prefix + '-act');
  var partEl = document.getElementById(prefix + '-part');
  var fofEl  = document.getElementById(prefix + '-fof');
  if (actEl)  actEl.value  = totals.act;
  if (partEl) partEl.value = totals.part;
  if (fofEl)  fofEl.value  = totals.fof;
}

function resetToSrp(key) {
  var srp = appState.srp;
  if (!srp || !srp[key]) return;
  document.getElementById('f-' + key + '-act').value  = srp[key].act  || '';
  document.getElementById('f-' + key + '-part').value = srp[key].part || '';
  document.getElementById('f-' + key + '-fof').value  = srp[key].fof  || '';
  updateTotals();
  setDirty();
  // Re-render to clear overridden highlights — easiest is to reload the detail
  // with current state (a full re-render would be cleaner in v2)
  var el = document.getElementById('f-' + key + '-act');
  if (el) el.classList.remove('overridden');
}
```

- [ ] **Step 3: Push**

```bash
npm run push
```

- [ ] **Step 4: Manual test**

Open the web app. Expected: Activities section shows with SRP column. Devotionals row should show as overridden (amber) if sheet values differ from SRP. Click "reset" on Devotionals — values should revert to SRP figures.

- [ ] **Step 5: Commit**

```bash
git add JavaScript.html
git commit -m "feat: render activities section with SRP conflict indicators"
```

---

## Task 12: JavaScript.html — Workers, Prevalence, Additional Details

**Files:**
- Modify: `JavaScript.html`

- [ ] **Step 1: Append Workers and Additional Details to renderDetail**

Inside `renderDetail`, after the activities card and before `document.getElementById('form-container').innerHTML = html`:

```javascript
  // ── Workers & Prevalence ──────────────────────────────────────────────────
  html += '<div class="card">';
  html += '<div class="card-header">Workers &amp; Prevalence</div>';
  html += '<div class="card-body">';
  html += '<div class="row row-2">';
  html += field('Protagonists / Workers',    'f-protagonists', r.protagonists);
  html += field('Accompaniers in Nucleus',   'f-accompaniers', r.accompaniers);
  html += '</div>';
  if (srp && srp.facilitators) {
    html += '<div class="srp-ref">SRP Facilitators (different measure): <strong>' +
            esc(srp.facilitators) + '</strong></div>';
  }
  html += '<div class="divider"></div>';
  html += '<div class="field"><label>Prevalence Level</label>' +
          '<input type="text" id="f-level" value="' + esc(r.level) + '" onchange="setDirty()"></div>';
  html += '<div class="field"><label>Notes</label>' +
          '<textarea id="f-notesPrevalence" onchange="setDirty()">' + esc(r.notesPrevalence) + '</textarea></div>';
  html += '</div></div>';

  // ── Additional Details ────────────────────────────────────────────────────
  html += '<div class="card">';
  html += '<div class="card-header">Additional Details</div>';
  html += '<div class="card-body"><div class="detail-grid">';
  html += detailItem('Assembly Support',                'supported',    r.supported,    r.notesSupported);
  html += detailItem('Social Action Presence',          'presence',     r.presence,     r.notesPresence);
  html += detailItem('Local Leaders Involved',          'involved',     r.involved,     r.notesInvolved);
  html += detailItem('Specific Efforts for Spiritual Health', 'efforts', r.efforts,     r.notesEfforts);
  html += '</div></div></div>';
```

- [ ] **Step 2: Add detailItem helper**

```javascript
function detailItem(label, key, yesNoVal, notesVal) {
  var isYes = (yesNoVal || '').toLowerCase() === 'yes';
  var isNo  = (yesNoVal || '').toLowerCase() === 'no';
  return '<div class="detail-item">' +
    '<div class="q">' + label + '</div>' +
    '<div class="toggle-row">' +
    '<button id="tb-' + key + '-yes" class="tb' + (isYes ? ' yes' : '') + '" onclick="setToggle(\'' + key + '\', \'Yes\')">' +
    'Yes</button>' +
    '<button id="tb-' + key + '-no" class="tb' + (isNo ? ' no' : '') + '" onclick="setToggle(\'' + key + '\', \'No\')">' +
    'No</button>' +
    '</div>' +
    '<textarea id="f-notes-' + key + '" onchange="setDirty()">' + esc(notesVal) + '</textarea>' +
    '</div>';
}

function setToggle(key, value) {
  var yesBtn = document.getElementById('tb-' + key + '-yes');
  var noBtn  = document.getElementById('tb-' + key + '-no');
  if (value === 'Yes') {
    yesBtn.className = 'tb yes';
    noBtn.className  = 'tb';
  } else {
    yesBtn.className = 'tb';
    noBtn.className  = 'tb no';
  }
  setDirty();
}

function getToggleValue(key) {
  var yesBtn = document.getElementById('tb-' + key + '-yes');
  if (!yesBtn) return '';
  return yesBtn.classList.contains('yes') ? 'Yes' : (
    document.getElementById('tb-' + key + '-no').classList.contains('no') ? 'No' : ''
  );
}
```

- [ ] **Step 3: Push and manual test**

```bash
npm run push
```

Open the web app. Expected: full form renders with all sections. Yes/No toggles respond to clicks.

- [ ] **Step 4: Commit**

```bash
git add JavaScript.html
git commit -m "feat: render Workers, Prevalence, and Additional Details sections"
```

---

## Task 13: JavaScript.html — Save Flow

**Files:**
- Modify: `JavaScript.html`

- [ ] **Step 1: Replace handleSave placeholder**

Replace `function handleSave() {}` with:

```javascript
function handleSave() {
  var statusEl = document.getElementById('save-status');
  var saveBtns = [document.getElementById('save-btn'), document.getElementById('save-btn-footer')];

  statusEl.textContent = 'Saving...';
  statusEl.className = 'save-status';
  saveBtns.forEach(function(b) { if (b) b.disabled = true; });

  var formData = collectFormData();
  var name = appState.currentNeighborhood.neighborhood;

  google.script.run
    .withSuccessHandler(function(result) {
      appState.isDirty = false;
      statusEl.textContent = 'Saved successfully';
      statusEl.className = 'save-status success';
      saveBtns.forEach(function(b) { if (b) b.disabled = false; });
      // Refresh last-updated line
      var now = new Date().toLocaleString();
      document.getElementById('header-updated').textContent =
        'Last saved by ' + appState.email + ' on ' + now;
    })
    .withFailureHandler(function(err) {
      statusEl.textContent = 'Save failed: ' + (err.message || err);
      statusEl.className = 'save-status error';
      saveBtns.forEach(function(b) { if (b) b.disabled = false; });
    })
    .saveNeighborhood(name, formData);
}

function collectFormData() {
  return {
    locality:    val('f-locality'),
    stage:       val('f-stage'),
    contact:     val('f-contact'),
    email:       val('f-email'),
    auxBoard:    val('f-auxBoard'),
    makeup:      val('f-makeup'),
    totalPop:    val('f-totalPop'),
    totalHH:     val('f-totalHH'),
    indNum:      val('f-indNum'),
    indPct:      val('f-indPct'),
    hhNum:       val('f-hhNum'),
    hhPct:       val('f-hhPct'),
    activities: {
      ccs:         { act: val('f-ccs-act'),         part: val('f-ccs-part'),         fof: val('f-ccs-fof') },
      jygs:        { act: val('f-jygs-act'),        part: val('f-jygs-part'),        fof: val('f-jygs-fof') },
      scs:         { act: val('f-scs-act'),         part: val('f-scs-part'),         fof: val('f-scs-fof') },
      devotionals: { act: val('f-devotionals-act'), part: val('f-devotionals-part'), fof: val('f-devotionals-fof') }
    },
    protagonists:    val('f-protagonists'),
    accompaniers:    val('f-accompaniers'),
    level:           val('f-level'),
    notesPrevalence: val('f-notesPrevalence'),
    supported:       getToggleValue('supported'),
    notesSupported:  val('f-notes-supported'),
    presence:        getToggleValue('presence'),
    notesPresence:   val('f-notes-presence'),
    involved:        getToggleValue('involved'),
    notesInvolved:   val('f-notes-involved'),
    efforts:         getToggleValue('efforts'),
    notesEfforts:    val('f-notes-efforts')
  };
}
```

- [ ] **Step 2: Push**

```bash
npm run push
```

- [ ] **Step 3: Manual test — full save flow**

Open the web app → load Albemarle Corridor → change a value (e.g., edit the Notes field) → click "Save to spreadsheet".
Expected: status shows "Saving..." then "Saved successfully". Open the master sheet and confirm the value changed in the correct row/column.

- [ ] **Step 4: Commit**

```bash
git add JavaScript.html
git commit -m "feat: add save flow — collect form data and write to spreadsheet"
```

---

## Task 14: Picker — Multi-Row Flow

**Files:**
- Modify: `JavaScript.html`

This tests the flow for a global access user who sees multiple rows.

- [ ] **Step 1: Add your email to GlobalAccess tab if not already there**

Open the master sheet → `GlobalAccess` tab → confirm your email is in A1.

- [ ] **Step 2: Manual test — picker flow**

Open the web app. Since your email is in GlobalAccess, you should see a list of all neighborhoods.
Expected: picker shows all neighborhoods; clicking one loads its detail form.

- [ ] **Step 3: Test row contact flow**

Temporarily add a second email to `GlobalAccess` that doesn't match any Contact Email, then log in as that user.
Expected: "Access denied" error.

Remove that test email afterward.

- [ ] **Step 4: Commit (no code changes — just verifying)**

```bash
git commit --allow-empty -m "test: verify picker and access-denied flows manually"
```

---

## Task 15: Deploy as Web App

**Files:**
- No code changes — deployment steps only

- [ ] **Step 1: Deploy from Apps Script editor**

In the Apps Script editor: click Deploy → New deployment → type: Web App.
- Execute as: **User accessing the web app**
- Who has access: **Anyone with a Google Account**

Click Deploy. Copy the web app URL.

- [ ] **Step 2: Share sheets with users**

For each person who will use the app:
- Share the master sheet (`1FwM4TLET45DibGyAljN-jyj6CJsXK-4rZuokliCwA44`) as **Viewer** (not Editor — the app handles writes via the service account's credentials through Apps Script)
- OR: grant access through the Apps Script project itself

Note: Because `executeAs: USER_ACCESSING`, the script runs as each user. Each user must have at least Viewer access to both spreadsheets, or the sheets must be accessible to anyone with the link. Simplest setup: share both sheets as "Anyone with the link can view" and manage edit permissions through the GlobalAccess tab and Contact Email column.

- [ ] **Step 3: End-to-end test**

Open the deployed URL in a browser where you're signed in as a test user.
- [ ] Picker shows if you have global access (multiple rows) or goes straight to the row if contact email matches one row
- [ ] All form sections render with correct data
- [ ] Activities section shows SRP values; Devotionals row is amber if it differs
- [ ] Edit a Notes field and save → confirm change appears in master sheet
- [ ] Click "reset" on an overridden activity → value reverts to SRP figure

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: neighborhood row detail app — complete"
```

---

## Self-Review

**Spec coverage:**
- ✅ Two-tier auth (GlobalAccess tab + Contact Email)
- ✅ Row picker for multi-row users
- ✅ All form sections: Identity, Population, Activities, Workers/Prevalence, Additional Details
- ✅ SRP pre-fill with conflict indicators and reset
- ✅ Save writes only editable columns (not calculated totals, not SRP cache)
- ✅ Last-updated metadata via PropertiesService
- ✅ Read-only fields: Grouping, Cluster Code, Cluster, PG
- ✅ SRP Facilitators shown as reference, not conflated with Protagonists/Workers
- ✅ Column mapping by index (not name)

**Out of scope (confirmed):**
- SRP sync script
- Cluster-scoped coordinator permissions
- Click-through to individual lists
