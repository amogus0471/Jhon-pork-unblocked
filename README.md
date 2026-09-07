# Jhon Pork's Classroom

A self-hosted catalog of browser modules, skinned as a course portal.

## Layout

| Path | What it is |
|---|---|
| `index.html` | Course catalog - search, lesson filters, progressive grid |
| `play.html` | Module viewer (`?id=<slug>`) with Presentation Mode |
| `decoy.html` | Panic-key destination. Deliberately plain - this is the one page that does not use the site design system |
| `settings.html` | Tab disguise, escape key, open-cloaked preference |
| `data/games.json` | The manifest. Catalog, search index and status all read from here |
| `games/<slug>/` | One directory per module |
| `tools/ingest.mjs` | Triage, dedupe, vendor and budget pipeline |
| `tools/titles.mjs` | Filename to title derivation |
| `functions/api/` | Cloudflare Pages Functions (presence, discussion) |

## Rebuilding the catalog

```
node tools/ingest.mjs --scan     # classify only, no writes, no network
node tools/ingest.mjs --build    # rebuild games/ and data/games.json
```

`--build` is idempotent: it clears `games/` and regenerates everything from the
source folder. Point it elsewhere with `UGS_SOURCE=/path/to/files`.

Two limits are enforced because GitHub rejects any file over 100MB and a
published Pages site should stay under 1GB:

- `MAX_FILE_BYTES` - per-file cap (90MB)
- `TOTAL_BUDGET` - whole-site cap (400MB)

Anything that does not fit is marked `oversized-deferred` in the manifest and
listed in `REPORT.md`. Raise `TOTAL_BUDGET` to pull more in.

## Module status

- `vendored` - stored here, loads with no external requests
- `remote-fallback` - playable, but still fetches from an upstream host
- `oversized-deferred` - real module that did not fit the budget
- `needs-review` - not a module, or unclassifiable

## Escape key

Backtick by default, configurable in Preferences. It destroys every iframe
first so audio stops instantly, then swaps to `decoy.html` and changes the tab
title and favicon. Pressing it again returns you. `location.replace()` is used
rather than a history push, so Back cannot walk into the module.
