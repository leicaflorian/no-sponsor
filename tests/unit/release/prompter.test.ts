import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { ttyPrompter } from '../../../scripts/release/prompter';

function setup() {
  const input = new PassThrough();
  const output = new PassThrough();
  return { input, prompter: ttyPrompter({ input, output }) };
}

describe('ttyPrompter', () => {
  it('receives several answers written at once, in order', async () => {
    const { input, prompter } = setup();
    input.write('y\n\nsecond\nno\n');
    expect(await prompter.confirm('Merge?')).toBe(true);
    expect(await prompter.ask('Version', '1.0.1')).toBe('1.0.1');
    expect(await prompter.choose('Pick', ['first', 'second'])).toBe('second');
    expect(await prompter.confirm('Again?')).toBe(false);
    prompter.close();
  });

  it('rejects the pending question when the input ends', async () => {
    const { input, prompter } = setup();
    const pending = prompter.confirm('Merge?');
    input.end();
    await expect(pending).rejects.toThrow('Input closed');
  });

  it('rejects later questions after the input ended, but still serves buffered answers', async () => {
    const { input, prompter } = setup();
    input.end('y\n');
    expect(await prompter.confirm('One?')).toBe(true);
    await expect(prompter.confirm('Two?')).rejects.toThrow('Input closed');
  });
});
