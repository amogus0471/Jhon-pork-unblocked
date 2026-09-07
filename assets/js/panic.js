/* panic.js - instant escape hatch.
 *
 * The usual failure mode of a panic button is hiding the game visually while
 * the audio keeps playing, which is the actual giveaway. So audio dies first,
 * before anything else happens.
 *
 * Navigation uses location.replace() rather than a pushState entry: replacing
 * the entry means the game URL is not left in history at all, so Back cannot
 * walk into it. */

import { applyCloak, currentCloak, PRESETS } from "./cloak.js";

const KEY_PREF   = "jpc.panicKey";
const RETURN_KEY = "jpc.returnTo";
const STICKY     = "jpc.cloaked";
const DEFAULT_KEY = "`";

export function panicKey() {
  try { return localStorage.getItem(KEY_PREF) || DEFAULT_KEY; }
  catch { return DEFAULT_KEY; }
}

export function setPanicKey(k) {
  try { localStorage.setItem(KEY_PREF, k); } catch { /* private mode */ }
}

/** Silence everything on the page immediately. */
function killAudio() {
  // Destroying the iframe is the only reliable way to stop Flash/Unity audio -
  // hiding it or pausing media elements inside it does not.
  document.querySelectorAll("iframe").forEach((f) => {
    try { f.src = "about:blank"; } catch { /* cross-origin */ }
    f.remove();
  });
  document.querySelectorAll("object, embed").forEach((n) => n.remove());
  document.querySelectorAll("video, audio").forEach((m) => {
    try { m.pause(); m.muted = true; m.currentTime = 0; } catch { /* ignore */ }
  });
}

export function panic() {
  killAudio();

  try { sessionStorage.setItem(RETURN_KEY, location.href); } catch { /* ignore */ }
  try { localStorage.setItem(STICKY, "1"); } catch { /* ignore */ }

  const onDecoy = /decoy\.html$/.test(location.pathname);
  if (!onDecoy) location.replace("decoy.html");
}

export function unpanic() {
  try { localStorage.removeItem(STICKY); } catch { /* ignore */ }
  let back = null;
  try { back = sessionStorage.getItem(RETURN_KEY); } catch { /* ignore */ }
  location.replace(back || "index.html");
}

/** True when the last session ended cloaked, or "open cloaked" is on. */
export function shouldOpenCloaked() {
  try {
    return localStorage.getItem(STICKY) === "1" ||
           localStorage.getItem("jpc.alwaysCloak") === "1";
  } catch { return false; }
}

/* Wire the key on every page. Ignored while typing in a field so the search
   box can contain a backtick without teleporting you to a worksheet. */
export function initPanic() {
  const onDecoy = /decoy\.html$/.test(location.pathname);

  addEventListener("keydown", (ev) => {
    if (ev.key !== panicKey()) return;
    const t = ev.target;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
    ev.preventDefault();
    onDecoy ? unpanic() : panic();
  });

  // A cloaked session that gets refreshed should stay cloaked.
  if (!onDecoy && shouldOpenCloaked()) {
    killAudio();
    location.replace("decoy.html");
    return;
  }

  // Keep the tab disguise consistent while cloaked.
  if (onDecoy && currentCloak().name === "off") applyCloak(PRESETS.assignment);
}
