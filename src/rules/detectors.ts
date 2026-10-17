/*
 * Per-site detectors.
 *
 * Each detector describes WHERE and HOW to find sponsored content:
 *
 *   id, name    identifier and name shown in the popup
 *   match       regex on the hostname
 *   selectors   known sponsored elements. Each entry is:
 *                 "selector"                        -> marks the element found
 *                 ["selector", "container"]         -> marks el.closest(container)
 *   labels      text labels (lowercase). Exact match on the normalized text;
 *               if it ends with "*" the text only has to start with it.
 *   container   ordered list of selectors: when a label is found, go up to the
 *               first matching ancestor (in priority order).
 *   scope       where to look for labels (default: the whole body)
 *   obfuscated  the site splits/hides the letters of the label: only the
 *               actually visible text is read, in the order it appears on screen.
 *
 * When a site changes layout, updating this file is usually enough.
 */

import type { Detector, SiteDetector } from './types';

// Standard "display" ad slots (Google Publisher Tag, AdSense).
// Applied on all supported sites and, when enabled, in generic mode.
export const AD_SELECTORS: string[] = [
  '[data-google-query-id]',
  '[id^="div-gpt-ad"]',
  '[id^="google_ads_iframe"]',
  'ins.adsbygoogle',
];

export const SITES: SiteDetector[] = [
  {
    id: 'google',
    name: 'Google',
    match: /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/,
    selectors: [
      '#tads',
      '#tadsb',
      '#bottomads',
      '[data-text-ad]',
      '.commercial-unit-desktop-top',
      '.commercial-unit-desktop-rhs',
      '.cu-container',
      '.pla-unit',
    ],
    labels: [
      'sponsorizzato',
      'sponsorizzata',
      'sponsorizzati',
      'prodotti sponsorizzati*',
      'risultati sponsorizzati*',
      'sponsored',
      'sponsored products*',
      'sponsored results*',
      'annuncio',
      'annunci',
      'anzeige',
      'gesponsert',
      'sponsorisé',
    ],
    container: [
      '[data-text-ad]',
      '.pla-unit',
      '.cu-container',
      '.commercial-unit-desktop-top',
      '.MjjYud',
      '.g',
      '[data-hveid]',
    ],
    scope: '#rcnt, #center_col, #rhs, #botstuff',
  },

  {
    id: 'amazon',
    name: 'Amazon',
    match: /(^|\.)amazon\.[a-z]{2,3}(\.[a-z]{2})?$/,
    selectors: [
      '.AdHolder',
      ['[data-component-type="sp-sponsored-result"]', '[data-component-type="s-search-result"]'],
      ['.puis-sponsored-label-text', '[data-component-type="s-search-result"], .a-carousel-card'],
      ['.s-sponsored-label-info-icon', '[data-component-type="s-search-result"], .a-carousel-card'],
      '#sp_detail',
      '#sp_detail2',
      '[data-cel-widget^="sp_detail"]',
      '[id^="ape_"][id$="_placement"]',
    ],
    labels: [
      'sponsorizzato',
      'sponsorizzata',
      'sponsorizzati',
      'prodotti sponsorizzati*',
      'sponsored',
      'sponsored products*',
      'gesponsert',
      'sponsorisé',
      'patrocinado',
    ],
    container: [
      '[data-component-type="s-search-result"]',
      '.a-carousel-card',
      // Home and widget cards: a single product first, then the whole card. Without these the
      // label only reaches a .celwidget wrapping the whole page section, too large to mark.
      // Note: being earlier in the list, a small .a-cardui also outranks a carousel or result inside it.
      '[class*="_asin-container__"]',
      '.a-cardui',
      '.a-carousel-container',
      '.s-result-item',
      '.celwidget',
    ],
    scope: '#search, #dp-container, #ppd, #centerCol, #rightCol, #a-page',
  },

  {
    id: 'subito',
    name: 'Subito.it',
    match: /(^|\.)subito\.it$/,
    selectors: [],
    // Careful: "annuncio" on Subito is the ordinary word for a listing,
    // so it must NOT be among the labels. "Vetrina" and "In evidenza" are
    // paid promotions by sellers.
    labels: [
      'vetrina',
      'in vetrina',
      'in evidenza',
      'evidenza',
      'sponsorizzato',
      'annuncio sponsorizzato',
      'pubblicità',
    ],
    container: [
      '[class*="item-card"]',
      '[class*="SmallCard"]',
      '[class*="BigCard"]',
      '[class*="items__item"]',
      'article',
      'li',
    ],
  },

  {
    id: 'ebay',
    name: 'eBay',
    match: /(^|\.)ebay\.[a-z]{2,3}(\.[a-z]{2})?$/,
    selectors: [],
    labels: [
      'sponsorizzato',
      'sponsorizzata',
      'sponsored',
      'gesponsert',
      'sponsorisé',
      'patrocinado',
      'articoli sponsorizzati*',
      'sponsored items*',
      'gesponserte artikel*',
    ],
    container: ['li.s-item', 'li.s-card', '.s-item', '.s-card', '[data-viewport]', 'section', 'li'],
    obfuscated: true,
  },
];

// Generic mode: any other site, unambiguous labels only.
export const GENERIC: Detector = {
  id: 'generic',
  name: 'Rilevamento generico',
  selectors: [],
  labels: [
    'sponsorizzato',
    'sponsorizzata',
    'contenuto sponsorizzato',
    'sponsored',
    'sponsored content',
    'promoted',
    'promosso',
    'promossa',
    'gesponsert',
    'anzeige',
    'sponsorisé',
    'patrocinado',
    'publicidad',
    'pubblicità',
    'advertisement',
  ],
  container: ['article', '[role="article"]', 'li', '[class*="card" i]'],
};

// First detector whose `match` matches the hostname (regexes only).
export function findSite(hostname: string): SiteDetector | null {
  return SITES.find((s) => s.match.test(hostname)) || null;
}
