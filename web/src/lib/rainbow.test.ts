import { describe, test, expect } from 'vitest';
import { rainbowValue, ringValue } from './rainbow';

describe('rainbowValue', () => {
  test('a number with thousands separators', () => {
    expect(rainbowValue('3')).toBe('3');
    expect(rainbowValue('2500')).toBe('2,500');
    expect(rainbowValue('125000')).toBe('125,000');
  });
  test('zero is a value, not "not recorded"', () => {
    expect(rainbowValue('0')).toBe('0');
  });
  test('blank or not a number is not recorded', () => {
    expect(rainbowValue('')).toBe('—');
    expect(rainbowValue('  ')).toBe('—');
    expect(rainbowValue('abc')).toBe('—');
  });
});

describe('ringValue', () => {
  test('the estimate, with the named count when it differs', () => {
    expect(ringValue('2500', undefined)).toBe('2,500');
    expect(ringValue('12', 4)).toBe('12 (4)');
    expect(ringValue('3', 3)).toBe('3');
  });
  test('not recorded, with names still counted', () => {
    expect(ringValue('', 3)).toBe('— (3)');
    expect(ringValue('', 0)).toBe('—');
  });
});
