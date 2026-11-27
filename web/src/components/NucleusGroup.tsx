'use client';

import { NucleusSummary } from '@/types';
import type { ChildNode } from '@/lib/children';
import NucleusListRow, { typeBadgeStyle } from './NucleusListRow';

// Nuclei under a parent, as the home page shows them: a pocket row each, or, for one with children of its own, a
// parent bar again (indented), so any depth nests the same way. Used on the home page and in the nucleus page's
// Child nuclei card (owner, 2026-11-27).
export function NucleusGroupRows({ nodes, onSelect, openState, keyPrefix }: {
  nodes: ChildNode[];
  onSelect: (name: string) => void;
  openState: OpenState;
  keyPrefix: string;
}) {
  return nodes.map(n => n.children.length
    ? <NucleusGroup key={n.row.nucleus} label={n.row.nucleus} row={n.row} nodes={n.children} onSelect={onSelect}
        openState={openState} keyPrefix={keyPrefix} nested />
    : <NucleusListRow key={n.row.nucleus} r={n.row} isPocket onSelect={onSelect} />);
}

// Which bars are open, kept by the page (AppClient, per page) so that leaving and coming back finds them as they
// were (owner, 2026-11-27). Keys are `${keyPrefix}/${label}`, nested bars extending their parent's key.
export type OpenState = { open: Record<string, boolean>; onOpenChange: (key: string, open: boolean) => void };

// A parent bar (▶ and a label, closed at first) that opens to the nuclei under it. The label is the parent nucleus
// (`row`, tap to open it), or just its name when the parent isn't in the user's list.
export default function NucleusGroup({ label, row, nodes, onSelect, openState, keyPrefix, nested = false }: {
  label: string;
  row?: NucleusSummary;
  nodes: ChildNode[];
  onSelect: (name: string) => void;
  openState: OpenState;
  keyPrefix: string;
  nested?: boolean;
}) {
  const key = `${keyPrefix}/${label}`;
  const isOpen = openState.open[key] ?? false;
  const toggle = () => openState.onOpenChange(key, !isOpen);
  return (
    <div className={nested ? 'nested-group' : undefined}>
      <div className="parent-item">
        <span
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          aria-label={`${isOpen ? 'Hide' : 'Show'} the nuclei under ${label}`}
          className={`parent-arrow${isOpen ? ' open' : ''}`}
          onClick={toggle}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        >▶</span>
        <span className="parent-name" onClick={row ? () => onSelect(row.nucleus) : toggle}>{label}</span>
        {row?.stage && <span className="stage-badge" style={typeBadgeStyle(row.nucleusType)}>{row.stage}</span>}
      </div>
      {isOpen && <div className="pocket-rows open"><NucleusGroupRows nodes={nodes} onSelect={onSelect} openState={openState} keyPrefix={key} /></div>}
    </div>
  );
}
