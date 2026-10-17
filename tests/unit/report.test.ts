import { describe, expect, it } from 'vitest';
import type { MessageKey } from '../../src/shared/i18n';
import { buildReportUrl, REPORT_BASE } from '../../src/shared/report';
import { DEFAULTS } from '../../src/shared/settings';

// Stand-in for t(): the key, then the substitutions.
const tr = (key: MessageKey, ...subs: string[]) => [key, ...subs].join(':');
const body = (url: string) => new URL(url).searchParams.get('body') ?? '';
const title = (url: string) => new URL(url).searchParams.get('title');

describe('buildReportUrl', () => {
  it('opens a new issue on the repository', () => {
    const url = new URL(buildReportUrl(DEFAULTS, null, '1.2.3', tr));
    expect(`${url.origin}${url.pathname}`).toBe(REPORT_BASE);
  });

  it('reports the page state', () => {
    const url = buildReportUrl(
      { mode: 'hide', generic: false, disabledHosts: ['www.amazon.it'] },
      { n: 3, host: 'www.amazon.it', site: 'amazon' },
      '1.2.3',
      tr,
    );
    expect(title(url)).toBe('reportTitle:www.amazon.it');
    const b = body(url);
    expect(b).toContain('reportPrompt');
    expect(b).toContain('Version: 1.2.3');
    expect(b).toContain('Site: www.amazon.it');
    expect(b).toContain('Detector: amazon');
    expect(b).toContain('Items found: 3');
    expect(b).toContain('Mode: hide');
    expect(b).toContain('Generic detection: off');
    expect(b).toContain('Off on this site: yes');
  });

  it('works without page info', () => {
    const url = buildReportUrl(DEFAULTS, null, '1.2.3', tr);
    expect(title(url)).toBe('reportTitleNoPage');
    const b = body(url);
    expect(b).toContain('Version: 1.2.3');
    expect(b).toContain('Site: not scanned');
    expect(b).toContain('Mode: highlight');
  });

  it('encodes the query so the body survives the round trip', () => {
    const url = buildReportUrl(DEFAULTS, { n: 0, host: 'a&b=c.example', site: null }, '1.2.3', tr);
    expect(url).not.toContain(' ');
    expect(body(url)).toContain('Site: a&b=c.example');
  });
});
