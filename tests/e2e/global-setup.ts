import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { LEGACY_DIR, ROOT } from './harness';

// Extracts 0.1.0 from the v0.1.0 tag into a cache folder, recreated from scratch on every run.
export function prepareLegacy(): void {
  rmSync(LEGACY_DIR, { recursive: true, force: true });
  mkdirSync(LEGACY_DIR, { recursive: true });
  execSync(`git archive v0.1.0 | tar -x -C "${LEGACY_DIR}"`, { cwd: ROOT, stdio: 'inherit' });
}

export default function globalSetup(): void {
  if (process.env['NSP_EXT'] === 'legacy') prepareLegacy();
}
