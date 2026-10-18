// Entry point of `npm run release`: wires the release flow to the terminal, the claude CLI and gh.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliClaude } from './claude';
import { ttyPrompter } from './prompter';
import { runRelease, type ReleaseDeps } from './release';

const cwd = process.cwd();
const dryRun = process.argv.includes('--dry-run');

function localDate(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toolWorks(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function checkTools(): string | null {
  if (!toolWorks('claude', ['--version'])) {
    return 'The "claude" command is not available: install Claude Code (https://claude.com/claude-code) and make sure it is on PATH.';
  }
  // A dry run publishes nothing, so it does not need GitHub.
  if (!dryRun && !toolWorks('gh', ['auth', 'status'])) {
    return 'The GitHub CLI is missing or not signed in: install it (https://cli.github.com) and run "gh auth login".';
  }
  return null;
}

function createGithubRelease(tag: string, notes: string, asset: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'release-notes-'));
  try {
    const notesFile = join(dir, 'notes.md');
    writeFileSync(notesFile, notes);
    execFileSync('gh', ['release', 'create', tag, asset, '--title', tag, '--notes-file', notesFile], {
      cwd,
      stdio: 'inherit',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<number> {
  const problem = checkTools();
  if (problem) {
    console.error(problem);
    return 1;
  }
  const prompter = ttyPrompter();
  const deps: ReleaseDeps = {
    cwd,
    prompter,
    claude: cliClaude({ cwd }),
    createGithubRelease,
    log: (line) => console.log(line),
    today: localDate,
    onInterrupt: () => process.exit(130),
  };
  const result = await runRelease(deps, { dryRun }).finally(() => prompter.close());
  return result === 'aborted' ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
