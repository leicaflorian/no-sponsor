// Git and shell helpers for the release script. Every function takes the working directory.
import { execFileSync, spawnSync } from 'node:child_process';

// Runs git with an argument array (never a shell string). Returns trimmed stdout;
// on failure throws an Error whose message includes git's stderr.
export function git(cwd: string, ...args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? '').trim();
    const reason = stderr || (error instanceof Error ? error.message : String(error));
    throw new Error(`git ${args.join(' ')} failed: ${reason}`, { cause: error });
  }
}

export function currentBranch(cwd: string): string {
  return git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD');
}

export function isClean(cwd: string): boolean {
  return git(cwd, 'status', '--porcelain') === '';
}

// Fetches the branch, then compares the local and the remote-tracking branch.
export function isInSyncWithRemote(cwd: string, remote: string, branch: string): boolean {
  git(cwd, 'fetch', remote, branch);
  const local = git(cwd, 'rev-parse', `refs/heads/${branch}`);
  const remoteSha = git(cwd, 'rev-parse', `refs/remotes/${remote}/${branch}`);
  return local === remoteSha;
}

// Latest version tag (v<digit>...) reachable from HEAD, or null when there is none.
export function lastTag(cwd: string): string | null {
  try {
    return git(cwd, 'describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*');
  } catch {
    return null;
  }
}

// "<short sha> <subject>" lines since `ref` (all commits when ref is null).
export function commitsSince(cwd: string, ref: string | null): string[] {
  const range = ref ? [`${ref}..HEAD`] : ['HEAD'];
  const out = git(cwd, 'log', '--format=%h %s', ...range);
  return out === '' ? [] : out.split('\n');
}

// The one place that runs a configured shell command string.
export function runShell(cwd: string, command: string): void {
  const result = spawnSync(command, { shell: true, stdio: 'inherit', cwd });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Command "${command}" was killed by ${result.signal}`);
  if (result.status !== 0) throw new Error(`Command "${command}" exited with code ${result.status}`);
}
