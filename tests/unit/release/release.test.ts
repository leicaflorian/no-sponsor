// @vitest-environment node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ChangelogDraft, Claude, Notice } from '../../../scripts/release/claude';
import type { Prompter } from '../../../scripts/release/prompter';
import { runRelease, type ReleaseDeps } from '../../../scripts/release/release';

const TIMEOUT = 30_000;
const SECTION = '## [1.0.12] - 2026-10-18\n\n### Fixed\n\n- Sponsored results are marked again.';
const NOTES = '### Fixed\n\n- Sponsored results are marked again.';
const ZIP_COMMAND =
  "node -e \"const fs=require('fs');const v=require('./package.json').version;" +
  "fs.mkdirSync('.output',{recursive:true});fs.writeFileSync('.output/demo-'+v+'-chrome.zip','zip')\"";

let root: string;
let remote: string;
let repo: string;
let startMain: string;
const savedEnv: Record<string, string | undefined> = {};

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function remoteGit(...args: string[]): string {
  return sh(root, '--git-dir', remote, ...args);
}

function write(name: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(repo, name)), { recursive: true });
  fs.writeFileSync(path.join(repo, name), content);
}

function read(name: string): string {
  return fs.readFileSync(path.join(repo, name), 'utf8');
}

interface FixtureOptions {
  checks?: string[] | ((remote: string) => string[]);
  zipCommand?: string;
  extraConfig?: Record<string, unknown>;
  files?: Record<string, string>;
}

// A bare remote and a clone with main and dev pushed; v1.0.11 is tagged on main and dev has
// one more commit. The clone is left on dev.
function makeFixture(options: FixtureOptions = {}): void {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-flow-'));
  remote = path.join(root, 'remote.git');
  repo = path.join(root, 'repo');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  fs.mkdirSync(repo);
  sh(repo, 'init', '-q', '-b', 'main');
  sh(repo, 'config', 'user.name', 'Test');
  sh(repo, 'config', 'user.email', 'test@example.com');
  sh(repo, 'config', 'commit.gpgsign', 'false');
  sh(repo, 'config', 'tag.gpgsign', 'false');
  write('package.json', `${JSON.stringify({ name: 'demo', version: '1.0.11' }, null, 2)}\n`);
  write(
    'package-lock.json',
    `${JSON.stringify(
      {
        name: 'demo',
        version: '1.0.11',
        lockfileVersion: 3,
        requires: true,
        packages: { '': { name: 'demo', version: '1.0.11' } },
      },
      null,
      2,
    )}\n`,
  );
  write('CHANGELOG.md', '# Changelog\n\n## [1.0.11] - 2026-10-17\n\n### Fixed\n\n- An older fix.\n');
  write('.gitignore', '.output/\n');
  for (const [name, content] of Object.entries(options.files ?? {})) write(name, content);
  write(
    'release.config.json',
    `${JSON.stringify(
      {
        checks: typeof options.checks === 'function' ? options.checks(remote) : (options.checks ?? ['node -e ""']),
        zip: { command: options.zipCommand ?? ZIP_COMMAND, output: '.output/{name}-{version}-chrome.zip' },
        versionPolicy: 'Bump the patch for fixes.',
        docs: ['README.md'],
        ...options.extraConfig,
      },
      null,
      2,
    )}\n`,
  );
  sh(repo, 'add', '-A');
  sh(repo, 'commit', '-q', '-m', 'initial');
  sh(repo, 'tag', '-a', 'v1.0.11', '-m', 'v1.0.11');
  sh(repo, 'remote', 'add', 'origin', remote);
  sh(repo, 'push', '-q', 'origin', 'main', 'v1.0.11');
  sh(repo, 'checkout', '-q', '-b', 'dev');
  write('src.txt', 'fixed');
  sh(repo, 'add', '-A');
  sh(repo, 'commit', '-q', '-m', 'fix: mark sponsored results again');
  sh(repo, 'push', '-q', 'origin', 'dev');
  startMain = sh(repo, 'rev-parse', 'main');
}

// Answers are consumed in order; a question with no answer left throws (and fails the test).
function scriptedPrompter(answers: string[], hooks: { onChoose?: (question: string) => void } = {}) {
  const queue = [...answers];
  const questions: { kind: string; question: string; fallback?: string }[] = [];
  function next(kind: string, question: string, fallback?: string): string {
    questions.push({ kind, question, fallback });
    const answer = queue.shift();
    if (answer === undefined) throw new Error(`Unexpected question: ${question}`);
    return answer;
  }
  const prompter: Prompter = {
    async confirm(question) {
      return next('confirm', question) === 'y';
    },
    async ask(question, fallback) {
      return next('ask', question, fallback) || fallback || '';
    },
    async choose<T extends string>(question: string, options: T[]): Promise<T> {
      hooks.onChoose?.(question);
      const answer = next('choose', question);
      if (!options.includes(answer as T)) throw new Error(`"${answer}" is not one of ${options.join(', ')}`);
      return answer as T;
    },
    async edit(text) {
      return next('edit', text);
    },
  };
  return { prompter, questions, remaining: () => queue.length };
}

function fakeClaude(options: { notices?: Notice[]; failVersion?: boolean; section?: string } = {}): Claude {
  return {
    async suggestVersion() {
      if (options.failVersion) throw new Error('claude is not available');
      return { version: '1.0.12', reason: 'only fixes' };
    },
    async draftChangelog(): Promise<ChangelogDraft> {
      return { section: options.section ?? SECTION, notices: options.notices ?? [] };
    },
  };
}

function makeDeps(prompter: Prompter, claude: Claude = fakeClaude()) {
  const lines: string[] = [];
  const deps: ReleaseDeps = {
    cwd: repo,
    prompter,
    claude,
    createGithubRelease: vi.fn(),
    log: (line) => lines.push(line),
    today: () => '2026-10-18',
    onInterrupt: vi.fn(),
  };
  return { deps, lines };
}

function expectNothingReleased(): void {
  expect(sh(repo, 'tag', '--list')).toBe('v1.0.11');
  expect(remoteGit('tag', '--list')).toBe('v1.0.11');
  expect(remoteGit('log', '-1', '--format=%s', 'main')).toBe('initial');
  expect(JSON.parse(read('package.json')).version).toBe('1.0.11');
  expect(sh(repo, 'status', '--porcelain')).toBe('');
}

// After an abort before the push: main is back before the merge, on the starting branch (dev).
function expectBackAtStart(): void {
  expect(sh(repo, 'rev-parse', 'main')).toBe(startMain);
  expect(sh(repo, 'rev-parse', 'main')).toBe(sh(repo, 'rev-parse', 'origin/main'));
  expect(sh(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('dev');
}

beforeAll(() => {
  // Keep the owner's global and system git config (hooks, signing) out of the fixtures.
  for (const key of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM']) savedEnv[key] = process.env[key];
  process.env.GIT_CONFIG_GLOBAL = os.devNull;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('runRelease', () => {
  it(
    'releases from dev',
    async () => {
      makeFixture();
      const { prompter, remaining } = scriptedPrompter(['y', '', 'accept']);
      const { deps } = makeDeps(prompter);
      // The GitHub release comes before dev is updated (a dev conflict must not block it).
      let devAtRelease = '';
      vi.mocked(deps.createGithubRelease).mockImplementation(() => {
        devAtRelease = remoteGit('log', '-1', '--format=%s', 'dev');
      });

      expect(await runRelease(deps, { dryRun: false })).toBe('released');

      expect(devAtRelease).toBe('fix: mark sponsored results again');
      expect(remoteGit('log', '-1', '--format=%s', 'main')).toBe('chore(release): 1.0.12');
      expect(remoteGit('log', '-1', '--format=%s', 'dev')).toBe('chore(release): 1.0.12');
      expect(remoteGit('tag', '--list')).toContain('v1.0.12');
      expect(remoteGit('cat-file', '-t', 'v1.0.12')).toBe('tag');
      expect(read('CHANGELOG.md')).toContain('## [1.0.12] - 2026-10-18');
      expect(read('CHANGELOG.md').match(/## \[1\.0\.12\]/g)).toHaveLength(1);
      expect(read('CHANGELOG.md').indexOf('[1.0.12]')).toBeLessThan(read('CHANGELOG.md').indexOf('[1.0.11]'));
      expect(JSON.parse(read('package.json')).version).toBe('1.0.12');
      expect(JSON.parse(read('package-lock.json')).version).toBe('1.0.12');
      expect(deps.createGithubRelease).toHaveBeenCalledWith(
        'v1.0.12',
        NOTES,
        path.join(repo, '.output/demo-1.0.12-chrome.zip'),
      );
      expect(sh(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('dev');
      expect(sh(repo, 'status', '--porcelain')).toBe('');
      expect(remaining()).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'refuses a dirty tree',
    async () => {
      makeFixture();
      write('notes.txt', 'work in progress');
      const head = sh(repo, 'rev-parse', 'HEAD');
      const { prompter } = scriptedPrompter([]);
      const { deps, lines } = makeDeps(prompter);

      expect(await runRelease(deps, { dryRun: false })).toBe('aborted');

      expect(sh(repo, 'rev-parse', 'HEAD')).toBe(head);
      expect(lines.join('\n')).toMatch(/not clean/i);
    },
    TIMEOUT,
  );

  it(
    'stops when the user declines the merge',
    async () => {
      makeFixture();
      const main = sh(repo, 'rev-parse', 'main');
      const { prompter, remaining } = scriptedPrompter(['n']);
      const { deps, lines } = makeDeps(prompter);

      expect(await runRelease(deps, { dryRun: false })).toBe('aborted');

      expect(sh(repo, 'rev-parse', 'main')).toBe(main);
      expectBackAtStart();
      expect(lines.join('\n')).not.toContain('Not resetting');
      expect(remaining()).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'stops on a failing check',
    async () => {
      makeFixture({ checks: ['node -e "process.exit(1)"'] });
      const { prompter, remaining } = scriptedPrompter(['y']);
      const { deps, lines } = makeDeps(prompter);

      expect(await runRelease(deps, { dryRun: false })).toBe('aborted');

      expectNothingReleased();
      expectBackAtStart();
      expect(lines.join('\n')).toContain('process.exit(1)');
      expect(remaining()).toBe(0);

      // A second run gets past the initial checks and reaches the checks again.
      const again = scriptedPrompter(['y']);
      const second = makeDeps(again.prompter);
      expect(await runRelease(second.deps, { dryRun: false })).toBe('aborted');
      expect(second.lines).toContain('Running: node -e "process.exit(1)"');
      expectBackAtStart();
    },
    TIMEOUT,
  );

  it(
    'falls back to a typed version when Claude fails',
    async () => {
      makeFixture();
      const { prompter, questions, remaining } = scriptedPrompter(['y', '1.0.11', '1.0.12', 'accept']);
      const { deps } = makeDeps(prompter, fakeClaude({ failVersion: true }));

      expect(await runRelease(deps, { dryRun: false })).toBe('released');

      const asks = questions.filter((q) => q.kind === 'ask');
      expect(asks).toHaveLength(2);
      expect(asks.every((q) => q.fallback === undefined)).toBe(true);
      expect(JSON.parse(read('package.json')).version).toBe('1.0.12');
      expect(remoteGit('tag', '--list')).toContain('v1.0.12');
      expect(remaining()).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'rolls back on abort at the changelog',
    async () => {
      makeFixture();
      const { prompter, remaining } = scriptedPrompter(['y', '', 'abort']);
      const { deps } = makeDeps(prompter);

      expect(await runRelease(deps, { dryRun: false })).toBe('aborted');

      expectBackAtStart();
      expect(read('CHANGELOG.md')).not.toContain('1.0.12');
      expectNothingReleased();
      expect(remaining()).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'rolls back on abort when started on main',
    async () => {
      makeFixture();
      sh(repo, 'checkout', '-q', 'main');
      sh(repo, 'merge', '-q', '--no-ff', '--no-edit', 'dev');
      sh(repo, 'push', '-q', 'origin', 'main');
      const main = sh(repo, 'rev-parse', 'main');
      const { prompter, remaining } = scriptedPrompter(['', 'abort']);
      const { deps, lines } = makeDeps(prompter);

      expect(await runRelease(deps, { dryRun: false })).toBe('aborted');

      expect(lines).toContain(`Reset "main" to ${main.slice(0, 7)}.`);
      expect(sh(repo, 'rev-parse', 'main')).toBe(main);
      expect(sh(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
      expect(JSON.parse(read('package.json')).version).toBe('1.0.11');
      expect(sh(repo, 'status', '--porcelain')).toBe('');
      expect(remaining()).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'rolls back when the zip is missing',
    async () => {
      makeFixture({ zipCommand: 'node -e ""' });
      const { prompter, remaining } = scriptedPrompter(['y', '', 'accept']);
      const { deps, lines } = makeDeps(prompter);

      expect(await runRelease(deps, { dryRun: false })).toBe('aborted');

      expectBackAtStart();
      expect(read('CHANGELOG.md')).not.toContain('1.0.12');
      expectNothingReleased();
      expect(lines.join('\n')).toContain('.output/demo-1.0.12-chrome.zip');
      expect(deps.createGithubRelease).not.toHaveBeenCalled();
      expect(remaining()).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'rolls back when the main push is rejected',
    async () => {
      const other = path.join(os.tmpdir(), `release-flow-other-${process.pid}-${Date.now()}`);
      // The check pushes one more commit to the remote main, so the release push is rejected.
      makeFixture({
        checks: (bare) => [
          [
            `git clone -q "${bare}" "${other}"`,
            `git -C "${other}" -c user.name=Other -c user.email=other@example.com commit -q --allow-empty -m extra`,
            `git -C "${other}" push -q origin main`,
          ].join(' && '),
        ],
      });
      const { prompter, remaining } = scriptedPrompter(['y', '', 'accept']);
      const { deps, lines } = makeDeps(prompter);

      try {
        expect(await runRelease(deps, { dryRun: false })).toBe('aborted');
      } finally {
        fs.rmSync(other, { recursive: true, force: true });
      }

      expectBackAtStart();
      expect(sh(repo, 'tag', '--list')).toBe('v1.0.11');
      expect(remoteGit('log', '-1', '--format=%s', 'main')).toBe('extra');
      expect(remoteGit('tag', '--list')).toBe('v1.0.11');
      expect(JSON.parse(read('package.json')).version).toBe('1.0.11');
      expect(lines.join('\n')).toMatch(/Deleted tag v1\.0\.12/);
      expect(remaining()).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'restores main when interrupted before push',
    async () => {
      makeFixture();
      const { prompter, remaining } = scriptedPrompter(['y', '', 'abort'], {
        onChoose: (question) => {
          if (question === 'Changelog') process.emit('SIGINT');
        },
      });
      const { deps, lines } = makeDeps(prompter);
      const listeners = process.listenerCount('SIGINT');

      expect(await runRelease(deps, { dryRun: false })).toBe('aborted');

      expect(deps.onInterrupt).toHaveBeenCalledTimes(1);
      expect(lines.filter((line) => line.startsWith('Reset "main"'))).toHaveLength(1);
      expectBackAtStart();
      expectNothingReleased();
      expect(process.listenerCount('SIGINT')).toBe(listeners);
      expect(remaining()).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'restores main when terminated before push',
    async () => {
      makeFixture();
      const { prompter, remaining } = scriptedPrompter(['y', '', 'abort'], {
        onChoose: (question) => {
          if (question === 'Changelog') process.emit('SIGTERM');
        },
      });
      const { deps, lines } = makeDeps(prompter);
      const listeners = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((s) => process.listenerCount(s));

      expect(await runRelease(deps, { dryRun: false })).toBe('aborted');

      expect(deps.onInterrupt).toHaveBeenCalledTimes(1);
      expect(lines.filter((line) => line.startsWith('Reset "main"'))).toHaveLength(1);
      expectBackAtStart();
      expectNothingReleased();
      expect(['SIGINT', 'SIGTERM', 'SIGHUP'].map((s) => process.listenerCount(s))).toEqual(listeners);
      expect(remaining()).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'refuses a main with local commits not on the remote',
    async () => {
      makeFixture();
      sh(repo, 'checkout', '-q', 'main');
      sh(repo, 'merge', '-q', '--no-ff', '--no-edit', 'dev');
      sh(repo, 'checkout', '-q', 'dev');
      const { prompter } = scriptedPrompter([]);
      const { deps, lines } = makeDeps(prompter);

      expect(await runRelease(deps, { dryRun: false })).toBe('aborted');

      expect(lines).toContain(
        'Branch "main" has local commits not on origin/main (a leftover release run?): check git log origin/main..main and reset it.',
      );
    },
    TIMEOUT,
  );

  it(
    'skips a node version file that names no version',
    async () => {
      makeFixture({ extraConfig: { nodeVersionFile: '.nvmrc' }, files: { '.nvmrc': 'lts/*\n' } });
      const { prompter } = scriptedPrompter(['n']);
      const { deps, lines } = makeDeps(prompter);

      expect(await runRelease(deps, { dryRun: false })).toBe('aborted');

      expect(lines.join('\n')).toContain('.nvmrc does not name a version ("lts/*"): the Node check is skipped.');
      expect(lines.join('\n')).toContain('Merge declined.');
    },
    TIMEOUT,
  );

  it(
    'does not accept a stale zip',
    async () => {
      makeFixture({ zipCommand: 'node -e ""' });
      write('.output/demo-1.0.12-chrome.zip', 'old');
      const { prompter, remaining } = scriptedPrompter(['y', '', 'accept']);
      const { deps, lines } = makeDeps(prompter);

      expect(await runRelease(deps, { dryRun: false })).toBe('aborted');

      expect(lines.join('\n')).toContain('The zip was not created: expected .output/demo-1.0.12-chrome.zip.');
      expectBackAtStart();
      expectNothingReleased();
      expect(remaining()).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'replaces a heading Claude wrote in another form',
    async () => {
      makeFixture();
      const { prompter, remaining } = scriptedPrompter(['y', '', 'accept']);
      const { deps, lines } = makeDeps(prompter, fakeClaude({ section: `## 1.0.12\n\n${NOTES}` }));

      expect(await runRelease(deps, { dryRun: false })).toBe('released');

      expect(read('CHANGELOG.md').match(/^## .*1\.0\.12.*$/gm)).toEqual(['## [1.0.12] - 2026-10-18']);
      expect(deps.createGithubRelease).toHaveBeenCalledWith('v1.0.12', NOTES, expect.any(String));
      expect(lines).toContain('Asking Claude for the version…');
      expect(lines).toContain('Asking Claude for the changelog…');
      expect(remaining()).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'asks again with privacy notices',
    async () => {
      makeFixture();
      const notices: Notice[] = [
        { kind: 'readme', file: 'README.md', reason: 'the feature list is outdated' },
        { kind: 'privacy', file: 'manifest', reason: 'new permission storage' },
      ];
      const { prompter, questions, remaining } = scriptedPrompter(['y', '', 'accept', 'n']);
      const { deps, lines } = makeDeps(prompter, fakeClaude({ notices }));

      expect(await runRelease(deps, { dryRun: false })).toBe('aborted');

      expect(questions.at(-1)).toMatchObject({ kind: 'confirm', question: 'Continue anyway?' });
      const text = lines.join('\n');
      expect(text.indexOf('new permission storage')).toBeLessThan(text.indexOf('the feature list is outdated'));
      expectBackAtStart();
      expect(read('CHANGELOG.md')).not.toContain('1.0.12');
      expectNothingReleased();
      expect(remaining()).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'dry run writes nothing',
    async () => {
      makeFixture();
      const main = sh(repo, 'rev-parse', 'main');
      const dev = sh(repo, 'rev-parse', 'dev');
      const { prompter, remaining } = scriptedPrompter(['y', '']);
      const { deps, lines } = makeDeps(prompter);

      expect(await runRelease(deps, { dryRun: true })).toBe('dry-run');

      expect(sh(repo, 'rev-parse', 'main')).toBe(main);
      expect(sh(repo, 'rev-parse', 'dev')).toBe(dev);
      expect(sh(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('dev');
      expect(read('CHANGELOG.md')).not.toContain('1.0.12');
      expect(lines.join('\n')).toContain('### Fixed');
      expect(deps.createGithubRelease).not.toHaveBeenCalled();
      expectNothingReleased();
      expect(remaining()).toBe(0);
    },
    TIMEOUT,
  );
});
