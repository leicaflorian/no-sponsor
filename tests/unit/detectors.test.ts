import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../../src/shared/settings';
import { GENERIC, SITES, findSite } from '../../src/rules/detectors';

describe('DEFAULTS', () => {
  it('keep the 0.1.0 keys (settings already saved)', () => {
    expect(DEFAULTS).toEqual({ mode: 'highlight', generic: true, disabledHosts: [] });
  });
});

describe('findSite', () => {
  it.each([
    ['www.google.it', 'google'],
    ['www.google.co.uk', 'google'],
    ['www.amazon.de', 'amazon'],
    ['www.subito.it', 'subito'],
    ['www.ebay.co.uk', 'ebay'],
  ])('%s -> %s', (host, id) => {
    expect(findSite(host)?.id).toBe(id);
  });

  it.each(['example.com', 'notgoogle.com'])('%s -> null', (host) => {
    expect(findSite(host)).toBeNull();
  });
});

describe('detectors', () => {
  it('GENERIC contains "promosso"', () => {
    // 0.1.0: ambiguous label, known issue, to be fixed in Phase 1 (labels)
    expect(GENERIC.labels).toContain('promosso');
  });

  it('Subito ends with the generic containers article, li', () => {
    // 0.1.0: generic fallbacks, known issue, to be fixed in Phase 1 (containers)
    const subito = SITES.find((s) => s.id === 'subito');
    expect(subito?.container.slice(-2)).toEqual(['article', 'li']);
  });
});
