#!/usr/bin/env node
/**
 * ingest.mjs - triage, dedupe, classify and vendor games into the catalog.
 *
 * Usage:
 *   node tools/ingest.mjs --scan            classify only, no writes, no network
 *   node tools/ingest.mjs --build           vendor + emit data/games.json + REPORT.md
 *   node tools/ingest.mjs --build --limit 50
 *
 * Source of truth for the catalog is data/games.json. Nothing here runs at
 * runtime - this is a local build step.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { deriveTitle } from "./titles.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SOURCE_DIR = process.env.UGS_SOURCE
  || "C:/Users/Jeanluc/Downloads/UGS Files old-20260907T182733Z-1-001/UGS Files old";

/* Budget for the published site. GitHub Pages wants the whole site under 1GB;
   a single file over 100MB is rejected by git outright. */
const MAX_FILE_BYTES   = 90  * 1024 * 1024;   // stay clear of the 100MB hard limit
const TOTAL_BUDGET     = 400 * 1024 * 1024;   // leave headroom under 1GB

const argv = process.argv.slice(2);
const MODE_SCAN  = argv.includes("--scan");
const MODE_BUILD = argv.includes("--build");
const LIMIT = (() => {
  const i = argv.indexOf("--limit");
  return i >= 0 ? parseInt(argv[i + 1], 10) : Infinity;
})();

/* ------------------------------------------------------------------ utils */

const bytes = (n) => {
  if (n < 1024) return n + "B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + "KB";
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + "MB";
  return (n / 1024 / 1024 / 1024).toFixed(2) + "GB";
};

const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "untitled";
}

function baseKey(filename) {
  // normalise "foo(1).html" and "foo.html" to the same key for dedupe
  return filename
    .replace(/\.(html?|txt|swf|docx)$/i, "")
    .replace(/\s*\(\d+\)$/, "")
    .toLowerCase()
    .trim();
}

/* Rough category guess from the title. Cheap keyword match - the manifest is
   hand-editable afterwards, this just avoids 900 games all landing in "Misc". */
const LESSON_RULES = [
  [/eagler|minecraft|craft|sandbox|build|sim(ulator)?|tycoon/i, "Applied Sciences Lab"],
  [/2048|sudoku|puzzle|maze|chess|solitaire|mahjong|match|logic|escape|riddle|cube/i, "Logic & Reasoning"],
  [/drift|racing|racer|kart|moto|car|drive|driver|bike|traffic|parking|road|wheel/i, "Kinetics & Motion"],
  [/shoot|gun|sniper|bullet|strike|war|combat|zombie|defen[cs]e|tank|army|commando|forces/i, "Applied Ballistics"],
  [/soccer|football|basketball|pool|golf|tennis|baseball|hockey|sport|bowling|dunk|goal|cup|league/i, "Athletics"],
  [/\bio\b|\.io|multiplayer|1v1|2 player|two player|battle|arena|royale|vs\b/i, "Group Seminar"],
  [/nes\b|snes|gameboy|retro|arcade|atari|classic|flash|pac-?man|mario|sonic|tetris/i, "Media History"],
  [/strategy|tower|idle|clicker|merge|empire|kingdom|city|farm|money|business|manage/i, "Economics & Strategy"],
  [/run|jump|platform|parkour|climb|dash|slope|surf|skate|obby|geometry/i, "Physical Education"],
];

function guessLesson(title) {
  for (const [re, lesson] of LESSON_RULES) if (re.test(title)) return lesson;
  return "General Studies";
}

/* ------------------------------------------------------- classification */

const RE_JSDELIVR   = /https?:\/\/cdn\.jsdelivr\.net\/[^\s"'<>)]+/gi;
const RE_APPSSCRIPT = /https?:\/\/script\.google\.com\/[^\s"'<>)&]+/i;
const RE_BASE_HREF  = /<base\s+href=["']([^"']+)["']/i;
const RE_IFRAME_SRC = /<iframe[^>]+src=["']([^"']+)["']/gi;
const RE_ANY_HTTP   = /https?:\/\/[^\s"'<>)]+/gi;
const RE_RUFFLE     = /ruffle(\.js)?/i;
const RE_SWF        = /\.swf\b/i;

/**
 * Reads the head of a file and decides what kind of thing it is.
 * Only the first chunk is read - a 100MB self-contained game does not need
 * to be fully loaded to be identified.
 */
function classify(fullPath, stat) {
  const ext = path.extname(fullPath).toLowerCase();
  if (ext === ".docx") {
    return { kind: "needs-review", reason: "Word document, not a game", refs: [] };
  }
  if (ext === ".swf") {
    return { kind: "raw-swf", reason: "Bare Flash file, needs a Ruffle wrapper", refs: [] };
  }

  const PEEK = 64 * 1024;
  const fd = fs.openSync(fullPath, "r");
  const buf = Buffer.alloc(Math.min(PEEK, stat.size));
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const head = buf.toString("utf8");

  const jsdelivr = [...new Set(head.match(RE_JSDELIVR) || [])];
  const appsScript = RE_APPSSCRIPT.test(head);
  const baseHref = (head.match(RE_BASE_HREF) || [])[1] || null;

  const iframes = [];
  let m;
  RE_IFRAME_SRC.lastIndex = 0;
  while ((m = RE_IFRAME_SRC.exec(head))) iframes.push(m[1]);

  const isFlash = RE_RUFFLE.test(head) || RE_SWF.test(head);

  // A live Apps Script endpoint is a running program, not a static asset.
  if (appsScript) {
    return {
      kind: "shim-appsscript",
      reason: "Embeds a live Google Apps Script endpoint - cannot be vendored",
      refs: [(head.match(RE_APPSSCRIPT) || [])[0]].filter(Boolean),
      isFlash,
    };
  }

  // Whole external site behind a <base href> + relative iframe.
  if (baseHref && /^https?:\/\//i.test(baseHref)) {
    return {
      kind: "shim-external-site",
      reason: "Points at a whole external site via <base href>",
      refs: [baseHref],
      isFlash,
    };
  }

  // fetch() + document.write of a remote page.
  if (/document\.write/i.test(head) && /fetch\s*\(/i.test(head) && jsdelivr.length) {
    return { kind: "shim-fetch-write", reason: "Fetches and writes a remote page", refs: jsdelivr, isFlash };
  }

  if (jsdelivr.length) {
    return { kind: "shim-jsdelivr", reason: "Loads assets from jsDelivr", refs: jsdelivr, isFlash };
  }

  // Absolute iframe to some other origin.
  const externalIframe = iframes.find((s) => /^https?:\/\//i.test(s));
  if (externalIframe) {
    return { kind: "shim-external-site", reason: "Absolute iframe to another origin", refs: [externalIframe], isFlash };
  }

  // Nothing external in the head. For small files double-check the whole body;
  // for big ones assume self-contained (they are the 40-120MB embedded builds).
  if (stat.size <= PEEK) {
    const all = [...new Set(head.match(RE_ANY_HTTP) || [])]
      .filter((u) => !/^https?:\/\/(www\.)?w3\.org/i.test(u));
    if (all.length) {
      return { kind: "shim-other", reason: "References external URLs", refs: all, isFlash };
    }
  }

  return { kind: "self-contained", reason: "No external references detected", refs: [], isFlash };
}

/* ------------------------------------------------------------- discovery */

function discover(sourceDir) {
  const names = fs.readdirSync(sourceDir);
  const entries = [];

  for (const name of names) {
    const full = path.join(sourceDir, name);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (!stat.isFile()) continue;
    if (!/\.(html?|txt|swf|docx)$/i.test(name)) continue;
    entries.push({ name, full, size: stat.size, stat });
  }
  return entries;
}

/* Collapse "(1)" copies and byte-identical twins. Keeps the shortest name. */
function dedupe(entries) {
  const byKey = new Map();
  const dupes = [];

  for (const e of entries) {
    const key = baseKey(e.name);
    if (!byKey.has(key)) { byKey.set(key, e); continue; }
    const kept = byKey.get(key);
    // same normalised name - keep the one without the (n) marker
    if (e.name.length < kept.name.length) {
      byKey.set(key, e);
      dupes.push({ dropped: kept.name, kept: e.name, size: kept.size });
    } else {
      dupes.push({ dropped: e.name, kept: kept.name, size: e.size });
    }
  }

  // second pass: identical content under different names (hash only same-size files)
  const bySize = new Map();
  for (const e of byKey.values()) {
    if (!bySize.has(e.size)) bySize.set(e.size, []);
    bySize.get(e.size).push(e);
  }
  const hashDropped = new Set();
  for (const [size, group] of bySize) {
    if (group.length < 2 || size > 32 * 1024 * 1024) continue; // don't hash the giants
    const seen = new Map();
    for (const e of group) {
      const h = sha1(fs.readFileSync(e.full));
      if (seen.has(h)) {
        hashDropped.add(e.name);
        dupes.push({ dropped: e.name, kept: seen.get(h), size: e.size, reason: "identical content" });
      } else {
        seen.set(h, e.name);
      }
    }
  }

  const unique = [...byKey.values()].filter((e) => !hashDropped.has(e.name));
  return { unique, dupes };
}

/* ------------------------------------------------------------------ scan */

function runScan() {
  console.log("Source: " + SOURCE_DIR + "\n");
  const all = discover(SOURCE_DIR);
  const rawBytes = all.reduce((n, e) => n + e.size, 0);
  console.log("Discovered " + all.length + " candidate files (" + bytes(rawBytes) + ")");

  const { unique, dupes } = dedupe(all);
  const dupBytes = dupes.reduce((n, d) => n + d.size, 0);
  console.log("Deduped " + dupes.length + " files (" + bytes(dupBytes) + " reclaimed)");
  console.log("Unique: " + unique.length + " files (" + bytes(rawBytes - dupBytes) + ")\n");

  const kinds = new Map();
  const lessons = new Map();
  const samples = new Map();
  let oversize = [];
  let flashCount = 0;

  for (const e of unique) {
    const c = classify(e.full, e.stat);
    kinds.set(c.kind, (kinds.get(c.kind) || 0) + 1);
    if (!samples.has(c.kind)) samples.set(c.kind, []);
    if (samples.get(c.kind).length < 3) samples.get(c.kind).push(deriveTitle(e.name));
    if (c.isFlash) flashCount++;
    if (e.size > MAX_FILE_BYTES) oversize.push({ name: e.name, size: e.size });
    const title = deriveTitle(e.name);
    const lesson = guessLesson(title);
    lessons.set(lesson, (lessons.get(lesson) || 0) + 1);
  }

  console.log("BY KIND");
  for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1])) {
    console.log("  " + String(n).padStart(5) + "  " + k.padEnd(20) + " e.g. " + (samples.get(k) || []).join(", "));
  }

  console.log("\nBY LESSON");
  for (const [k, n] of [...lessons].sort((a, b) => b[1] - a[1])) {
    console.log("  " + String(n).padStart(5) + "  " + k);
  }

  console.log("\nFlash/Ruffle games: " + flashCount);
  console.log("Over " + bytes(MAX_FILE_BYTES) + " (cannot be committed): " + oversize.length);
  for (const o of oversize) console.log("  " + bytes(o.size).padStart(8) + "  " + o.name);
}

if (MODE_SCAN) { runScan(); process.exit(0); }

/* ----------------------------------------------------------------- build */

const STATUS = {
  VENDORED: "vendored",
  REMOTE:   "remote-fallback",
  DEFERRED: "oversized-deferred",
  REVIEW:   "needs-review",
};

/* Self-contained files carry the whole game, so they must be copied to work at
   all. Shims are tiny and still point upstream - they get copied verbatim and
   flagged remote-fallback until the vendor pass localises them. */
function runBuild() {
  const t0 = Date.now();
  console.log("Source: " + SOURCE_DIR);
  const all = discover(SOURCE_DIR);
  const { unique, dupes } = dedupe(all);
  console.log("Discovered " + all.length + ", deduped " + dupes.length + ", unique " + unique.length);

  /* Clear the previous build so a re-run cannot leave behind games that are
     now deferred or renamed. This is what makes --build idempotent. */
  const gamesDir = path.join(ROOT, "games");
  if (fs.existsSync(gamesDir)) {
    process.stdout.write("clearing previous build ... ");
    fs.rmSync(gamesDir, { recursive: true, force: true });
    console.log("done");
  }
  fs.mkdirSync(gamesDir, { recursive: true });

  const records = [];
  const slugSeen = new Map();
  let spent = 0;
  const counts = { vendored: 0, remote: 0, deferred: 0, review: 0 };
  const deferred = [];

  // Self-contained first so the size budget goes to real playable content,
  // biggest-value-per-byte first (smallest first fits the most games).
  const ordered = [...unique].sort((a, b) => a.size - b.size);
  let processed = 0;

  for (const e of ordered) {
    if (processed >= LIMIT) break;
    const c = classify(e.full, e.stat);
    const title = deriveTitle(e.name);
    let slug = slugify(title);
    if (slugSeen.has(slug)) {
      const n = slugSeen.get(slug) + 1;
      slugSeen.set(slug, n);
      slug = slug + "-" + n;
    } else {
      slugSeen.set(slug, 1);
    }

    const rec = {
      slug,
      title,
      lesson: guessLesson(title),
      tags: [],
      engine: c.isFlash ? "ruffle" : "html5",
      src: null,
      art: null,
      status: null,
      sizeKB: Math.round(e.size / 1024),
      source: e.name,
      note: c.reason,
      checked: new Date().toISOString().slice(0, 10),
    };

    if (c.kind === "needs-review") {
      rec.status = STATUS.REVIEW;
      counts.review++;
      records.push(rec);
      processed++;
      continue;
    }

    const isSelfContained = c.kind === "self-contained" || c.kind === "raw-swf";

    /* Size guards are a git/Pages constraint, so they apply to every file
       regardless of how it was classified. A large file that merely mentions
       a CDN in its head is still a large file. */
    if (e.size > MAX_FILE_BYTES) {
      rec.status = STATUS.DEFERRED;
      rec.note = "Exceeds " + bytes(MAX_FILE_BYTES) + " per-file limit";
      deferred.push({ title, size: e.size, why: "over per-file limit" });
      counts.deferred++;
      records.push(rec);
      processed++;
      continue;
    }
    if (spent + e.size > TOTAL_BUDGET) {
      rec.status = STATUS.DEFERRED;
      rec.note = "Did not fit the site size budget";
      deferred.push({ title, size: e.size, why: "budget full" });
      counts.deferred++;
      records.push(rec);
      processed++;
      continue;
    }

    // Copy the file in. Shims are ~1KB so this is cheap; self-contained files
    // are the ones that actually consume the budget.
    const destDir = path.join(gamesDir, slug);
    fs.mkdirSync(destDir, { recursive: true });
    const destName = c.kind === "raw-swf" ? "game.swf" : "index.html";
    fs.copyFileSync(e.full, path.join(destDir, destName));
    spent += e.size;

    rec.src = "games/" + slug + "/" + destName;
    rec.status = isSelfContained ? STATUS.VENDORED : STATUS.REMOTE;
    if (isSelfContained) counts.vendored++; else counts.remote++;
    if (c.refs && c.refs.length) rec.upstream = c.refs.slice(0, 4);

    records.push(rec);
    processed++;
    if (processed % 500 === 0) console.log("  ... " + processed + " processed (" + bytes(spent) + ")");
  }

  records.sort((a, b) => a.title.localeCompare(b.title));

  const lessons = [...new Set(records.map((r) => r.lesson))].sort();
  const manifest = {
    generated: new Date().toISOString(),
    counts,
    totalBytes: spent,
    lessons,
    games: records,
  };

  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "data", "games.json"), JSON.stringify(manifest, null, 1));

  writeReport({ all, unique, dupes, counts, spent, deferred, records, t0 });

  console.log("\nvendored " + counts.vendored + " | remote " + counts.remote +
              " | deferred " + counts.deferred + " | review " + counts.review);
  console.log("payload " + bytes(spent) + " of " + bytes(TOTAL_BUDGET) + " budget");
  console.log("wrote data/games.json and REPORT.md in " + ((Date.now() - t0) / 1000).toFixed(1) + "s");
}

/* ---------------------------------------------------------------- report */

function writeReport({ all, unique, dupes, counts, spent, deferred, records, t0 }) {
  const rawBytes = all.reduce((n, e) => n + e.size, 0);
  const dupBytes = dupes.reduce((n, d) => n + d.size, 0);

  const byLesson = new Map();
  for (const r of records) byLesson.set(r.lesson, (byLesson.get(r.lesson) || 0) + 1);

  const L = [];
  L.push("# Ingest report");
  L.push("");
  L.push("Generated " + new Date().toISOString() + " in " + ((Date.now() - t0) / 1000).toFixed(1) + "s.");
  L.push("");
  L.push("## Intake");
  L.push("");
  L.push("| | Files | Size |");
  L.push("|---|---:|---:|");
  L.push("| Discovered | " + all.length + " | " + bytes(rawBytes) + " |");
  L.push("| Duplicates removed | " + dupes.length + " | " + bytes(dupBytes) + " |");
  L.push("| Unique | " + unique.length + " | " + bytes(rawBytes - dupBytes) + " |");
  L.push("| **Published payload** | " + records.filter((r) => r.src).length + " | **" + bytes(spent) + "** |");
  L.push("");
  L.push("## Status breakdown");
  L.push("");
  L.push("- **" + counts.vendored + " vendored** - fully local, no external requests");
  L.push("- **" + counts.remote + " remote-fallback** - playable, but still loads from an upstream host");
  L.push("- **" + counts.deferred + " oversized-deferred** - real games that did not fit the size budget");
  L.push("- **" + counts.review + " needs-review** - not games, or unclassifiable");
  L.push("");
  L.push("## Catalog by lesson");
  L.push("");
  for (const [k, n] of [...byLesson].sort((a, b) => b[1] - a[1])) {
    L.push("- " + k + " - " + n);
  }

  if (deferred.length) {
    L.push("");
    L.push("## Deferred (candidates for a Cloudflare R2 pass)");
    L.push("");
    L.push("| Game | Size | Why |");
    L.push("|---|---:|---|");
    for (const d of deferred.sort((a, b) => b.size - a.size).slice(0, 40)) {
      L.push("| " + d.title + " | " + bytes(d.size) + " | " + d.why + " |");
    }
  }

  const review = records.filter((r) => r.status === STATUS.REVIEW);
  if (review.length) {
    L.push("");
    L.push("## Needs review");
    L.push("");
    for (const r of review) L.push("- " + r.source + " - " + r.note);
  }

  L.push("");
  L.push("## Re-running");
  L.push("");
  L.push("`node tools/ingest.mjs --build` is idempotent - it rebuilds games/ and");
  L.push("data/games.json from the source folder. Raise TOTAL_BUDGET in the script");
  L.push("to pull deferred games in.");
  L.push("");

  fs.writeFileSync(path.join(ROOT, "REPORT.md"), L.join("\n"));
}

/* ------------------------------------------------------------------ main */

if (MODE_BUILD) {
  runBuild();
} else if (!MODE_SCAN) {
  console.log("usage: node tools/ingest.mjs --scan | --build [--limit N]");
  process.exit(1);
}
