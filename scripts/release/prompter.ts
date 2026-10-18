// Terminal prompts for the release script.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';

export interface Prompter {
  confirm(question: string): Promise<boolean>; // [y/N]
  ask(question: string, fallback?: string): Promise<string>;
  choose<T extends string>(question: string, options: T[]): Promise<T>;
  edit(text: string): Promise<string>; // $VISUAL || $EDITOR || 'vi', through a temp file
}

export interface TtyPrompter extends Prompter {
  close(): void; // releases stdin so the process can end
}

export function ttyPrompter(io: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream } = {}): TtyPrompter {
  const input = io.input ?? process.stdin;
  const output = io.output ?? process.stdout;
  // One interface for every question: with piped input, a new interface per question would swallow
  // the lines that arrive together with the first answer.
  let rl: readline.Interface | null = null;
  let closed = false;
  const buffered: string[] = [];
  let waiting: { resolve(line: string): void; reject(error: Error): void } | null = null;

  function open(): readline.Interface {
    if (rl) return rl;
    rl = readline.createInterface({ input, output });
    // readline catches Ctrl+C and only pauses: send the signal on, so the release's handler runs.
    rl.on('SIGINT', () => process.kill(process.pid, 'SIGINT'));
    rl.on('line', (text) => {
      if (waiting) {
        const { resolve } = waiting;
        waiting = null;
        resolve(text.trim());
      } else {
        buffered.push(text.trim());
      }
    });
    rl.on('close', () => {
      closed = true;
      waiting?.reject(new Error('Input closed'));
      waiting = null;
    });
    return rl;
  }

  function line(question: string): Promise<string> {
    const iface = open();
    // The last line is the readline prompt, so it is what readline repaints on backspace or arrows
    // (its default prompt is "> ").
    const lines = question.split('\n');
    const prompt = lines.pop() ?? '';
    if (lines.length) output.write(`${lines.join('\n')}\n`);
    iface.setPrompt(prompt);
    iface.prompt();
    const next = buffered.shift();
    if (next !== undefined) return Promise.resolve(next);
    if (closed) return Promise.reject(new Error('Input closed'));
    return new Promise((resolve, reject) => {
      waiting = { resolve, reject };
    });
  }

  return {
    close() {
      rl?.close();
    },
    async confirm(question) {
      return /^y(es)?$/i.test(await line(`${question} [y/N] `));
    },
    async ask(question, fallback) {
      const answer = await line(fallback ? `${question} [${fallback}] ` : `${question} `);
      return answer || fallback || '';
    },
    async choose(question, options) {
      for (;;) {
        const list = options.map((option, i) => `  ${i + 1}) ${option}`).join('\n');
        const answer = await line(`${question}\n${list}\n> `);
        const byNumber = options[Number(answer) - 1];
        if (byNumber) return byNumber;
        const byName = options.find((option) => option === answer);
        if (byName) return byName;
      }
    },
    async edit(text) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-'));
      const file = path.join(dir, 'edit.md');
      try {
        fs.writeFileSync(file, text);
        const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
        const result = spawnSync(`${editor} "${file}"`, { stdio: 'inherit', shell: true });
        if (result.status !== 0) throw new Error(`Editor "${editor}" exited with code ${result.status}`);
        return fs.readFileSync(file, 'utf8');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
