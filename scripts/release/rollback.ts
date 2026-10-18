// Puts the local git state back when the release fails before the first push.
import { currentBranch, git } from './git';

export class Rollback {
  private readonly startSha: string;
  private tag: string | null = null;
  private hasPushed = false;

  constructor(
    private readonly cwd: string,
    private readonly branch: string,
  ) {
    this.startSha = git(cwd, 'rev-parse', `refs/heads/${branch}`);
  }

  tagCreated(tag: string): void {
    this.tag = tag;
  }

  // From now on restore() only returns instructions: remote state cannot be undone locally.
  pushed(): void {
    this.hasPushed = true;
  }

  // Returns what it did (or why it did nothing), for the log.
  restore(): string[] {
    const short = this.startSha.slice(0, 7);
    if (this.hasPushed) {
      const head = git(this.cwd, 'rev-parse', '--short', 'HEAD');
      const lines = [
        `Already pushed: nothing was undone locally. Branch "${this.branch}" was at ${short} before the release; it is now at ${head}.`,
      ];
      if (this.tag) lines.push(`Tag ${this.tag} was pushed.`);
      lines.push(
        'Finish the remaining release steps by hand, or revert the pushed commit and tag on the remote yourself.',
      );
      return lines;
    }

    const log: string[] = [];
    // Guards first: only touch anything when HEAD is still on our branch and descends from
    // the recorded commit, so we never throw away work someone did elsewhere.
    if (currentBranch(this.cwd) !== this.branch) {
      log.push(`Not resetting: the current branch is not "${this.branch}" anymore.`);
      return log;
    }
    try {
      git(this.cwd, 'merge-base', '--is-ancestor', this.startSha, 'HEAD');
    } catch {
      log.push(`Not resetting: HEAD does not descend from ${short} (history changed).`);
      return log;
    }
    if (this.tag) {
      try {
        git(this.cwd, 'tag', '-d', this.tag);
        log.push(`Deleted tag ${this.tag}.`);
      } catch {
        log.push(`Tag ${this.tag} could not be deleted (already gone?).`);
      }
    }
    // Only `reset --hard`: untracked files are not cleaned. The flow starts from a clean tree,
    // and any untracked file may belong to the user.
    git(this.cwd, 'reset', '--hard', this.startSha);
    log.push(`Reset "${this.branch}" to ${short}.`);
    return log;
  }
}
