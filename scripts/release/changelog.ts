// Changelog helpers for the release script (Keep a Changelog format: `## [x.y.z] - date` sections).

// First released-version heading; `## [Unreleased]` is not one.
const VERSION_HEADING = /^## \[(?!Unreleased\])/im;

// Inserts a new `## [x.y.z] - date` section before the latest released version (after any
// Unreleased content), or at the end when there is no version yet.
export function insertSection(changelog: string, section: string): string {
  const body = section.trim();
  const match = VERSION_HEADING.exec(changelog);
  if (!match) return `${changelog.trimEnd()}\n\n${body}\n`;
  const before = changelog.slice(0, match.index).trimEnd();
  const after = changelog.slice(match.index);
  return `${before}\n\n${body}\n\n${after}`;
}

// Body of the section of `version` (without its heading), trimmed; null when there is none.
export function extractSection(changelog: string, version: string): string | null {
  const lines = changelog.split('\n');
  const prefix = `## [${version}]`;
  const start = lines.findIndex((line) => line.startsWith(prefix));
  if (start === -1) return null;
  let end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  if (end === -1) end = lines.length;
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}
