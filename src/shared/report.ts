// Link for "Report a problem": a new GitHub issue prefilled with the popup state.
import type { MessageKey } from './i18n';
import type { PageInfo } from './messages';
import type { Settings } from './settings';

export const REPORT_BASE = 'https://github.com/leicaflorian/no-sponsor/issues/new';

// Title and prompt in the user's language (t() in the popup); the details stay in English,
// like the repository, so every report reads the same.
// Only the host goes in the report, never the full URL: it may carry queries or personal data.
export function buildReportUrl(
  settings: Settings,
  page: PageInfo | null,
  version: string,
  tr: (key: MessageKey, ...subs: string[]) => string,
): string {
  const lines = [
    `**${tr('reportPrompt')}**`,
    '',
    '',
    '',
    '---',
    `- Version: ${version}`,
    `- Site: ${page ? page.host : 'not scanned'}`,
    `- Detector: ${page ? (page.site ?? 'generic / none') : '–'}`,
    `- Items found: ${page ? page.n : '–'}`,
    `- Mode: ${settings.mode}`,
    `- Generic detection: ${settings.generic ? 'on' : 'off'}`,
    `- Off on this site: ${page && settings.disabledHosts.includes(page.host) ? 'yes' : 'no'}`,
  ];
  const title = page ? tr('reportTitle', page.host) : tr('reportTitleNoPage');
  const query = new URLSearchParams({ title, body: lines.join('\n') });
  return `${REPORT_BASE}?${query}`;
}
