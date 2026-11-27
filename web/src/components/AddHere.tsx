'use client';

// "+ Add" right after a bar's name (owner, 2026-11-27): starts a new nucleus there, with what the bar knows (its
// cluster, locality or parent) already filled in. Doesn't open or close the bar it sits on.
export default function AddHere({ onClick, where }: { onClick: () => void; where: string }) {
  return (
    <button
      type="button"
      className="add-here"
      aria-label={`Add a nucleus in ${where}`}
      onClick={e => { e.stopPropagation(); onClick(); }}
      onKeyDown={e => e.stopPropagation()}
    >+ Add</button>
  );
}
