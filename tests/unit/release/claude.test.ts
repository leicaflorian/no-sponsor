// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { changelogPrompt, ClaudeError, parseStructured, versionPrompt } from '../../../scripts/release/claude';

// Real output of `claude -p --model sonnet --output-format json --json-schema ...` (claude 2.1.302), trimmed.
const SAMPLE =
  '{"type":"result","subtype":"success","is_error":false,"duration_ms":1921,"num_turns":2,"result":"{\\"ok\\":true}","structured_output":{"ok":true},"session_id":"815d37f3-42e1-47d1-9bc3-9cf14e4def40","total_cost_usd":0.120256,"permission_denials":[],"terminal_reason":"completed"}';

describe('versionPrompt', () => {
  const prompt = versionPrompt({
    lastTag: 'v1.0.11',
    commits: ['abc1234 feat: add a thing', 'def5678 fix: repair another'],
    policy: 'Closing a phase bumps the minor version.',
  });

  it('contains the last tag, every commit and the policy', () => {
    expect(prompt).toContain('v1.0.11');
    expect(prompt).toContain('abc1234 feat: add a thing');
    expect(prompt).toContain('def5678 fix: repair another');
    expect(prompt).toContain('Closing a phase bumps the minor version.');
  });

  it('asks for a version higher than the last tag', () => {
    expect(prompt).toMatch(/higher than v1\.0\.11/);
  });
});

describe('changelogPrompt', () => {
  const prompt = changelogPrompt({
    version: '1.0.12',
    date: '2026-10-18',
    lastTag: 'v1.0.11',
    changelogPath: '/repo/CHANGELOG.md',
    docs: ['README.md', 'docs/guide.md'],
    storeTexts: ['/store/description.txt', '/store/privacy.txt'],
  });

  it('contains the heading, the commit range and the changelog path', () => {
    expect(prompt).toContain('## [1.0.12] - 2026-10-18');
    expect(prompt).toContain('v1.0.11..HEAD');
    expect(prompt).toContain('/repo/CHANGELOG.md');
    expect(prompt).toContain('follow the format of the existing sections, English, written for users');
  });

  it('lists every doc and store text', () => {
    for (const f of ['README.md', 'docs/guide.md', '/store/description.txt', '/store/privacy.txt']) {
      expect(prompt).toContain(f);
    }
  });

  it('asks to flag new permissions, network requests and stored data as privacy', () => {
    expect(prompt).toMatch(/permission/i);
    expect(prompt).toMatch(/network request/i);
    expect(prompt).toMatch(/stored data|data (is |being )?(saved|stored)|saved data/i);
    expect(prompt).toContain('privacy');
  });
});

describe('parseStructured', () => {
  it('returns the structured output of a successful run', () => {
    expect(parseStructured<{ ok: boolean }>(SAMPLE)).toEqual({ ok: true });
  });

  it('throws ClaudeError with the error text when is_error is true', () => {
    const out = JSON.stringify({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      result: 'Credit balance is too low',
    });
    expect(() => parseStructured(out)).toThrow(ClaudeError);
    expect(() => parseStructured(out)).toThrow('Credit balance is too low');
  });

  it('throws ClaudeError when structured_output is missing', () => {
    const out = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'hello' });
    expect(() => parseStructured(out)).toThrow(ClaudeError);
  });

  it('throws ClaudeError on text that is not JSON', () => {
    expect(() => parseStructured('not json at all')).toThrow(ClaudeError);
  });
});
