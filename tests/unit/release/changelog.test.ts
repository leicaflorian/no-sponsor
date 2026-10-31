// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractSection, insertSection } from '../../../scripts/release/changelog';

const real = readFileSync('CHANGELOG.md', 'utf8');
const section = '## [1.0.12] - 2026-10-18\n\n### Fixed\n\n- Something.';

describe('insertSection', () => {
  it('puts the section right before the latest version, with a blank line around it', () => {
    // A fixed changelog, not the real one: its latest version changes at every release.
    const input =
      '# Changelog\n\nAll notable changes.\n\n## [1.0.11] - 2026-10-17\n\n- Last.\n\n## [1.0.10] - 2026-10-16\n\n- Older.\n';
    expect(insertSection(input, section)).toBe(
      `# Changelog\n\nAll notable changes.\n\n${section}\n\n## [1.0.11] - 2026-10-17\n\n- Last.\n\n## [1.0.10] - 2026-10-16\n\n- Older.\n`,
    );
  });

  it('puts it after the Unreleased content', () => {
    const input = '# Changelog\n\n## [Unreleased]\n\n- Pending.\n\n## [1.0.0] - 2026-01-01\n\n- First.\n';
    expect(insertSection(input, section)).toBe(
      `# Changelog\n\n## [Unreleased]\n\n- Pending.\n\n${section}\n\n## [1.0.0] - 2026-01-01\n\n- First.\n`,
    );
  });

  it('appends it at the end when there are no sections', () => {
    expect(insertSection('# Changelog\n', section)).toBe(`# Changelog\n\n${section}\n`);
  });
});

describe('extractSection', () => {
  it('returns the body of a version without its heading', () => {
    const body = extractSection(real, '1.0.11');
    expect(body).not.toBeNull();
    expect(body!.startsWith('### Added')).toBe(true);
    expect(body).toContain('Report a problem');
    expect(body).not.toContain('## [1.0.10]');
    expect(body).not.toContain('## [1.0.11]');
  });

  it('returns null for a missing version', () => {
    expect(extractSection(real, '9.9.9')).toBeNull();
  });
});
