// Asks Claude (through the `claude` CLI in print mode) for the next version and the CHANGELOG draft.
// Part of the self-contained scripts/release/ folder: it imports only node:* and its own files.
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';

export interface VersionSuggestion {
  version: string;
  reason: string;
}
export interface Notice {
  kind: 'readme' | 'store' | 'privacy' | 'other';
  file: string;
  reason: string;
}
export interface ChangelogDraft {
  section: string;
  notices: Notice[];
}
export interface Claude {
  suggestVersion(input: { lastTag: string; commits: string[]; policy: string }): Promise<VersionSuggestion>;
  draftChangelog(input: {
    version: string;
    date: string;
    lastTag: string;
    changelogPath: string;
    docs: string[];
    storeTexts: string[];
  }): Promise<ChangelogDraft>;
}

export class ClaudeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaudeError';
  }
}

const VERSION_SCHEMA = {
  type: 'object',
  properties: {
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    reason: { type: 'string' },
  },
  required: ['version', 'reason'],
};

const CHANGELOG_SCHEMA = {
  type: 'object',
  properties: {
    section: { type: 'string' },
    notices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['readme', 'store', 'privacy', 'other'] },
          file: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['kind', 'file', 'reason'],
      },
    },
  },
  required: ['section', 'notices'],
};

export function versionPrompt(input: Parameters<Claude['suggestVersion']>[0]): string {
  return [
    `You are helping to release a new version of a project. The last released tag is ${input.lastTag}.`,
    `Suggest the next version number (MAJOR.MINOR.PATCH, no "v" prefix). It must be higher than ${input.lastTag}.`,
    '',
    'Versioning policy:',
    input.policy,
    '',
    `Commits since ${input.lastTag}:`,
    ...input.commits.map((c) => `- ${c}`),
    '',
    'You may inspect the repository with the read-only tools (git log, git show, git diff) if a commit message is unclear.',
    'Answer with the version and a one-sentence reason.',
  ].join('\n');
}

export function changelogPrompt(input: Parameters<Claude['draftChangelog']>[0]): string {
  const list = (items: string[]): string[] => (items.length ? items.map((f) => `- ${f}`) : ['- (none)']);
  return [
    `You are preparing the release of version ${input.version}. The last released tag is ${input.lastTag}.`,
    '',
    `1. Write the new CHANGELOG section for the changes in the range ${input.lastTag}..HEAD (use git log, git show and git diff to read them).`,
    `The section must start with the heading "## [${input.version}] - ${input.date}".`,
    `Read ${input.changelogPath} and follow the format of the existing sections, English, written for users (what changes for them, not internal details).`,
    'Return the whole section as Markdown in "section".',
    '',
    '2. Check whether these files are now outdated because of the changes, and report each problem as a notice (kind "readme" for repository docs, "store" for Chrome Web Store texts, "other" otherwise):',
    'Repository docs:',
    ...list(input.docs),
    'Store texts:',
    ...list(input.storeTexts),
    '',
    '3. Report separately, with kind "privacy", anything in the changes that adds a new permission, a new network request or new saved data (stored data), because the privacy policy and the store privacy answers may need an update. Name the file or manifest entry involved.',
    '',
    'Return an empty "notices" list if nothing needs attention. Do not modify any file.',
  ].join('\n');
}

interface CliResult {
  is_error?: boolean;
  subtype?: string;
  result?: unknown;
  structured_output?: unknown;
}

export function parseStructured<T>(stdout: string): T {
  let parsed: CliResult;
  try {
    parsed = JSON.parse(stdout) as CliResult;
  } catch {
    throw new ClaudeError(`Claude returned output that is not JSON: ${stdout.slice(0, 300)}`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ClaudeError(`Claude returned unexpected output: ${stdout.slice(0, 300)}`);
  }
  if (parsed.is_error) {
    const text =
      typeof parsed.result === 'string' && parsed.result ? parsed.result : (parsed.subtype ?? 'unknown error');
    throw new ClaudeError(`Claude reported an error: ${text}`);
  }
  if (parsed.structured_output === undefined || parsed.structured_output === null) {
    throw new ClaudeError('Claude answered without a structured_output');
  }
  return parsed.structured_output as T;
}

export function cliClaude(opts: { bin?: string; cwd: string }): Claude {
  const bin = opts.bin ?? process.env.RELEASE_CLAUDE_BIN ?? 'claude';

  function run<T>(prompt: string, schema: object, addDirs: string[] = []): T {
    const args = [
      '-p',
      prompt,
      '--model',
      'sonnet',
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(schema),
      '--tools',
      'Read,Grep,Glob,Bash',
      '--allowed-tools',
      'Read',
      'Grep',
      'Glob',
      'Bash(git log:*)',
      'Bash(git show:*)',
      'Bash(git diff:*)',
      ...addDirs.flatMap((d) => ['--add-dir', d]),
    ];
    const res = spawnSync(bin, args, { cwd: opts.cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (res.error) {
      throw new ClaudeError(`Cannot run "${bin}": ${res.error.message}`);
    }
    if (res.status !== 0) {
      const detail = (res.stderr || res.stdout || '').trim().slice(0, 1000);
      throw new ClaudeError(`"${bin}" exited with code ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    return parseStructured<T>(res.stdout);
  }

  return {
    async suggestVersion(input) {
      return run<VersionSuggestion>(versionPrompt(input), VERSION_SCHEMA);
    },
    async draftChangelog(input) {
      const dirs = [...new Set(input.storeTexts.map((f) => dirname(f)))];
      return run<ChangelogDraft>(changelogPrompt(input), CHANGELOG_SCHEMA, dirs);
    },
  };
}
