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
