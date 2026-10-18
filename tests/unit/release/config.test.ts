// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, resolveZipPath } from '../../../scripts/release/config';

const base = {
  checks: ['npm test'],
  zip: { command: 'npm run zip', output: '.output/{name}-{version}-chrome.zip' },
  versionPolicy: 'Patch for fixes, minor for features.',
  docs: ['README.md'],
};

function setup(config: object, local?: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'release-config-'));
  writeFileSync(join(dir, 'release.config.json'), JSON.stringify(config));
  if (local) writeFileSync(join(dir, 'release.local.json'), JSON.stringify(local));
  return dir;
}

describe('loadConfig', () => {
  it('applies the defaults', () => {
    const config = loadConfig(setup(base));
    expect(config.mainBranch).toBe('main');
    expect(config.devBranch).toBe('dev');
    expect(config.remote).toBe('origin');
    expect(config.changelog).toBe('CHANGELOG.md');
    expect(config.storeTexts).toEqual([]);
  });

  it('merges release.local.json', () => {
    const config = loadConfig(setup(base, { storeTexts: ['/abs/store.md'] }));
    expect(config.storeTexts).toEqual(['/abs/store.md']);
  });

  it('names the missing field', () => {
    const withoutChecks: Partial<typeof base> = { ...base };
    delete withoutChecks.checks;
    expect(() => loadConfig(setup(withoutChecks))).toThrow(ConfigError);
    expect(() => loadConfig(setup(withoutChecks))).toThrow(/checks/);
  });

  it('rejects storeTexts in release.config.json', () => {
    const dir = setup({ ...base, storeTexts: ['/abs/store.md'] });
    expect(() => loadConfig(dir)).toThrow(/storeTexts belongs in release\.local\.json/);
  });

  it('rejects a missing release.config.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-config-'));
    expect(() => loadConfig(dir)).toThrow(ConfigError);
  });
});

describe('resolveZipPath', () => {
  it('replaces {name} and {version}', () => {
    expect(resolveZipPath('.output/{name}-{version}-chrome.zip', { name: 'nosponsor', version: '1.0.12' })).toBe(
      '.output/nosponsor-1.0.12-chrome.zip',
    );
  });
});
