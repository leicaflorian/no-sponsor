import { execFileSync } from 'node:child_process';
import { CHROMIUM_DEFAULTS_DOMAIN } from './harness';

// Removes the language that launch() wrote in the preferences of Playwright's Chromium (macOS).
export default function globalTeardown(): void {
  if (process.platform !== 'darwin') return;
  try {
    execFileSync('defaults', ['delete', CHROMIUM_DEFAULTS_DOMAIN, 'AppleLanguages'], { stdio: 'ignore' });
  } catch {
    // never set
  }
}
