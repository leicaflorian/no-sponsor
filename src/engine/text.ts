// Text normalization and label matching (1:1 port of 0.1.0).

// Invisible characters: U+200B–U+200D, U+2060, U+FEFF, U+00AD.
export const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
const EDGE_PUNCT = /^[\s·•|:\-–—()[\]]+|[\s·•|:\-–—()[\]]+$/g;

export function norm(text: string | null | undefined): string {
  return (text || '').replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').toLowerCase().replace(EDGE_PUNCT, '');
}

export function labelMatch(text: string | null | undefined, labels: readonly string[]): boolean {
  const t = norm(text);
  if (!t || t.length > 80) return false;
  return labels.some((l) => (l.endsWith('*') ? t.startsWith(l.slice(0, -1)) : t === l));
}
