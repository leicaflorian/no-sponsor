import { describe, expect, it } from 'vitest';
import { labelMatch, norm } from '../../src/engine/text';

describe('norm', () => {
  it('strips spaces and punctuation at the edges', () => {
    expect(norm('  Sponsorizzato · ')).toBe('sponsorizzato');
    expect(norm('(Annuncio)')).toBe('annuncio');
  });

  it.each([
    ['U+200B', '\u200B'],
    ['U+200C', '\u200C'],
    ['U+200D', '\u200D'],
    ['U+2060', '\u2060'],
    ['U+FEFF', '\uFEFF'],
    ['U+00AD', '\u00AD'],
  ])('strips the invisible character %s', (_name, ch) => {
    expect(norm(`Spon${ch}sorizzato`)).toBe('sponsorizzato');
  });

  it('handles all invisible characters together', () => {
    expect(norm('Spon\u200Bsor\u00ADizzato')).toBe('sponsorizzato');
  });

  it('null and undefined give an empty string', () => {
    expect(norm(null)).toBe('');
    expect(norm(undefined)).toBe('');
  });
});

describe('labelMatch', () => {
  it('exact match', () => {
    expect(labelMatch('Sponsorizzato', ['sponsorizzato'])).toBe(true);
  });

  it('prefix with asterisk', () => {
    expect(labelMatch('Prodotti sponsorizzati correlati', ['prodotti sponsorizzati*'])).toBe(true);
  });

  it('without asterisk a prefix is not enough', () => {
    expect(labelMatch('sponsorizzato da Rossi', ['sponsorizzato'])).toBe(false);
  });

  it('empty text', () => {
    expect(labelMatch('', ['sponsorizzato', 'x*'])).toBe(false);
  });

  it('over 80 characters does not match', () => {
    const long = 'prodotti sponsorizzati ' + 'x'.repeat(58);
    expect(long).toHaveLength(81);
    expect(labelMatch(long, ['prodotti sponsorizzati*'])).toBe(false);
  });
});
