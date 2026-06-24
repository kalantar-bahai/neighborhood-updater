"""
Scrapes the SRP Locality Summary report for each NC-215 Triangle locality
and writes results to a per-locality-tab Google Sheet.

Usage:
    python locality_summary.py

Set SRP_USERNAME, SRP_PASSWORD, and TOTP_SECRET in .env to authenticate
automatically. If any are missing the browser opens for manual login.
"""

import datetime
import io
from pathlib import Path

import openpyxl

SHEET_ID    = '1wV1kZZd-vkxfIEqU-PlEl5aMPr6Bk2c7VOvKiyxxv5k'
EXPORTS_DIR = Path(__file__).parent / 'exports'
TIMEOUT     = 60_000
HEADER_ROWS = 3    # rows 1–3 are headers; data starts at row 4
DATE_COL    = 4    # column E, 0-indexed

LOCALITIES = [
    'Apex', 'Carrboro', 'Cary', 'Chapel Hill',
    'Durham', 'Durham County', 'Fuquay-Varina', 'Garner',
    'Hillsborough', 'Holly Springs', 'Knightdale',
    'Morrisville', 'Orange County', 'Raleigh', 'Rolesville',
    'Wake County', 'Wake Forest', 'Wendell', 'Zebulon',
]

# Combined 72-column header: first 5 from Row 1, rest from Row 3 leaf headers.
EXPECTED_COLUMNS = [
    'Locality', 'Cluster', 'Region', 'National Community', 'Date as of',
    'Book 1', 'Book 2', 'Book 3 (G1)', 'Book 3 (G2)', 'Book 3 (G3)',
    'Book 3 (G4)', 'Book 3 (G5)', 'Book 4', 'Book 5', 'Book 5 BR1',
    'Book 5 BR2', 'Book 5 BR3', 'Book 6', 'Book 7', 'Book 7 BR1',
    'Book 7 BR2', 'Book 8 (U1)', 'Book 8 (U2)', 'Book 8 (U3)',
    'Book 9 (U1)', 'Book 9 (U2)', 'Book 9 (U3)', 'Book 10 (U1)',
    'Book 10 (U2)', 'Book 10 (U3)', 'Book 11 (U1)', 'Book 11 (U2)',
    'Book 11 (U3)', 'Book 12 (U1)', 'Book 12 (U2)', 'Book 12 (U3)',
    'Book 13 (U1)', 'Book 13 (U2)', 'Book 13 (U3)', 'Book 14 (U1)',
    'Book 14 (U2)', 'Book 14 (U3)',
    'No.', 'Att.', 'Friends of the Faith',
    'No.', 'Att.', 'Friends of the Faith',
    'No.', 'Att.', 'Friends of the Faith',
    'No.', 'Att.', 'Friends of the Faith',
    'No.', 'Att.', 'Friends of the Faith',
    'No.', 'Att.', 'Friends of the Faith',
    'Children', 'Junior Youth', 'Youth', 'Adult Men', 'Adult Women',
    'Total Believers', 'Has Home Visits', 'No. of Homes Visited for Deepening',
    'Has 19 Day Feast', 'Att. at 19 Day Feast', 'Has Holy Days',
    'Att. at Holy Days',
]


def validate_columns(actual: list, expected: list) -> str | None:
    """Return an error string describing any schema mismatch, or None if columns match.

    Uses positional comparison so repeated column names (e.g. 'No.', 'Att.')
    are distinguished by their index rather than treated as identical.
    """
    if actual == expected:
        return None
    lines = ['Column mismatch — aborting.']
    if len(actual) != len(expected):
        lines.append(f'  Expected {len(expected)} columns, got {len(actual)}.')
    else:
        diffs = [
            (i, expected[i], actual[i])
            for i in range(len(expected))
            if actual[i] != expected[i]
        ]
        for idx, exp, got in diffs:
            lines.append(f'  Col {idx}: expected {exp!r}, got {got!r}')
    return '\n'.join(lines)


def extract_headers(xlsx_bytes: bytes) -> list:
    """Return the combined header list (Row 1 for cols 0–4, Row 3 for cols 5 onward)."""
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    row1 = list(rows[0])
    row3 = list(rows[2])
    return row1[:5] + row3[5:]


def parse_row(xlsx_bytes: bytes) -> list:
    """Return the single data row from a Locality Summary Excel as a list (None → '')."""
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    return ['' if v is None else v for v in rows[3]]


def parse_date(v) -> datetime.date:
    """Parse a date value into a datetime.date.

    Accepts:
    - datetime.datetime (returned by openpyxl for date cells)
    - datetime.date
    - str in '%m/%d/%y' format (e.g. '5/3/26' or '11/9/25')
    """
    if isinstance(v, datetime.datetime):
        return v.date()
    if isinstance(v, datetime.date):
        return v
    return datetime.datetime.strptime(str(v), '%m/%d/%y').date()


def should_append(last_date_str: str | None, new_date_str: str) -> bool:
    """Return True when new_date_str represents a new SRP reporting period."""
    if last_date_str is None:
        return True
    return parse_date(new_date_str) != parse_date(last_date_str)
