// @vitest-environment node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitsSince, currentBranch, git, isClean, isInSyncWithRemote, lastTag } from '../../../scripts/release/git';
import { Rollback } from '../../../scripts/release/rollback';

let root: string;
let repo: string;

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function commitFile(name: string, content: string): void {
  fs.writeFileSync(path.join(repo, name), content);
  sh(repo, 'add', '-A');
  sh(repo, 'commit', '-m', `add ${name}`);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-test-'));
  repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  sh(repo, 'init', '-b', 'main');
  sh(repo, 'config', 'user.name', 'Test');
  sh(repo, 'config', 'user.email', 'test@example.com');
  sh(repo, 'config', 'commit.gpgsign', 'false');
  sh(repo, 'config', 'tag.gpgsign', 'false');
  commitFile('a.txt', 'a');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('Rollback', () => {
  it('moves the branch back, deletes the tag and leaves a clean tree', () => {
    const start = sh(repo, 'rev-parse', 'HEAD');
    const rollback = new Rollback(repo, 'main');
    commitFile('b.txt', 'b');
    sh(repo, 'tag', 'v1.0.0');
    rollback.tagCreated('v1.0.0');

    const log = rollback.restore();

    expect(sh(repo, 'rev-parse', 'HEAD')).toBe(start);
    expect(sh(repo, 'tag', '--list')).toBe('');
    expect(isClean(repo)).toBe(true);
    expect(log.length).toBeGreaterThan(0);
  });

  it('discards uncommitted changes', () => {
    const rollback = new Rollback(repo, 'main');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'changed');
    rollback.restore();
    expect(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8')).toBe('a');
    expect(isClean(repo)).toBe(true);
  });

  it('touches nothing when HEAD does not descend from the recorded sha', () => {
    const rollback = new Rollback(repo, 'main');
    sh(repo, 'tag', 'v1.0.0');
    rollback.tagCreated('v1.0.0');
    sh(repo, 'checkout', '--orphan', 'tmp');
    sh(repo, 'commit', '-m', 'unrelated', '--allow-empty');
    sh(repo, 'branch', '-f', 'main', 'tmp');
    sh(repo, 'checkout', 'main');
    sh(repo, 'branch', '-D', 'tmp');
    const head = sh(repo, 'rev-parse', 'HEAD');

    const log = rollback.restore();

    expect(sh(repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(currentBranch(repo)).toBe('main');
    expect(sh(repo, 'tag', '--list')).toBe('v1.0.0');
    expect(log.join('\n')).toMatch(/descend|history/i);
  });

  it('touches nothing when another branch is checked out', () => {
    const rollback = new Rollback(repo, 'main');
    sh(repo, 'tag', 'v1.0.0');
    rollback.tagCreated('v1.0.0');
    sh(repo, 'checkout', '-b', 'feature');
    commitFile('b.txt', 'b');
    const head = sh(repo, 'rev-parse', 'HEAD');

    const log = rollback.restore();

    expect(sh(repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(sh(repo, 'tag', '--list')).toBe('v1.0.0');
    expect(log.join('\n')).toMatch(/branch/i);
  });

  it('only returns instructions after pushed()', () => {
    const rollback = new Rollback(repo, 'main');
    commitFile('b.txt', 'b');
    sh(repo, 'tag', 'v1.0.0');
    rollback.tagCreated('v1.0.0');
    rollback.pushed();
    const head = sh(repo, 'rev-parse', 'HEAD');

    const log = rollback.restore();

    expect(sh(repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(sh(repo, 'tag', '--list')).toBe('v1.0.0');
    expect(log.join('\n')).toContain('v1.0.0');
    expect(log.join('\n')).toContain(head.slice(0, 7));
  });
});

describe('git helpers', () => {
  it('lastTag is null without tags and the latest tag otherwise', () => {
    expect(lastTag(repo)).toBeNull();
    sh(repo, 'tag', 'v1.0.0');
    expect(lastTag(repo)).toBe('v1.0.0');
  });

  it('lastTag ignores tags that are not versions', () => {
    sh(repo, 'tag', 'v1.0.0');
    commitFile('b.txt', 'b');
    sh(repo, 'tag', 'build-7');
    expect(lastTag(repo)).toBe('v1.0.0');
  });

  it('isClean reports uncommitted changes', () => {
    expect(isClean(repo)).toBe(true);
    fs.writeFileSync(path.join(repo, 'new.txt'), 'x');
    expect(isClean(repo)).toBe(false);
  });

  it('commitsSince lists all commits without a ref and only newer ones with it', () => {
    sh(repo, 'tag', 'v1.0.0');
    commitFile('b.txt', 'b');
    expect(commitsSince(repo, null)).toHaveLength(2);
    const since = commitsSince(repo, 'v1.0.0');
    expect(since).toHaveLength(1);
    expect(since[0]).toMatch(/add b\.txt$/);
  });

  it('git() throws with stderr on failure', () => {
    expect(() => git(repo, 'rev-parse', 'nope-not-a-ref')).toThrow(/nope-not-a-ref/);
  });

  it('isInSyncWithRemote compares local and remote branch', () => {
    const remote = path.join(root, 'remote.git');
    sh(root, 'init', '--bare', '-b', 'main', remote);
    sh(repo, 'remote', 'add', 'origin', remote);
    sh(repo, 'push', 'origin', 'main');
    sh(repo, 'fetch', 'origin');
    expect(isInSyncWithRemote(repo, 'origin', 'main')).toBe(true);
    commitFile('b.txt', 'b');
    expect(isInSyncWithRemote(repo, 'origin', 'main')).toBe(false);
  });
});
