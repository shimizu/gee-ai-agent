# Repository Guidelines

## Project Structure
- `src/App.jsx` — sole wiring point. `src/hooks/` own stores and expose handlers.
- `src/agent/` — Claude tool-use loop, client, registry, compaction, system prompt + `skills/`.
- `src/tools/<source>/` — tool definitions/handlers per data source; `sources.js` lists them.
- `src/gee/` — Earth Engine auth, code runner, map/tiles, GPU pipeline, layer factory.
- `src/data/` — LayerStore / DatasetStore / ChartStore / chart-spec / settings / idb.
- `src/components/` — display & input only. `src/Layers/index.js` builds deck.gl layers.
- `test/` — `node --test` for pure logic. `reference/` — read-only reference projects (never imported).

## Commands
`npm run dev` · `npm run build` · `npm run preview` · `npm run lint` (zero warnings) · `npm test`.

## Code Style
Plain JS/JSX (no TypeScript), 2-space indent, no semicolons, single quotes. Components `PascalCase.jsx`,
modules `kebab-case.js`. Each module starts with a header comment (役割 / 関係 / 流用元). UI text and
comments are Japanese.

## Adding a data source
1. Create `src/tools/<source>/{index,definitions,handlers}.js` (+ client).
2. Create `src/agent/skills/<source>.js` exporting a Markdown string.
3. Add the source to `SOURCES` in `src/tools/sources.js`. Tools return summaries, never full payloads.

## Security
Claude API key and GEE OAuth client ID / project are entered in the settings popover and stored in
localStorage. Never commit keys. The CSP in `vite.config.js` must allow any new external host.

## Commits
Conventional prefixes: `feat:` `fix:` `docs:` `refactor:` `perf:` `test:` `chore:` `style:`.
