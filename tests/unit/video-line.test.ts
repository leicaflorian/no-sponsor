import { describe, expect, it } from 'vitest';
import type { MessageKey } from '../../src/shared/i18n';
import { videoLine } from '../../src/shared/video-line';

// Stand-in for t(): the key, then the substitutions.
const tr = (key: MessageKey, ...subs: string[]) => [key, ...subs].join(':');
const info = (video: number) => ({ n: video, video, host: 'youtube.com', site: null });

describe('videoLine', () => {
  it('is hidden when no video ad was veiled', () => {
    expect(videoLine(info(0), tr)).toBeNull();
  });

  it('is hidden without page info', () => {
    expect(videoLine(null, tr)).toBeNull();
  });

  it('uses the singular for one ad', () => {
    expect(videoLine(info(1), tr)).toBe('popupVideoOne:1');
  });

  it('uses the plural for more ads', () => {
    expect(videoLine(info(3), tr)).toBe('popupVideoMany:3');
  });
});
