# CLAUDE.md

## Superpowers

**Prima di qualsiasi altra cosa si usa Superpowers** (regola del proprietario, 13/10/2026). All'inizio di ogni conversazione, e prima di ogni risposta o azione (anche una domanda di chiarimento), si richiama la skill `superpowers:using-superpowers` e si seguono le skill di Superpowers che riguardano il compito. Il plugin è installato in Claude Code (`/plugin`) e abilitato per il progetto in `.claude/settings.json`, che è versionato perché lo trovi anche una sessione nel cloud. Come si usa in questo progetto (voci del ToDo, worktree, TDD) è nella sezione *Superpowers in questo progetto*, più sotto.

## Documentazione

La documentazione del progetto va scritta come file `.md` in:

`/Users/florianleica/Library/CloudStorage/GoogleDrive-florian.leica@gmail.com/Il mio Drive/MyVault/Projects/No Sponsor (Extension)`

Non creare documentazione nel repo (a parte questo file e il `README.md`).

## Superpowers in questo progetto

- **Le fasi**: il lavoro segue le fasi di `04 - Piano di lavoro.md` nel vault (cartella in *Documentazione*), una fase alla volta. Per ogni fase `brainstorming` scrive `Fasi/<Fase N - Titolo>/Analisi.md` e `writing-plans` scrive `Fasi/<Fase N - Titolo>/Piano.md`, nella cartella del progetto nel vault, con i modelli `Template/Template - Analisi.md` e `Template/Template - Piano d'azione.md`. Non si usano i file in `docs/superpowers/`. Nei modelli la riga `←` punta a `[[Projects/No Sponsor (Extension)/00 - Indice|Indice]]` e le proprietà `aree`, `concetti`, `funzioni`, `tecnica` raccolgono le note del progetto che la fase tocca. Le scelte di prodotto vanno nella sezione *Da decidere* dell'analisi, ognuna con un consiglio e una riga `**Risposta:**`, e non si chiedono una alla volta. `writing-plans` parte solo quando tutte le risposte ci sono. Durante lo sviluppo si spuntano i passi di `Piano.md` e si aggiorna `stato` nelle due note (`in corso`, poi `da controllare`). Le voci di `04 - Piano di lavoro.md` si spuntano solo dopo il controllo del proprietario. Le note del vault non sono in git e non si committano. Se il vault non si legge (per esempio in una sessione nel cloud), ci si ferma e lo si dice.
- **Worktree**: `using-git-worktrees` crea il worktree in `.worktrees/`, che è ignorata da git, su un branch nuovo che parte da `dev`. `finishing-a-development-branch` riporta il lavoro in `dev` con un merge locale. Niente push e niente pull request, salvo richiesta, e mai merge in `main`. Nel worktree mancano i file non versionati, come `node_modules`: prima di build e test si lancia `npm install`. L'estensione da provare in Chrome si carica dalla build del worktree.
- **TDD**: il test prima del codice vale per la logica dei rilevatori e del motore (normalizzazione, etichette, contenitori, regole), con Vitest e le fixture HTML. Il comportamento sulle pagine si verifica con Playwright sulle fixture. Il controllo a occhio sui siti veri lo fa il proprietario. È questo che vuol dire `verification-before-completion` qui. Prima della Fase 0 non ci sono test: finché mancano, si dice cosa si è verificato e come.
- **Prima di un commit**: lint e test verdi (quando ci sono, dalla Fase 0) e la documentazione del vault aggiornata se il lavoro cambia ciò che descrive (analisi, architettura, strategie per sito, piano, rischi e decisioni).
