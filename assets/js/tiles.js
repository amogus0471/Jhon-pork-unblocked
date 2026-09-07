/* tiles.js - deterministic cover art.
 *
 * The source collection ships no artwork, so every tile is generated from the
 * game's slug: same slug always yields the same tile. No network requests, no
 * image weight, and it reads as one designed system rather than a scrape.
 * Drop a real image at games/<slug>/tile.png and set "art" to override. */

/* Warm-leaning set so generated tiles sit with the amber/cream shell instead
   of fighting it. Each pair is [mark, ground] and both are dark-on-light so
   the ink stroke reads at thumbnail size. */
const PALETTES = [
  ["#E4572E", "#FFE0D2"], ["#D7263D", "#FFD6DC"], ["#F49D37", "#FFE9C7"],
  ["#C6980A", "#FFF0BF"], ["#6A8E23", "#E6F2C8"], ["#2E8B74", "#CFF0E6"],
  ["#1F7A8C", "#CDE9EF"], ["#4A5FC1", "#DCE2FB"], ["#8B5FBF", "#EBDDF7"],
  ["#C2477A", "#FBD9E8"], ["#B5651D", "#FCE3CB"], ["#3F7D58", "#D6EEDF"],
];

const INK = "#161616";

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function initials(title) {
  const words = String(title).replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* Four geometric motifs, picked by hash. Each is drawn with the same thick
   ink stroke as the rest of the UI so tiles sit inside the design system. */
function motif(kind, seed) {
  const r = (n) => (seed >> n) & 7;
  switch (kind) {
    case 0: // stacked bars
      return `<rect x="26" y="${104 + r(3) * 3}" width="46" height="52" rx="9"/>
              <rect x="86" y="${74 + r(5) * 4}" width="46" height="82" rx="9"/>
              <rect x="146" y="${94 + r(7) * 3}" width="46" height="62" rx="9"/>`;
    case 1: // orbiting discs
      return `<circle cx="109" cy="92" r="${34 + r(4) * 2}"/>
              <circle cx="${58 + r(6) * 4}" cy="132" r="17"/>
              <circle cx="${158 - r(2) * 4}" cy="132" r="17"/>`;
    case 2: // chevrons
      return `<path d="M40 ${132 - r(3) * 5} L109 64 L178 ${132 - r(3) * 5}" fill="none" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M40 ${166 - r(5) * 4} L109 104 L178 ${166 - r(5) * 4}" fill="none" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>`;
    default: // tilted slab + pip
      return `<rect x="46" y="70" width="126" height="78" rx="14" transform="rotate(${-8 + r(4) * 3} 109 109)"/>
              <circle cx="${88 + r(6) * 6}" cy="109" r="13" fill="${INK}"/>`;
  }
}

export function tileSVG(game) {
  const seed = hash(game.slug || game.title || "x");
  const [bold, soft] = PALETTES[seed % PALETTES.length];
  const kind = (seed >> 5) % 4;
  const rot = -3 + ((seed >> 9) % 7);

  return `<svg viewBox="0 0 218 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(game.title)}">
  <rect width="218" height="180" fill="${soft}"/>
  <g fill="${bold}" stroke="${INK}" stroke-width="5">${motif(kind, seed)}</g>
  <g transform="translate(159 139) rotate(${rot})">
    <rect x="-27" y="-16" width="54" height="32" rx="16" fill="${INK}"/>
    <text x="0" y="6" text-anchor="middle" fill="${soft}"
      font-family="Archivo Black, Arial Black, sans-serif" font-size="17"
      letter-spacing="0.5">${esc(initials(game.title))}</text>
  </g>
</svg>`;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export { esc };
