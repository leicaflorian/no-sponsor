// Step functions of the release flow (release.ts runs them in order).
// Part of the self-contained scripts/release/ folder: it imports only node:* and its own files.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Claude, ChangelogDraft, Notice } from './claude';
import type { ReleaseConfig } from './config';
import { currentBranch, git, isClean, isInSyncWithRemote } from './git';
import type { Prompter } from './prompter';
import { isGreater, parseVersion } from './version';

// A planned stop (failed check, user said no): the message is shown as is.
export class Abort extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Abort';
  }
}

export interface StepContext {
  cwd: string;
  config: ReleaseConfig;
  prompter: Prompter;
  claude: Claude;
  log(line: string): void;
}

function aheadBehind(cwd: string, remote: string, branch: string): { ahead: number; behind: number } {
  const count = (range: string): number => Number(git(cwd, 'rev-list', '--count', range));
  return {
    ahead: count(`refs/remotes/${remote}/${branch}..refs/heads/${branch}`),
    behind: count(`refs/heads/${branch}..refs/remotes/${remote}/${branch}`),
  };
}

export function initialChecks(cwd: string, config: ReleaseConfig, log: (line: string) => void): string {
  if (!isClean(cwd)) throw new Abort('Working tree is not clean: commit or stash first.');
  const branch = currentBranch(cwd);
  if (branch !== config.mainBranch && branch !== config.devBranch) {
    throw new Abort(`Run the release from "${config.mainBranch}" or "${config.devBranch}", not from "${branch}".`);
  }
  for (const b of [config.mainBranch, config.devBranch]) {
    if (!isInSyncWithRemote(cwd, config.remote, b)) {
      const remoteRef = `${config.remote}/${b}`;
      if (aheadBehind(cwd, config.remote, b).ahead > 0) {
        throw new Abort(
          `Branch "${b}" has local commits not on ${remoteRef} (a leftover release run?): check git log ${remoteRef}..${b} and reset it.`,
        );
      }
      throw new Abort(`Branch "${b}" is behind ${remoteRef}: pull first.`);
    }
  }
  if (config.nodeVersionFile) {
    const content = readFileSync(join(cwd, config.nodeVersionFile), 'utf8').trim();
    const wanted = content.replace(/^v/, '').split('.')[0] ?? '';
    const running = process.versions.node.split('.')[0];
    if (!/^\d/.test(wanted)) {
      log(`Warning: ${config.nodeVersionFile} does not name a version ("${content}"): the Node check is skipped.`);
    } else if (wanted !== running) {
      throw new Abort(`Node ${process.versions.node} is running, but ${config.nodeVersionFile} asks for ${wanted}.`);
    }
  }
  return branch;
}

// Merges dev into main (--no-ff) after the user's yes; leaves the repository on main.
export async function mergeDev(ctx: StepContext): Promise<void> {
  const { cwd, config, log } = ctx;
  const { mainBranch: main, devBranch: dev } = config;
  const out = git(cwd, 'log', '--format=%h %s', `${main}..${dev}`);
  if (out === '') {
    log(`"${dev}" has no commits that are not in "${main}": nothing to merge.`);
    git(cwd, 'checkout', '-q', main);
    return;
  }
  log(`Commits of "${dev}" not in "${main}":`);
  for (const line of out.split('\n')) log(`  ${line}`);
  if (!(await ctx.prompter.confirm(`Merge ${dev} into ${main}?`))) throw new Abort('Merge declined.');
  git(cwd, 'checkout', '-q', main);
  try {
    git(cwd, 'merge', '--no-ff', '--no-edit', dev);
  } catch (error) {
    try {
      git(cwd, 'merge', '--abort');
    } catch {
      // Nothing to abort: the merge failed before starting.
    }
    throw new Abort(`Merging "${dev}" into "${main}" failed and was aborted: ${(error as Error).message}`);
  }
}

export function runChecks(ctx: StepContext, run: (command: string) => void): void {
  for (const command of ctx.config.checks) {
    ctx.log(`Running: ${command}`);
    try {
      run(command);
    } catch (error) {
      throw new Abort(`Check failed: ${(error as Error).message}`);
    }
  }
}

export async function chooseVersion(ctx: StepContext, lastTag: string | null, commits: string[]): Promise<string> {
  let suggested: string | undefined;
  ctx.log('Asking Claude for the version…');
  try {
    const suggestion = await ctx.claude.suggestVersion({
      lastTag: lastTag ?? 'none',
      commits,
      policy: ctx.config.versionPolicy,
    });
    suggested = suggestion.version;
    ctx.log(`Suggested ${suggestion.version}: ${suggestion.reason}`);
  } catch (error) {
    ctx.log(`Claude could not suggest a version: ${(error as Error).message}`);
  }
  for (;;) {
    const answer = (await ctx.prompter.ask('Version', suggested)).trim().replace(/^v/, '');
    if (!parseVersion(answer)) {
      ctx.log(`"${answer}" is not a MAJOR.MINOR.PATCH version.`);
    } else if (lastTag && !isGreater(answer, lastTag)) {
      ctx.log(`${answer} is not higher than ${lastTag}.`);
    } else {
      return answer;
    }
  }
}

// Writes the version to package.json and package-lock.json, without touching git.
export function writeVersion(cwd: string, version: string): void {
  execFileSync('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// The section without its leading `## ` heading line(s), whatever their form, and without any
// other `## [version]` line.
export function sectionBody(section: string, version: string): string {
  const lines = section.split('\n');
  while (lines.length && (lines[0]!.trim() === '' || lines[0]!.startsWith('## '))) lines.shift();
  return lines
    .filter((line) => !line.startsWith(`## [${version}]`))
    .join('\n')
    .trim();
}

// Makes sure the section starts with the heading `## [version] - date`, exactly once.
export function normalizeSection(section: string, version: string, date: string): string {
  return `## [${version}] - ${date}\n\n${sectionBody(section, version)}`;
}

const NOTICE_ORDER: Notice['kind'][] = ['privacy', 'readme', 'store', 'other'];

export function formatNotices(notices: Notice[]): string[] {
  const lines: string[] = [];
  for (const kind of NOTICE_ORDER) {
    for (const n of notices.filter((notice) => notice.kind === kind)) {
      lines.push(`${kind.toUpperCase()} — ${n.file}: ${n.reason}`);
    }
  }
  return lines;
}

function showDraft(ctx: StepContext, draft: ChangelogDraft): void {
  ctx.log('');
  for (const line of draft.section.split('\n')) ctx.log(line);
  if (draft.notices.length) {
    ctx.log('');
    ctx.log('Notices:');
    for (const line of formatNotices(draft.notices)) ctx.log(`  ${line}`);
  }
  ctx.log('');
}

// Asks Claude for the section; returns null when the user gives up after a failure.
async function requestDraft(
  ctx: StepContext,
  input: Parameters<Claude['draftChangelog']>[0],
): Promise<ChangelogDraft | null> {
  for (;;) {
    try {
      ctx.log('Asking Claude for the changelog…');
      const draft = await ctx.claude.draftChangelog(input);
      return { ...draft, section: normalizeSection(draft.section, input.version, input.date) };
    } catch (error) {
      ctx.log(`Claude could not write the changelog: ${(error as Error).message}`);
      if ((await ctx.prompter.choose('Changelog failed', ['retry', 'abort'])) === 'abort') return null;
    }
  }
}

// The changelog loop: show, then accept / edit / regenerate / abort. In a dry run it only shows.
export async function draftChangelog(
  ctx: StepContext,
  input: { version: string; date: string; lastTag: string | null },
  dryRun: boolean,
): Promise<ChangelogDraft> {
  const request = {
    version: input.version,
    date: input.date,
    lastTag: input.lastTag ?? 'none',
    changelogPath: ctx.config.changelog,
    docs: ctx.config.docs,
    storeTexts: ctx.config.storeTexts,
  };
  let draft = await requestDraft(ctx, request);
  for (;;) {
    if (!draft) throw new Abort('Changelog aborted.');
    showDraft(ctx, draft);
    if (dryRun) return draft;
    const choice = await ctx.prompter.choose('Changelog', ['accept', 'edit', 'regenerate', 'abort']);
    if (choice === 'abort') throw new Abort('Changelog aborted.');
    if (choice === 'regenerate') draft = await requestDraft(ctx, request);
    else if (choice === 'edit') {
      const edited = await ctx.prompter.edit(draft.section);
      draft = { ...draft, section: normalizeSection(edited, input.version, input.date) };
    } else break;
  }
  if (draft.notices.length && !(await ctx.prompter.confirm('Continue anyway?'))) {
    throw new Abort('Stopped because of the notices.');
  }
  return draft;
}

export function readChangelog(cwd: string, file: string): string {
  const path = join(cwd, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : '# Changelog\n';
}

export function packageName(cwd: string): string {
  const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as { name?: unknown };
  if (typeof pkg.name !== 'string' || pkg.name === '') throw new Abort('package.json has no "name".');
  return pkg.name;
}
