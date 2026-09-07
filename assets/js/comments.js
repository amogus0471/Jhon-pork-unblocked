/* comments.js - per-module discussion board.
 *
 * Hides itself entirely when /api/comments is unreachable, so on a static host
 * the page simply has no discussion section rather than a broken one. */

const MAX_LEN = 500;

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  if (mins < 1440) return Math.floor(mins / 60) + "h ago";
  return d.toLocaleDateString();
}

function render(list, items) {
  if (!items.length) {
    list.innerHTML = `<p class="muted">No posts yet. Start the discussion.</p>`;
    return;
  }
  list.innerHTML = items.slice().reverse().map((c) => `
    <div class="card" style="padding:14px 16px;margin-bottom:10px;box-shadow:2px 2px 0 var(--ink)">
      <div class="row" style="gap:8px;margin-bottom:4px">
        <strong style="font-size:.9rem">${esc(c.name)}</strong>
        <span class="muted" style="font-size:.75rem">${esc(when(c.at))}</span>
      </div>
      <div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(c.text)}</div>
    </div>`).join("");
}

export async function initComments(slug) {
  const section = document.getElementById("discussion");
  if (!section || !slug) return;

  const list = document.getElementById("commentList");
  const form = document.getElementById("commentForm");
  const text = document.getElementById("commentText");
  const name = document.getElementById("commentName");
  const status = document.getElementById("commentStatus");

  const url = "/api/comments?module=" + encodeURIComponent(slug);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    render(list, data.comments || []);
    section.classList.remove("hidden");
  } catch {
    section.classList.add("hidden"); // no backend on this host
    return;
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const body = text.value.trim();
    if (!body) return;
    status.textContent = "Posting...";

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: body.slice(0, MAX_LEN), name: name.value.trim() }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        status.textContent = data.error || "Could not post.";
        return;
      }
      text.value = "";
      status.textContent = "";
      render(list, data.comments || []);
    } catch {
      status.textContent = "Could not reach the discussion board.";
    }
  });
}
