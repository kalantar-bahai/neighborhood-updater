# srp-cache/tests/test_locality_summary.py
import datetime
import io

import openpyxl
import pytest

from locality_summary import validate_columns, parse_row, parse_date, should_append, extract_headers

# Minimal synthetic columns — tests do not depend on real SRP schema.
# Matches CRITICAL CORRECTIONS: 5 identity cols + 2 data cols = 7 total.
COLS = ['A', 'B', 'C', 'D', 'Date as of', 'X', 'Y']
ROW  = ['v1', 'v2', 'v3', 'v4', '5/3/26', '10', '20']


def _make_xlsx(row1_headers, row3_leaf_headers, data_row):
    """Build a minimal xlsx with 3 header rows + 1 data row.

    Row 1: row1_headers (identity cols + section labels)
    Row 2: blank (sub-section row, not used in tests)
    Row 3: row3_leaf_headers (leaf column headers)
    Row 4: data_row
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(row1_headers)
    ws.append([None] * len(row1_headers))   # Row 2 — blank sub-section row
    ws.append(row3_leaf_headers)
    ws.append(data_row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── validate_columns ──────────────────────────────────────────────────────────

def test_validate_columns_exact_match():
    assert validate_columns(COLS, COLS) is None


def test_validate_columns_length_mismatch():
    # Actual is one shorter than expected — positional check should report count
    result = validate_columns(COLS[:-1], COLS)
    assert result is not None
    assert str(len(COLS)) in result      # expected count in message
    assert str(len(COLS) - 1) in result  # actual count in message


def test_validate_columns_column_name_change_at_index():
    # Same length but one column name differs at a known index
    wrong = list(COLS)
    wrong[5] = 'WRONG'
    result = validate_columns(wrong, COLS)
    assert result is not None
    assert 'Col 5' in result
    assert 'WRONG' in result
    assert 'X' in result   # expected value reported


def test_validate_columns_repeated_names_positional():
    # Columns with repeated names must be compared positionally, not as sets.
    # ['No.', 'Att.', 'No.', 'Att.'] is different ordering from ['Att.', 'No.', 'Att.', 'No.']
    ordered   = ['No.', 'Att.', 'No.', 'Att.']
    reordered = ['Att.', 'No.', 'Att.', 'No.']
    result = validate_columns(reordered, ordered)
    assert result is not None
    # Set-based comparison would consider these equal; positional should catch diffs
    assert 'Col 0' in result or 'Col 1' in result


# ── extract_headers ───────────────────────────────────────────────────────────

def test_extract_headers_returns_72_column_combined_list():
    # Row 1 provides first 5 columns; Row 3 provides columns 5 onward.
    row1 = ['Locality', 'Cluster', 'Region', 'National Community', 'Date as of',
             'Table 1 Section', None, None]
    row3 = [None, None, None, None, None, 'Book 1', 'Book 2', 'Book 3']
    data = ['v1', 'v2', 'v3', 'v4', '5/3/26', '10', '20', '30']
    xlsx = _make_xlsx(row1, row3, data)
    headers = extract_headers(xlsx)
    # First 5 from row1
    assert headers[:5] == ['Locality', 'Cluster', 'Region', 'National Community', 'Date as of']
    # Columns 5+ from row3
    assert headers[5:] == ['Book 1', 'Book 2', 'Book 3']


# ── parse_row ─────────────────────────────────────────────────────────────────

def test_parse_row_returns_data_values():
    # Excel has 3 header rows; data is at rows[3] (0-indexed row 4).
    xlsx = _make_xlsx(COLS, COLS, ROW)
    assert parse_row(xlsx) == ROW


def test_parse_row_converts_none_to_empty_string():
    row_with_none = ROW[:5] + [None] + ROW[6:]
    xlsx = _make_xlsx(COLS, COLS, row_with_none)
    result = parse_row(xlsx)
    assert result[5] == ''


# ── parse_date ────────────────────────────────────────────────────────────────

def test_parse_date_single_digit_day():
    assert parse_date('5/3/26') == datetime.date(2026, 5, 3)


def test_parse_date_double_digit_month_and_day():
    assert parse_date('11/9/25') == datetime.date(2025, 11, 9)


def test_parse_date_datetime_object():
    # openpyxl returns the "Date as of" cell as a datetime.datetime; parse_date must handle it.
    dt = datetime.datetime(2026, 6, 24, 0, 0)
    assert parse_date(dt) == datetime.date(2026, 6, 24)


def test_parse_date_date_object():
    d = datetime.date(2026, 5, 3)
    assert parse_date(d) == datetime.date(2026, 5, 3)


# ── should_append ─────────────────────────────────────────────────────────────

def test_should_append_same_date_returns_false():
    assert should_append('5/3/26', '5/3/26') is False


def test_should_append_newer_date_returns_true():
    assert should_append('5/3/26', '8/1/26') is True


def test_should_append_no_existing_data_returns_true():
    assert should_append(None, '5/3/26') is True
