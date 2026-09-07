/* thumbs.mjs - capture a real thumbnail for each featured module.
 *
 * Uses the installed Chrome headless, so there is no npm dependency. Only
 * featured modules are captured - they are what the front page shows, and 72
 * captures is tractable where 2832 would not be.
 *
 * These are frames of the module as this site already serves it, not artwork
 * fetched from a publisher. Anything that fails, times out, or comes back
 * blank keeps its generated tile instead.
 *
 *   node tools/thumbs.mjs [--force] [--limit N] [--concurrency N]
 */

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

const CHROME = process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.THUMB_BASE || "http://localhost:8899";
const W = 480, H = 360;

/* A 480x360 PNG of a solid colour lands around 2-4KB. Anything real - a game
   scene, a menu, a splash with art - is far bigger. Below this the capture is
   a blank frame and the generated tile looks better. */
const MIN_INTERESTING = 12000;

const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const num = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 ? +argv[i + 1] : dflt; };
const LIMIT = num("--limit", Infinity);
const CONCURRENCY = num("--concurrency", 4);
const BUDGET_MS = num("--budget", 12000);
const HARD_MS = BUDGET_MS + 12000;

if (!fs.existsSync(CHROME)) {
  console.error("Chrome not found at " + CHROME + " (set CHROME_PATH)");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync("data/games.json", "utf8"));
const targets = manifest.games
  .filter((g) => g.popular && g.src && g.healthy !== false)
  .slice(0, LIMIT);

console.log("capturing " + targets.length + " thumbnails, concurrency " + CONCURRENCY + "\n");

function shoot(g, i) {
  return new Promise((resolve) => {
    const dir = "games/" + g.slug;
    const out = dir + "/tile.png";
    // Chrome resolves --screenshot against its own cwd, so pass an absolute path.
    const abs = path.resolve(out);
    if (!FORCE && fs.existsSync(out) && fs.statSync(out).size >= MIN_INTERESTING) {
      g.art = out;
      return resolve("reused");
    }

    const profile = path.join(process.env.TEMP || ".", "jpc-thumb-" + i);
    const child = execFile(CHROME, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--mute-audio",
      "--no-first-run", "--no-default-browser-check", "--disable-extensions",
      "--autoplay-policy=no-user-gesture-required",
      "--user-data-dir=" + profile,
      "--virtual-time-budget=" + BUDGET_MS,
      "--window-size=" + W + "," + H,
      "--screenshot=" + abs,
      BASE + "/" + g.src,
    ], { timeout: HARD_MS, killSignal: "SIGKILL" }, () => {
      let size = 0;
      try { size = fs.existsSync(out) ? fs.statSync(out).size : 0; } catch { /* ignore */ }

      if (size >= MIN_INTERESTING) {
        g.art = out;
        console.log("  ok    " + (size / 1024).toFixed(0).padStart(4) + "KB  " + g.title);
        return resolve("ok");
      }
      // Blank or missing - drop it and keep the generated tile.
      try { if (fs.existsSync(out)) fs.unlinkSync(out); } catch { /* ignore */ }
      delete g.art;
      console.log("  blank " + String(size ? (size / 1024).toFixed(0) + "KB" : "-").padStart(6) + "  " + g.title);
      resolve("blank");
    });
    child.on("error", () => resolve("error"));
  });
}

const tally = { ok: 0, blank: 0, reused: 0, error: 0 };
let cursor = 0;

await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (cursor < targets.length) {
    const i = cursor++;
    const r = await shoot(targets[i], i % CONCURRENCY);
    tally[r] = (tally[r] || 0) + 1;
  }
}));

fs.writeFileSync("data/games.json", JSON.stringify(manifest, null, 1));
console.log("\ncaptured " + tally.ok + " | reused " + tally.reused +
            " | blank " + tally.blank + " | error " + tally.error);
console.log("modules with real art: " + manifest.games.filter((g) => g.art).length);
