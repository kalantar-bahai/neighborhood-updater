import { describe, expect, test } from 'vitest';
import type { NucleusSummary } from '@/types';
import { childTree, rootOf, type ChildNode } from './children';

const row = (nucleus: string, parentNucleus = ''): NucleusSummary => ({ nucleus, parentNucleus } as NucleusSummary);
const names = (nodes: ChildNode[]) => nodes.map(n => n.row.nucleus);

describe('childTree', () => {
  test('direct children, sorted by name', () => {
    expect(names(childTree([row('P'), row('b', 'P'), row('a', 'P'), row('x', 'Q')], 'P'))).toEqual(['a', 'b']);
  });
  test('grandchildren nest', () => {
    const tree = childTree([row('P'), row('A', 'P'), row('A1', 'A')], 'P');
    expect(names(tree)).toEqual(['A']);
    expect(names(tree[0].children)).toEqual(['A1']);
    expect(tree[0].children[0].children).toEqual([]);
  });
  test('no children', () => {
    expect(childTree([row('P'), row('A', 'P')], 'Z')).toEqual([]);
  });
  test('parent name is trimmed', () => {
    expect(names(childTree([row('P'), row('A', ' P ')], 'P'))).toEqual(['A']);
  });
  test('self-parent is not its own child', () => {
    expect(childTree([row('P', 'P')], 'P')).toEqual([]);
  });
  test('a cycle ends', () => {
    const tree = childTree([row('A', 'B'), row('B', 'A')], 'A');
    expect(names(tree)).toEqual(['B']);
    expect(tree[0].children).toEqual([]);
  });
});

describe('rootOf', () => {
  const rows = [row('P'), row('A', 'P'), row('A1', 'A ')];
  test('walks to the top, any depth', () => {
    expect(rootOf(rows, rows[2]).nucleus).toBe('P');
  });
  test('a nucleus whose parent is not in the list is its own top', () => {
    const orphan = row('O', 'Gone');
    expect(rootOf([orphan], orphan)).toBe(orphan);
  });
  test('a cycle ends', () => {
    const a = row('A', 'B'), b = row('B', 'A');
    expect(['A', 'B']).toContain(rootOf([a, b], a).nucleus);
  });
});
