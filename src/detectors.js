/*
 * Rilevatori per sito.
 *
 * Ogni rilevatore descrive DOVE e COME trovare i contenuti sponsorizzati:
 *
 *   id, name    identificativo e nome mostrato nel popup
 *   match       regex sull'hostname
 *   selectors   elementi sponsorizzati noti. Ogni voce è:
 *                 "selettore"                       -> marca l'elemento trovato
 *                 ["selettore", "contenitore"]      -> marca el.closest(contenitore)
 *   labels      etichette testuali (minuscole). Match esatto sul testo normalizzato;
 *               se finisce con "*" basta che il testo inizi così.
 *   container   lista ordinata di selettori: quando trovo un'etichetta risalgo al
 *               primo antenato che corrisponde (in ordine di priorità).
 *   scope       dove cercare le etichette (default: tutto il body)
 *   obfuscated  il sito spezza/nasconde le lettere dell'etichetta: leggo solo il
 *               testo realmente visibile, nell'ordine in cui appare a schermo.
 *
 * Quando un sito cambia layout di solito basta aggiornare questo file.
 */

// Slot pubblicitari "display" standard (Google Publisher Tag, AdSense).
// Applicati su tutti i siti supportati e, se attivo, in modalità generica.
self.NSP_AD_SELECTORS = [
  '[data-google-query-id]',
  '[id^="div-gpt-ad"]',
  '[id^="google_ads_iframe"]',
  'ins.adsbygoogle'
];

self.NSP_SITES = [
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
      '.pla-unit'
    ],
    labels: [
      'sponsorizzato', 'sponsorizzata', 'sponsorizzati',
      'prodotti sponsorizzati*', 'risultati sponsorizzati*',
      'sponsored', 'sponsored products*', 'sponsored results*',
      'annuncio', 'annunci', 'anzeige', 'gesponsert', 'sponsorisé'
    ],
    container: [
      '[data-text-ad]', '.pla-unit', '.cu-container',
      '.commercial-unit-desktop-top', '.MjjYud', '.g', '[data-hveid]'
    ],
    scope: '#rcnt, #center_col, #rhs, #botstuff'
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
      '#sp_detail', '#sp_detail2', '[data-cel-widget^="sp_detail"]',
      '[id^="ape_"][id$="_placement"]'
    ],
    labels: [
      'sponsorizzato', 'sponsorizzata', 'sponsorizzati',
      'prodotti sponsorizzati*', 'sponsored', 'sponsored products*',
      'gesponsert', 'sponsorisé', 'patrocinado'
    ],
    container: [
      '[data-component-type="s-search-result"]',
      '.a-carousel-card',
      '.a-carousel-container',
      '.s-result-item',
      '.celwidget'
    ],
    scope: '#search, #dp-container, #ppd, #centerCol, #rightCol, #a-page'
  },

  {
    id: 'subito',
    name: 'Subito.it',
    match: /(^|\.)subito\.it$/,
    selectors: [],
    // Attenzione: "annuncio" su Subito è la parola normale per un'inserzione,
    // quindi NON va tra le etichette. "Vetrina" e "In evidenza" sono
    // promozioni a pagamento dei venditori.
    labels: [
      'vetrina', 'in vetrina', 'in evidenza', 'evidenza',
      'sponsorizzato', 'annuncio sponsorizzato', 'pubblicità'
    ],
    container: [
      '[class*="item-card"]',
      '[class*="SmallCard"]',
      '[class*="BigCard"]',
      '[class*="items__item"]',
      'article',
      'li'
    ]
  },

  {
    id: 'ebay',
    name: 'eBay',
    match: /(^|\.)ebay\.[a-z]{2,3}(\.[a-z]{2})?$/,
    selectors: [],
    labels: [
      'sponsorizzato', 'sponsorizzata', 'sponsored', 'gesponsert',
      'sponsorisé', 'patrocinado',
      'articoli sponsorizzati*', 'sponsored items*', 'gesponserte artikel*'
    ],
    container: [
      'li.s-item', 'li.s-card', '.s-item', '.s-card',
      '[data-viewport]', 'section', 'li'
    ],
    obfuscated: true
  }
];

// Modalità generica: qualunque altro sito, solo etichette inequivocabili.
self.NSP_GENERIC = {
  id: 'generic',
  name: 'Rilevamento generico',
  selectors: [],
  labels: [
    'sponsorizzato', 'sponsorizzata', 'contenuto sponsorizzato',
    'sponsored', 'sponsored content', 'promoted', 'promosso', 'promossa',
    'gesponsert', 'anzeige', 'sponsorisé', 'patrocinado', 'publicidad',
    'pubblicità', 'advertisement'
  ],
  container: ['article', '[role="article"]', 'li', '[class*="card" i]']
};
