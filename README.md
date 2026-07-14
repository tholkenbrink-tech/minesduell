# MinesDuell

A local multiplayer Minesweeper party game for 2–4 players sharing one device — no accounts, no server, works fully offline once installed. Built as an installable PWA with React, TypeScript, Vite, and Zustand.

## Modes

- **Duel** — Players compete on one shared board, racing to correctly flag mines. Turns pass on mistakes; a correct flag or a cascading reveal lets you keep going. Variants: Streak (default), Classic (every action passes the turn), Survival (3 lives, last player standing).
- **Race** — Everyone solves the *exact same seeded board*, one after another, in private. Results (time / clicks / lives) are hidden until every player has finished their run.
- **Co-op Survival** — 2–4 players share one board and a pool of lives, rotating after every single action. Three correct mine flags in a row earns a team reward (Extra Life or Peek). Optional Endless mode chains progressively harder boards.

## Getting started

```bash
npm install
npm run dev       # start the dev server (http://localhost:5173)
npm run build      # type-check + production build
npm run preview    # preview the production build locally
```

## Testing

```bash
npm run test        # unit tests (Vitest) — the board/rule engine
npm run test:e2e    # end-to-end tests (Playwright) — key user flows
npm run lint         # oxlint
npm run typecheck    # tsc --noEmit
```

## Architecture

The Minesweeper rule engine is completely independent of React and lives under `src/engine/`:

- `rng.ts` — deterministic seeded PRNG (mulberry32) so a seed always reproduces the same board. This is what lets Race mode hand every player an identical layout.
- `board.ts` — board creation, mine placement (deferred until the first reveal so it can exclude a safe zone around the first click), adjacency counts, and config validation.
- `reveal.ts` — reveal, recursive zero-region flood fill, flag/unflag, and chording.
- `duel.ts` / `race.ts` / `coop.ts` — the three mode-specific rule engines: turn management, scoring, lives, streaks, rewards, win/loss conditions and tie-breakers. Each exposes pure functions that take a state + action and return a new state plus a list of typed `GameEvent`s (`MINE_CORRECTLY_FLAGGED`, `TURN_ENDED`, `PLAYER_ELIMINATED`, …).
- `defaults.ts` — default settings per mode and difficulty/duration estimation.
- `persistence.ts` — a small localStorage wrapper (namespaced, versioned, `Set`-aware JSON) used to remember preferences, recent player names, and the in-progress match.

React only consumes this engine through `src/store/useMatchStore.ts` (screen/flow state, dispatch to the engine, side effects like sound/haptics/announcements) and `src/store/usePrefsStore.ts` (persisted user preferences). UI components under `src/components/` and `src/screens/` are presentational and contain no game rules.

## Notes on scope

- Face-to-face 2-player orientation (180° rotation of numbers/HUD without rotating the board) is fully implemented. 3–4 player table-mode seating uses simplified two-side orientation rather than four independent 90°-stepped orientations.
- Endless Co-op generates consecutive seeded boards of gradually increasing size/density rather than one infinitely expanding board, per the allowed simplification.
- Random-drop Co-op rewards are implemented but off by default; the guaranteed 3-flag-streak reward is on by default.

## Offline / PWA

The app is registered as a PWA (`vite-plugin-pwa`, autoUpdate) with an offline-capable app shell. Install it from your browser's "Add to Home Screen" / install prompt on iPhone, iPad, or desktop — after the first load it works with no network connection.

## Deployment

Live at **https://minesduell.pages.dev**, hosted on Cloudflare Pages with native Git integration: every push to `main` triggers a Cloudflare build (`npm run build`, output `dist/`) and deploys it automatically. No secrets or CI config live in the repo — the build runs on Cloudflare's side. `.nvmrc` pins the build image to Node 22 (Vite 8 requires Node ≥ 20.19).
