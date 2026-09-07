/* presence.js - "students in session".
 *
 * This is a real count from a real endpoint, or it shows nothing at all.
 * The number is never invented: on GitHub Pages there is no function to answer
 * the request, so the widget stays hidden rather than displaying a fake figure.
 *
 * Heartbeat is deliberately infrequent. Workers KV free tier allows ~1000
 * writes/day, so a 30s beat per visitor would exhaust it almost immediately. */

const BEAT_MS = 5 * 60 * 1000;
const SESSION_KEY = "jpc.sid";

function sessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "anon" + Math.random().toString(36).slice(2);
  }
}

async function beat(el) {
  try {
    const res = await fetch("/api/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sid: sessionId() }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const n = Number(data.online);
    if (!Number.isFinite(n) || n < 1) throw new Error("no count");

    el.textContent = n === 1 ? "1 student in session" : n + " students in session";
    el.classList.remove("hidden");
  } catch {
    // No endpoint (static host), blocked, or offline - show nothing.
    el.classList.add("hidden");
  }
}

export function initPresence() {
  const el = document.getElementById("presence");
  if (!el) return;
  beat(el);
  setInterval(() => beat(el), BEAT_MS);
}
