# CLAUDE.md

## Language

Everything in the repo is in English: code, comments, identifiers, test names, commit messages, the README, CI and this file. The documentation in the vault stays in Italian. User-facing UI strings are localized it/en from Phase 6 (browser language, English fallback). Conversation with the owner is in Italian.

## Superpowers

**Superpowers comes before anything else** (owner's rule, 13/10/2026). At the start of every conversation, and before any answer or action (even a clarifying question), invoke the `superpowers:using-superpowers` skill and follow the Superpowers skills that apply to the task. The plugin is installed in Claude Code (`/plugin`) and enabled for the project in `.claude/settings.json`, which is versioned so that a cloud session finds it too. How it is used in this project (ToDo items, worktree, TDD) is in the section *Superpowers in this project*, further below.

## Documentation

Project documentation is written as `.md` files in:

`/Users/florianleica/Library/CloudStorage/GoogleDrive-florian.leica@gmail.com/Il mio Drive/MyVault/Projects/No Sponsor (Extension)`

Do not create documentation in the repo (apart from this file, `README.md` and `CHANGELOG.md`). Versions and `CHANGELOG.md` are updated only by `npm run release`; feature commits on `dev` do not bump the version. The changelog is in English, written for users.

## Superpowers in this project

- **Phases**: the work follows the phases of `04 - Piano di lavoro.md` in the vault (folder given in *Documentation*), one phase at a time. For each phase `brainstorming` writes `Fasi/<Fase N - Titolo>/Analisi.md` and `writing-plans` writes `Fasi/<Fase N - Titolo>/Piano.md`, in the project folder in the vault, using the templates `Template/Template - Analisi.md` and `Template/Template - Piano d'azione.md`. The files in `docs/superpowers/` are not used. In the templates the `←` line points to `[[Projects/No Sponsor (Extension)/00 - Indice|Indice]]` and the properties `aree`, `concetti`, `funzioni`, `tecnica` collect the project notes the phase touches. Product choices go in the *Da decidere* section of the analysis, each with a recommendation and a `**Risposta:**` line, and are not asked one at a time. `writing-plans` starts only when all the answers are in. During development, tick off the steps of `Piano.md` and update `stato` in the two notes (`in corso`, then `da controllare`). The items of `04 - Piano di lavoro.md` are ticked off only after the owner's review. The vault notes are not in git and are not committed. If the vault cannot be read (for example in a cloud session), stop and say so.
- **Worktree**: `using-git-worktrees` creates the worktree in `.worktrees/`, which is ignored by git, on a new branch starting from `dev`. `finishing-a-development-branch` brings the work back into `dev` with a local merge. No push and no pull request unless requested, and never merge into `main`. The worktree lacks unversioned files, such as `node_modules`: run `npm install` before build and tests. The extension to try in Chrome is loaded from the worktree's build.
- **TDD**: test-first applies to the detector and engine logic (normalization, labels, containers, rules), with Vitest and the HTML fixtures. Behaviour on pages is verified with Playwright on the fixtures. The by-eye check on real sites is done by the owner. This is what `verification-before-completion` means here. Before Phase 0 there are no tests: while they are missing, say what was verified and how.
- **Before a commit**: `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e` green, and the vault documentation updated if the work changes what it describes (analysis, architecture, per-site strategies, plan, risks and decisions).

## Development

- **Stack**: WXT + TypeScript (strict), Vitest + happy-dom for unit tests, Playwright for e2e, ESLint + Prettier. Code lives in `src/` (`entrypoints/`, `engine/`, `rules/`, `shared/`); the commands are in `README.md`.
- **Node 22**: run `source ~/.nvm/nvm.sh && nvm use` before any `npm`/`npx` command. `npm install` also runs `wxt prepare`, which `typecheck` needs. The e2e tests need Playwright's Chromium (`npx playwright install chromium`): recent branded Chrome no longer loads extensions from the command line.
- **Behaviour is pinned by recordings**: `tests/fixtures/<site>/<page>.html` are cleaned snapshots of real pages, and `*.expected.json` record what 0.1.0 does on them (local tag `v0.1.0`). A change that alters what the extension marks must update the expected files on purpose, with `npm run record-expected -- --build` (it writes `since`, and the legacy run skips those pages), and say why; otherwise the e2e must stay green. Check every new or lost hit on the page before accepting it. Recordings are made on macOS, so CI runs on `macos-latest`.
- **Saving a page**: `npm run snapshot -- <site> <page> <url> [--manual]`, then `npm run record-expected -- <site>/<page>`. Sites that show a captcha need `--manual`, which only the owner can do (it waits for Enter in their terminal). Snapshots must contain no personal data: fresh profile, no login, and the script scrubs Amazon's delivery location and Google's IP-based postcode; the addresses it prints as a warning (e.g. Google's local results) must be neutralized by hand before committing.
- **Merging into `dev`**: the owner decides; for a phase branch prefer a squash merge with one English commit message.
