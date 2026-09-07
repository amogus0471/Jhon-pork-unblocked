/* popular.mjs - pick the modules worth featuring on the front page.
 *
 * There is no play-count to sort by, so "popular" is a curated list of titles
 * that are actually well known, matched against the catalog. Anything the
 * health check confirmed dead is excluded, because a featured tile that does
 * not load is worse than no tile. */

import fs from "node:fs";

const FEATURED = [
  "slope", "retro bowl", "1v1", "geometry dash", "subway surf", "happy wheels",
  "among us", "fireboy", "basketball legends", "tetris", "pac man", "pacman",
  "2048", "cookie clicker", "moto x3m", "drift hunters", "eagler", "run 3",
  "tunnel rush", "snake", "flappy", "bloons", "btd", "doodle jump",
  "cut the rope", "angry birds", "temple run", "crossy road", "slither",
  "paper io", "stickman hook", "madalin", "rocket league", "fnf",
  "friday night funkin", "granny", "getting over it", "jetpack joyride",
  "duck life", "learn to fly", "bloxorz", "vex", "papa", "worlds hardest",
  "world's hardest", "tank trouble", "gun mayhem", "bad ice cream",
  "raft wars", "age of war", "earn to die", "plants vs", "five nights",
  "fnaf", "undertale", "super smash flash", "pokemon", "mario", "sonic",
  "zelda", "contra", "galaga", "space invaders", "chess", "solitaire",
  "minesweeper", "block blast", "monkey mart", "escape road", "drive mad",
  "eggy car", "ovo", "dino", "8 ball", "soccer", "burger", "minecraft",
  "shell shock", "krunker", "surviv", "build a queen", "cluster rush",
  "rooftop snipers", "getaway shootout", "wheelie bike", "smash karts",
  "iron snout", "short life", "murder", "n gon", "awesome tanks",
];

const manifest = JSON.parse(fs.readFileSync("data/games.json", "utf8"));

function matchedTerm(g) {
  const t = g.title.toLowerCase();
  return FEATURED.find((term) => t.includes(term)) || null;
}

function score(g) {
  const term = matchedTerm(g);
  let s = term ? 10 + term.length : 0;
  if (!s) return 0;
  if (g.status === "vendored") s += 6;      // works with no upstream at all
  if (g.healthy === true) s += 4;
  if (g.engine === "html5") s += 2;         // Flash needs the Ruffle warm-up
  if (g.healthUnknown) s -= 1;
  return s;
}

const ranked = manifest.games
  .filter((g) => g.src && g.healthy !== false)
  .map((g) => ({ g, s: score(g) }))
  .filter((x) => x.s > 0)
  .sort((a, b) => b.s - a.s || a.g.title.localeCompare(b.g.title));

/* Cap each franchise at two entries so the shelf is not six Eaglercrafts.
   Keying on the matched term is what actually collapses variants - keying on
   the title prefix does not, since "Eaglercraft Alpha" and "Eaglercraft Beta"
   differ early. */
const perTerm = new Map();
const picked = [];
for (const { g } of ranked) {
  const term = matchedTerm(g) || g.slug;
  const n = perTerm.get(term) || 0;
  if (n >= 2) continue;
  perTerm.set(term, n + 1);
  picked.push(g);
  if (picked.length >= 72) break;
}

const set = new Set(picked.map((g) => g.slug));
let n = 0;
for (const g of manifest.games) {
  const was = g.popular;
  g.popular = set.has(g.slug) || undefined;
  if (was !== g.popular) n++;
}

fs.writeFileSync("data/games.json", JSON.stringify(manifest, null, 1));
console.log("featured " + picked.length + " modules (" + n + " flags changed)");
console.log(picked.slice(0, 24).map((g) => "  " + g.title + "  [" + g.status + "]").join("\n"));
