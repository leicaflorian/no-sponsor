// The release flow: checks, merge of dev, version, changelog, commit, zip, tag, push, GitHub release.
// Part of the self-contained scripts/release/ folder: it imports only node:* and its own files.
// The step functions live in steps.ts.
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extractSection, insertSection } from './changelog';
import type { ChangelogDraft, Claude } from './claude';
import { loadConfig, resolveZipPath, type ReleaseConfig } from './config';
import { commitsSince, currentBranch, git, lastTag, runShell } from './git';
import type { Prompter } from './prompter';
import { Rollback } from './rollback';
import {
  Abort,
  chooseVersion,
  draftChangelog,
  formatNotices,
  initialChecks,
  mergeDev,
  packageName,
  readChangelog,
  runChecks,
  sectionBody,
  writeVersion,
  type StepContext,
} from './steps';

export interface ReleaseDeps {
  cwd: string;
  prompter: Prompter;
  claude: Claude;
  createGithubRelease(tag: string, notes: string, asset: string): void;
  log(line: string): void;
  today(): string; // YYYY-MM-DD
  onInterrupt(): void; // called after the rollback on Ctrl+C (index.ts exits)
}

// Ctrl+C, kill, closed terminal: each one restores the local state before the process ends.
const SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type ReleaseResult = 'released' | 'aborted' | 'dry-run';

export async function runRelease(deps: ReleaseDeps, opts: { dryRun: boolean }): Promise<ReleaseResult> {
  const { cwd, log } = deps;
  let config: ReleaseConfig;
  try {
    config = loadConfig(cwd);
  } catch (error) {
    log(message(error));
    return 'aborted';
  }
  const ctx: StepContext = { cwd, config, prompter: deps.prompter, claude: deps.claude, log };

  let rollback: Rollback | null = null;
  let restored = false;
  let pushed = false;
  let startBranch: string | null = null;

  // Shared by the error path, the abort path, the dry run and SIGINT: runs at most once, puts main
  // back before the merge and checks out the starting branch again, so a rerun passes the checks.
  const restoreOnce = (): void => {
    if (!rollback || restored || pushed) return;
    restored = true;
    try {
      // Not on main (the merge from dev was declined before the checkout): main was never touched.
      if (currentBranch(cwd) === config.mainBranch) {
        for (const line of rollback.restore()) log(line);
      }
      if (startBranch && currentBranch(cwd) !== startBranch) git(cwd, 'checkout', '-q', startBranch);
    } catch (error) {
      log(`Rollback failed: ${message(error)}`);
    }
  };
  const onSignal = (signal: NodeJS.Signals): void => {
    log(`Interrupted (${signal}).`);
    restoreOnce();
    deps.onInterrupt();
  };
  const arm = (): void => {
    rollback = new Rollback(cwd, config.mainBranch);
    for (const signal of SIGNALS) process.on(signal, onSignal);
  };

  try {
    startBranch = initialChecks(cwd, config, log);
    // The restore point comes before the merge, so an abort undoes the merge too.
    arm();
    if (startBranch === config.devBranch) await mergeDev(ctx);

    const tag = lastTag(cwd);
    const commits = commitsSince(cwd, tag);
    if (commits.length === 0) throw new Abort(`Nothing new since ${tag ?? 'the first commit'}.`);
    runChecks(ctx, (command) => runShell(cwd, command));

    const version = await chooseVersion(ctx, tag, commits);
    if (!opts.dryRun) writeVersion(cwd, version);
    const draft = await draftChangelog(ctx, { version, date: deps.today(), lastTag: tag }, opts.dryRun);
    if (opts.dryRun) {
      log(`Dry run: ${version} was not written, committed or pushed.`);
      return 'dry-run';
    }

    const zipPath = commitZipAndTag(ctx, version, draft, () => rollback?.tagCreated(`v${version}`));
    git(cwd, 'push', config.remote, config.mainBranch);
    rollback!.pushed();
    pushed = true;
    return finishAfterPush(deps, config, version, zipPath, draft);
  } catch (error) {
    log(error instanceof Abort ? error.message : `Error: ${message(error)}`);
    restoreOnce();
    return 'aborted';
  } finally {
    for (const signal of SIGNALS) process.off(signal, onSignal);
    if (opts.dryRun) restoreOnce();
  }
}

// Writes the changelog, commits, builds and checks the zip, tags. Returns the zip path (relative).
function commitZipAndTag(ctx: StepContext, version: string, draft: ChangelogDraft, tagged: () => void): string {
  const { cwd, config } = ctx;
  const changelog = insertSection(readChangelog(cwd, config.changelog), draft.section);
  writeFileSync(join(cwd, config.changelog), changelog);
  const files = ['package.json', 'package-lock.json', config.changelog].filter((f) => existsSync(join(cwd, f)));
  git(cwd, 'add', '--', ...files);
  git(cwd, 'commit', '-q', '-m', `chore(release): ${version}`);

  const zipPath = resolveZipPath(config.zip.output, { name: packageName(cwd), version });
  // An old zip with the same name must not pass the check below.
  rmSync(resolve(cwd, zipPath), { force: true });
  ctx.log(`Running: ${config.zip.command}`);
  try {
    runShell(cwd, config.zip.command);
  } catch (error) {
    throw new Abort(`Zip failed: ${message(error)}`);
  }
  if (!existsSync(resolve(cwd, zipPath))) throw new Abort(`The zip was not created: expected ${zipPath}.`);

  git(cwd, 'tag', '-a', `v${version}`, '-m', `v${version}`);
  tagged();
  return zipPath;
}

// After the main push nothing is undone: a failing step says how to finish by hand.
function finishAfterPush(
  deps: ReleaseDeps,
  config: ReleaseConfig,
  version: string,
  zipPath: string,
  draft: ChangelogDraft,
): 'released' | 'aborted' {
  const { cwd, log } = deps;
  const { remote, mainBranch: main, devBranch: dev } = config;
  const tag = `v${version}`;
  const notes = extractSection(readChangelog(cwd, config.changelog), version) || sectionBody(draft.section, version);
  const steps: { name: string; manual: string; run(): void }[] = [
    {
      name: `push of tag ${tag}`,
      manual: `git push ${remote} ${tag}`,
      run: () => git(cwd, 'push', remote, tag),
    },
    {
      name: 'GitHub release',
      manual: `gh release create ${tag} --title ${tag} --notes-file <the ${version} section of ${config.changelog}> ${zipPath}`,
      run: () => deps.createGithubRelease(tag, notes, resolve(cwd, zipPath)),
    },
    {
      name: `update of "${dev}"`,
      manual: `git checkout ${dev} && git merge ${main} && git push ${remote} ${dev}`,
      run: () => {
        git(cwd, 'checkout', '-q', dev);
        try {
          git(cwd, 'merge', '--ff-only', main);
        } catch {
          try {
            git(cwd, 'merge', '--no-edit', main);
          } catch (error) {
            git(cwd, 'merge', '--abort');
            throw error;
          }
        }
        git(cwd, 'push', remote, dev);
      },
    },
  ];
  for (const [i, step] of steps.entries()) {
    try {
      step.run();
    } catch (error) {
      log(`The ${step.name} failed: ${message(error)}`);
      log(`${main} and the release commit are already pushed: nothing was undone. Finish by hand:`);
      for (const rest of steps.slice(i)) log(`  ${rest.manual}`);
      return 'aborted';
    }
  }

  log('');
  log(`Released ${tag}.`);
  log(`Zip: ${zipPath}`);
  if (config.storeUploadUrl) log(`Upload it at ${config.storeUploadUrl}`);
  if (draft.notices.length) {
    log('Still open:');
    for (const line of formatNotices(draft.notices)) log(`  ${line}`);
  }
  return 'released';
}
