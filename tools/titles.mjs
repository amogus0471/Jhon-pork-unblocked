/* Shared title derivation.
 *
 * Corpus filenames are mashed scrape names: "cl100in1nes.html",
 * "clgeometrydashlite.html". Three passes fix most of them:
 *   1. protect version/score tokens (1v1, v1.0, 100in1)
 *   2. split camelCase and digit/letter boundaries
 *   3. greedy dictionary split of long lowercase run-ons
 * Titles remain hand-editable in data/games.json. */

const ACRONYMS = {
  nes: "NES", snes: "SNES", gba: "GBA", gbc: "GBC", n64: "N64",
  fnf: "FNF", gta: "GTA", hd: "HD", ufo: "UFO", fps: "FPS",
  "2d": "2D", "3d": "3D", "4d": "4D", tv: "TV", dx: "DX", vs: "vs",
};

/* Most frequent tokens across this kind of collection. Longest-first matching
   means "gameboy" wins over "game" + "boy". */
const WORDS = `undertale geometry gameboy minecraft basketball achievement
adventure simulator unblocked commando fireboy watergirl multiplayer
championship motorcycle helicopter skateboard playground apocalypse
strategy defense shooter zombies parking madness bullet rooms enemies
pandas japan brazil fantasy night seconds burger santa escape legends
missile builder monster truck sniper puzzle bubble tower stack blocks
soccer tennis hockey bowling golf pool billiards boxing racing driver
drift kart moto bike wheel traffic road highway subway surfers temple
super smash flash mario sonic tetris pacman zelda minish pokemon
sniper strike force squad clash clicker idle merge tycoon empire
kingdom farm city builder money cookie candy crush jewel match three
snake slither paper doodle jump slope tunnel cube dash lite plus
world level classic edition remastered deluxe extreme ultimate
online arcade retro pixel dungeon rogue craft eagler client
knife hit ragdoll physics stickman fighter warrior ninja samurai
pirate space galaxy star wars battle royale arena versus
ball pool table shuffle darts archery bow arrow gun shoot
run runner jumper climb parkour obby maze solver rescue
happy wheels getaway heist robbery bank prison break
walk forest island survival craft build sandbox
first second third fourth fifth
mini games player people jelly among impostor
free fire dead alive last stand defence attack
time trial speed turbo nitro fury rage storm
gold silver bronze coin gem crystal treasure
magic wizard witch dragon knight castle
football league goal keeper penalty shootout
cars trucks trains planes boats
color switch line rider vex swords souls
duck hunt shark attack fishing hunting
paper toss basket dunk hoops
gravity guy blast crash smash bash
tank wars robot mech battle bots
and the of cap unlocked girl boy man men kid kids
van car bus jet gun box bot cat dog cow pig fox
red blue green black white pink grey gold
new old big small mini max pro max ultra
`.trim().split(/\s+/).filter((w) => /^[a-z]{2,}$/.test(w));

const BY_LEN = [...new Set(WORDS)].sort((a, b) => b.length - a.length);

/* Greedy longest-match split. Returns null when the run cannot be fully
   consumed, so we never emit half-garbage. */
function dictSplit(run) {
  const out = [];
  let i = 0;
  let guard = 0;
  while (i < run.length && guard++ < 40) {
    const rest = run.slice(i);
    const hit = BY_LEN.find((w) => rest.startsWith(w));
    if (!hit) return null;
    out.push(hit);
    i += hit.length;
  }
  return i === run.length && out.length > 1 ? out : null;
}

export function deriveTitle(filename) {
  let s = filename.replace(/\.(html?|txt|swf|docx)$/i, "");
  s = s.replace(/\s*\(\d+\)$/, "");
  s = s.replace(/^cl(?=[A-Za-z0-9])/, "");
  s = s.replace(/[_]+/g, " ");

  // Hold tokens the splitters would wreck: 1v1, 4x4, 100in1, (v1.0)
  const held = [];
  const hold = (re) => {
    s = s.replace(re, (m) => {
      held.push(m);
      return " HOLD" + (held.length - 1) + "X ";
    });
  };
  hold(/\(v[\d.]+\)/gi);
  hold(/\d+v\d+/gi);
  hold(/\d+x\d+/gi);
  hold(/\d+in\d+/gi);

  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  s = s.replace(/([0-9])([a-zA-Z])/g, "$1 $2");
  s = s.replace(/([a-zA-Z])([0-9])/g, "$1 $2");
  s = s.replace(/[-]+/g, " ");

  // Dictionary-split any long all-lowercase run.
  s = s.split(/\s+/).map((tok) => {
    if (!/^[a-z]{8,}$/.test(tok)) return tok;
    const parts = dictSplit(tok);
    return parts ? parts.join(" ") : tok;
  }).join(" ");

  s = s.replace(/HOLD\s*(\d+)\s*X/gi, (_, i) => held[Number(i)]);
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return filename;

  return s
    .split(" ")
    .map((w) => {
      const k = w.toLowerCase();
      if (ACRONYMS[k]) return ACRONYMS[k];
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}
