# NoSponsor

Estensione Chrome (Manifest V3) che trova i contenuti sponsorizzati e li **evidenzia**, li **comprime** in una barra cliccabile oppure li **nasconde**.

Rilevatori dedicati: **Google, Amazon, Subito.it, eBay**. Sugli altri siti c'è un rilevamento generico (disattivabile) basato sulle etichette "Sponsorizzato", "Sponsored", "Pubblicità"… e sugli slot pubblicitari standard (Google Publisher Tag, AdSense).

## Installazione (sviluppo)

1. Estrai lo zip.
2. Apri `chrome://extensions` e attiva **Modalità sviluppatore**.
3. **Carica estensione non pacchettizzata** → seleziona la cartella `nosponsor`.
4. Ricarica le schede già aperte.

## Struttura

```
manifest.json
background.js        contatore sull'icona, per scheda
src/detectors.js     ← regole per sito: quasi tutta la manutenzione si fa qui
src/content.js       scansione, MutationObserver, impostazioni
src/content.css      le tre modalità
popup/               modalità, attivazione per sito, rilevamento generico
```

## Come funziona

- Il content script **non rimuove nodi**: aggiunge la classe `.nsp-hit` e il CSS fa il resto in base a `<html data-nsp-mode="highlight|collapse|hide|off">`. Così React/Vue non si rompono e il cambio modalità è istantaneo.
- Tre strategie per sito: **selettori noti**, **etichette testuali** (risalendo al contenitore della card) e, sui siti che offuscano, il **testo realmente visibile** ricostruito nell'ordine a schermo (lettere nascoste via CSS o riordinate con `order`) più `aria-labelledby`.
- Un `MutationObserver` con debounce copre scroll infinito e contenuti caricati dopo.
- Ogni elemento marcato ha `data-nsp-reason` con la regola che l'ha trovato: utile in DevTools per capire falsi positivi.

## Debug rapido

In DevTools su una pagina:

```js
[...document.querySelectorAll('.nsp-hit')].map(e => e.dataset.nspReason)
```

## Note

- Su Subito "annuncio" è la parola normale per un'inserzione, quindi non è tra le etichette; "Vetrina" e "In evidenza" (promozioni a pagamento) sì.
- I selettori dei siti cambiano nel tempo: se qualcosa smette di funzionare, ispeziona la card e aggiorna `src/detectors.js`.
