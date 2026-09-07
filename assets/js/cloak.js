/* cloak.js - tab title and favicon override, persisted per browser.
 *
 * Presets use generic document glyphs and neutral wording rather than any real
 * product's logo or name. The custom option takes whatever you type. */

const KEY = "jpc.cloak";

export const PRESETS = {
  off:        { label: "Off (site default)", title: null, icon: null },
  document:   { label: "Untitled document",  title: "Untitled document",              icon: doc("#4285F4") },
  assignment: { label: "Unit 4 assignment",  title: "Unit 4 - Reading Comprehension", icon: doc("#0F9D58") },
  slides:     { label: "Untitled slides",    title: "Untitled presentation",          icon: doc("#F4B400") },
  sheet:      { label: "Untitled sheet",     title: "Untitled spreadsheet",           icon: doc("#0F9D58") },
  mail:       { label: "Inbox",              title: "Inbox (1)",                      icon: doc("#DB4437") },
};

/* A plain page-with-a-fold glyph. Deliberately generic - it reads as "a
   document" at 16px without borrowing anyone's trademark. */
function doc(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="6" fill="${color}"/>
    <path d="M11 7h7l5 5v13a1 1 0 0 1-1 1H11a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" fill="#fff"/>
    <path d="M18 7l5 5h-5z" fill="#d7d7d7"/>
    <rect x="13" y="16" width="7" height="1.8" rx=".9" fill="${color}" opacity=".55"/>
    <rect x="13" y="20" width="7" height="1.8" rx=".9" fill="${color}" opacity=".55"/>
  </svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch { return {}; }
}

function write(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ }
}

function setFavicon(href) {
  let link = document.querySelector("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  if (!link.dataset.original) link.dataset.original = link.href || "";
  link.href = href || link.dataset.original;
}

/** Apply a cloak by preset name, or a custom {title, icon}. */
export function applyCloak(nameOrCustom) {
  const cfg = typeof nameOrCustom === "string"
    ? (PRESETS[nameOrCustom] || PRESETS.off)
    : nameOrCustom;

  if (!document.body.dataset.originalTitle) {
    document.body.dataset.originalTitle = document.title;
  }
  document.title = cfg.title || document.body.dataset.originalTitle;
  setFavicon(cfg.icon);
}

export function saveCloak(name, custom) {
  write({ name, custom: custom || null });
  restoreCloak();
}

export function currentCloak() {
  const s = read();
  return { name: s.name || "off", custom: s.custom || null };
}

/** Re-apply whatever was saved. Call on every page load. */
export function restoreCloak() {
  const { name, custom } = currentCloak();
  if (name === "custom" && custom) applyCloak(custom);
  else applyCloak(name);
}
