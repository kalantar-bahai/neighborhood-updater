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
