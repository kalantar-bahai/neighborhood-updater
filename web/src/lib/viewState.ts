// What is open on each page and where it was scrolled (page key: a nucleus name, or '' for the list), saved in the
// tab's sessionStorage so a reload finds the page as it was (owner, 2026-11-27). Only nucleus and card names, no
// personal data. The tab's storage goes when the tab closes; a new tab or a shared link starts afresh.
export type ViewState = { open: Record<string, Record<string, boolean>>; scroll: Record<string, number> };

export const VIEW_STATE_KEY = 'nucleus-assistant:view-state';

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

// The saved state, or an empty one when there is none or it isn't ours (bad JSON, wrong shapes are dropped).
export function parseViewState(raw: string | null): ViewState {
  const out: ViewState = { open: {}, scroll: {} };
  if (!raw) return out;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return out; }
  if (!isRecord(data)) return out;
  if (isRecord(data.open)) {
    for (const [view, keys] of Object.entries(data.open)) {
      if (!isRecord(keys)) continue;
      const clean: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(keys)) if (typeof v === 'boolean') clean[k] = v;
      out.open[view] = clean;
    }
  }
  if (isRecord(data.scroll)) {
    for (const [view, y] of Object.entries(data.scroll)) {
      if (typeof y === 'number' && Number.isFinite(y) && y >= 0) out.scroll[view] = y;
    }
  }
  return out;
}

// sessionStorage can be missing or throw (private windows, blocked site data); then nothing is kept, as before.
export function readViewState(): ViewState {
  try { return parseViewState(window.sessionStorage.getItem(VIEW_STATE_KEY)); } catch { return { open: {}, scroll: {} }; }
}

export function writeViewState(state: ViewState): void {
  try { window.sessionStorage.setItem(VIEW_STATE_KEY, JSON.stringify(state)); } catch { /* not kept; see above */ }
}
