/* catalog.js - grid, instant search, lesson filter.
 * Renders progressively: ~2800 tiles at once would jank, so batches land as
 * the sentinel scrolls into view. No dependencies. */

import { tileSVG, esc } from "./tiles.js";

const BATCH = 60;

const state = {
  all: [],
  filtered: [],
  shown: 0,
  q: "",
  lesson: "All",
  hideDown: false,
};

const els = {};

const STATUS_CHIP = {
  "vendored":           ["chip-verified", "Verified"],
  "remote-fallback":    ["chip-remote",   "Hosted"],
  "oversized-deferred": ["chip-review",   "Unavailable"],
  "needs-review":       ["chip-review",   "Review"],
};

function matches(g) {
  if (state.hideDown && g.healthy === false) return false;
  if (state.lesson !== "All" && g.lesson !== state.lesson) return false;
  if (!state.q) return true;
  const q = state.q;
  return g.title.toLowerCase().includes(q) ||
         (g.lesson || "").toLowerCase().includes(q) ||
         (g.tags || []).some((t) => t.toLowerCase().includes(q));
}

function applyFilter() {
  state.filtered = state.all.filter(matches);
  state.shown = 0;
  els.grid.innerHTML = "";
  els.count.textContent = state.filtered.length.toLocaleString() +
    (state.filtered.length === 1 ? " module" : " modules");
  els.empty.classList.toggle("hidden", state.filtered.length > 0);
  renderMore();
}

function tileHTML(g) {
  // healthy === false means the health check actually reached the upstream and
  // it was gone. Undefined means never checked; unknown means not conclusive.
  const dead = g.healthy === false;
  const playable = !dead && (g.status === "vendored" || g.status === "remote-fallback");
  const [chipClass, chipLabel] = dead
    ? ["chip-review", "Down"]
    : (STATUS_CHIP[g.status] || ["chip-review", "Unknown"]);
  const art = g.art
    ? `<img src="${esc(g.art)}" alt="" loading="lazy" decoding="async">`
    : tileSVG(g);
  const flash = g.engine === "ruffle"
    ? `<span class="sticker sticker-tr">Flash</span>` : "";

  const inner = `
    <div class="tile-art">${art}</div>
    ${flash}
    <div class="tile-body">
      <span class="tile-title">${esc(g.title)}</span>
      <span class="tile-meta">
        <span class="chip ${chipClass}">${chipLabel}</span>
      </span>
    </div>`;

  return playable
    ? `<a class="tile" href="play.html?id=${encodeURIComponent(g.slug)}">${inner}</a>`
    : `<div class="tile" aria-disabled="true" title="${esc(g.healthNote || g.note || "Unavailable")}" style="opacity:.5">${inner}</div>`;
}

function renderMore() {
  const next = state.filtered.slice(state.shown, state.shown + BATCH);
  if (!next.length) { els.sentinel.classList.add("hidden"); return; }
  els.grid.insertAdjacentHTML("beforeend", next.map(tileHTML).join(""));
  state.shown += next.length;
  els.sentinel.classList.toggle("hidden", state.shown >= state.filtered.length);
}

function buildLessonBar(lessons) {
  const opts = ["All", ...lessons];
  els.lessonbar.innerHTML = opts.map((l) =>
    `<button class="lessonbtn" data-lesson="${esc(l)}" aria-pressed="${l === state.lesson}">${esc(l)}</button>`
  ).join("");

  els.lessonbar.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".lessonbtn");
    if (!btn) return;
    state.lesson = btn.dataset.lesson;
    [...els.lessonbar.children].forEach((b) =>
      b.setAttribute("aria-pressed", String(b === btn)));
    syncURL();
    applyFilter();
  });
}

function syncURL() {
  const u = new URL(location.href);
  state.q ? u.searchParams.set("q", state.q) : u.searchParams.delete("q");
  state.lesson !== "All" ? u.searchParams.set("lesson", state.lesson) : u.searchParams.delete("lesson");
  history.replaceState(null, "", u);
}

function readURL() {
  const u = new URL(location.href);
  state.q = (u.searchParams.get("q") || "").toLowerCase();
  state.lesson = u.searchParams.get("lesson") || "All";
  if (state.q) els.search.value = state.q;
}

export async function initCatalog() {
  els.grid      = document.getElementById("grid");
  els.search    = document.getElementById("search");
  els.lessonbar = document.getElementById("lessonbar");
  els.count     = document.getElementById("count");
  els.empty     = document.getElementById("empty");
  els.sentinel  = document.getElementById("sentinel");

  let data;
  try {
    const res = await fetch("data/games.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    data = await res.json();
  } catch (err) {
    els.grid.innerHTML = `<div class="notice">Could not load the syllabus (${esc(err.message)}). Run <code>node tools/ingest.mjs --build</code>.</div>`;
    return;
  }

  state.all = data.games || [];
  readURL();
  buildLessonBar(data.lessons || []);
  applyFilter();

  let t;
  els.search.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.q = els.search.value.trim().toLowerCase();
      syncURL();
      applyFilter();
    }, 120);
  });

  const hideBtn = document.getElementById("hideDownBtn");
  if (hideBtn) {
    hideBtn.addEventListener("click", () => {
      state.hideDown = !state.hideDown;
      hideBtn.setAttribute("aria-pressed", String(state.hideDown));
      applyFilter();
    });
  }

  new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) renderMore();
  }, { rootMargin: "600px" }).observe(els.sentinel);
}
