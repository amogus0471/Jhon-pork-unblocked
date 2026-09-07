# Ingest report

Generated 2026-09-07T19:27:56.879Z in 143.4s.

## Intake

| | Files | Size |
|---|---:|---:|
| Discovered | 2935 | 1.97GB |
| Duplicates removed | 103 | 226.3MB |
| Unique | 2832 | 1.75GB |
| **Published payload** | 2795 | **392.8MB** |

## Status breakdown

- **59 vendored** - fully local, no external requests
- **2736 remote-fallback** - playable, but still loads from an upstream host
- **33 oversized-deferred** - real games that did not fit the size budget
- **4 needs-review** - not games, or unclassifiable

## Catalog by lesson

- General Studies - 2044
- Media History - 201
- Applied Ballistics - 119
- Physical Education - 118
- Kinetics & Motion - 118
- Applied Sciences Lab - 62
- Athletics - 61
- Economics & Strategy - 44
- Logic & Reasoning - 40
- Group Seminar - 25

## Deferred (candidates for a Cloudflare R2 pass)

| Game | Size | Why |
|---|---:|---|
| Gdwaveover100mb | 115.5MB | over per-file limit |
| Undertale-Gameboy | 107.4MB | over per-file limit |
| Eaglerforge | 75.4MB | budget full |
| Astraclient | 67.2MB | budget full |
| Exploremodpack | 63.9MB | budget full |
| Adifferentsnowgrave | 63.6MB | budget full |
| Astrawasm | 56.5MB | budget full |
| Geometrydashlite | 54.0MB | budget full |
| Hil Climb Racing2 | 52.5MB | budget full |
| Archimedesclient | 49.1MB | budget full |
| Eaglercraftmagic | 42.9MB | budget full |
| Eagler Craft Tech | 42.6MB | budget full |
| Skyfactory | 41.1MB | budget full |
| Eaglercraftsky | 39.0MB | budget full |
| Prismclient | 38.4MB | budget full |
| Eaglercraftlite | 37.7MB | budget full |
| Uwuclient | 37.1MB | budget full |
| Tuff Client Offline WASM | 33.7MB | budget full |
| Unonomercy | 33.7MB | budget full |
| Resentclient | 33.4MB | budget full |
| Starlike | 31.1MB | budget full |
| Eaglercraft Z 1112 | 27.3MB | budget full |
| Wurstclient | 26.6MB | budget full |
| GXclient | 25.3MB | budget full |
| Lambdaclient | 24.8MB | budget full |
| Zeta Client | 24.8MB | budget full |
| Eaglercraft X-188u29 | 24.4MB | budget full |
| Eaglercraftshadow | 23.1MB | budget full |
| Pixelclient | 22.5MB | budget full |
| Gdsubzero | 21.8MB | budget full |
| EB.Client.V1.0.0R2.WASM | 21.6MB | budget full |
| Rebornclient | 21.5MB | budget full |
| Assroommaxxing | 21.0MB | budget full |

## Needs review

- clmspacman.docx - Word document, not a game
- clpapapizzagoody.docx - Word document, not a game
- clpapermariopromode.docx - Word document, not a game
- clvsnonsense.docx - Word document, not a game

## Re-running

`node tools/ingest.mjs --build` is idempotent - it rebuilds games/ and
data/games.json from the source folder. Raise TOTAL_BUDGET in the script
to pull deferred games in.
