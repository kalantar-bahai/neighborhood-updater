function doGet() {
  try {
    return HtmlService
      .createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Neighborhood Detail')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch(e) {
    return HtmlService.createHtmlOutput('<pre>Error: ' + e.message + '\n' + e.stack + '</pre>');
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getInitialData() {
  var auth = getAuthorizedRows();
  if (auth.role === 'none') {
    return { error: 'Access denied. Your account (' + auth.email + ') is not authorized.' };
  }

  var rows = auth.rows
    .filter(function(r) { return (r[COL.NEIGHBORHOOD] || '').trim() !== ''; })
    .map(function(r) {
      return {
        neighborhood:       r[COL.NEIGHBORHOOD],
        parentNeighborhood: r[COL.PARENT_NEIGHBORHOOD],
        grouping:           r[COL.GROUPING],
        cluster:            r[COL.CLUSTER],
        locality:           r[COL.LOCALITY],
        stage:              r[COL.STAGE]
      };
    });

  var srpNames = _getAllDevRows().map(function(r) {
    return (r[DEV_COL.NAME] || '').toLowerCase().trim();
  });

  return { role: auth.role, rows: rows, email: auth.email, srpNames: srpNames };
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

  var props = PropertiesService.getScriptProperties().getProperties();
  data.lastUpdatedBy = props['lastUpdatedBy_' + neighborhoodName] || '';
  data.lastUpdatedAt = props['lastUpdatedAt_' + neighborhoodName] || '';

  return data;
}

function saveNeighborhood(neighborhoodName, formData) {
  var auth = getAuthorizedRows();
  var allowed = auth.role === 'global' || auth.rows.some(function(r) {
    return (r[COL.NEIGHBORHOOD] || '').toLowerCase().trim() ===
           (neighborhoodName || '').toLowerCase().trim();
  });
  if (!allowed) throw new Error('Access denied');
  return saveRowData(neighborhoodName, formData, auth.email);
}
