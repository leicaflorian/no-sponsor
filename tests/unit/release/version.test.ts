// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isGreater, parseVersion } from '../../../scripts/release/version';

describe('parseVersion', () => {
  it('accepts a plain and a v-prefixed version', () => {
    expect(parseVersion('v1.0.11')).toEqual([1, 0, 11]);
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
  });

  it('rejects anything else', () => {
    expect(parseVersion('1.0')).toBeNull();
    expect(parseVersion('1.0.12-beta')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});

describe('isGreater', () => {
  it('compares numerically, not as text', () => {
    expect(isGreater('1.0.12', '1.0.11')).toBe(true);
    expect(isGreater('1.1.0', '1.0.99')).toBe(true);
    expect(isGreater('1.0.10', '1.0.9')).toBe(true);
  });

  it('is false for equal or smaller versions', () => {
    expect(isGreater('1.0.11', '1.0.11')).toBe(false);
    expect(isGreater('1.0.11', '1.0.12')).toBe(false);
  });

  it('is false when a version is invalid', () => {
    expect(isGreater('1.0', '1.0.1')).toBe(false);
  });
});
