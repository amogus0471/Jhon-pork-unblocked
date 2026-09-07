/* catalog.js - featured shelf, search, lesson filter, progressive grid.
 *
 * The front page shows a curated featured set rather than all ~2800 modules:
 * a wall of every entry is slower and harder to use than a shelf of the ones
 * worth playing. Searching or picking a lesson switches to the full catalog
 * automatically, since at that point you are looking for something specific. */

import { tileSVG, esc } from "./tiles.js";
import { closeSidebar } from "./sidebar.js";

const BATCH = 60;

const state = {
  all: [],
  filtered: [],
  shown: 0,
  q: "",
  lesson: "All",
  hideDown: false,
  featuredOnly: true,
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
  if (state.featuredOnly && !g.popular) return false;
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

  els.shelfTitle.textContent = state.q
    ? "Search results"
    : state.lesson !== "All"
      ? state.lesson
      : state.featuredOnly ? "Popular now" : "All modules";

  // The button only makes sense while a curated subset is on screen.
  els.loadmoreWrap.classList.toggle("hidden",
    !state.featuredOnly || !!state.q || state.lesson !== "All");

  renderMore();
}

function tileHTML(g) {
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

function buildSidebar() {
  const counts = new Map();
  for (const g of state.all) {
    if (g.healthy === false) continue;
    counts.set(g.lesson, (counts.get(g.lesson) || 0) + 1);
  }
  const rows = [["All", state.all.filter((g) => g.healthy !== false).length]]
    .concat([...counts].sort((a, b) => b[1] - a[1]));

  els.sidebarList.innerHTML = rows.map(([name, n]) => `
    <button class="sidebar-item" data-lesson="${esc(name)}" aria-pressed="${name === state.lesson}">
      <span>${esc(name === "All" ? "All modules" : name)}</span>
      <span class="sidebar-count">${n.toLocaleString()}</span>
    </button>`).join("");

  els.sidebarList.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".sidebar-item");
    if (!btn) return;
    state.lesson = btn.dataset.lesson;
    if (state.lesson !== "All") state.featuredOnly = false;
    [...els.sidebarList.children].forEach((b) =>
      b.setAttribute("aria-pressed", String(b === btn)));
    syncURL();
    applyFilter();
    closeSidebar();
    scrollTo({ top: 0, behavior: "smooth" });
  });
}

function syncURL() {
  const u = new URL(location.href);
  state.q ? u.searchParams.set("q", state.q) : u.searchParams.delete("q");
  state.lesson !== "All" ? u.searchParams.set("lesson", state.lesson) : u.searchParams.delete("lesson");
  state.featuredOnly ? u.searchParams.delete("all") : u.searchParams.set("all", "1");
  history.replaceState(null, "", u);
}

function readURL() {
  const u = new URL(location.href);
  state.q = (u.searchParams.get("q") || "").toLowerCase();
  state.lesson = u.searchParams.get("lesson") || "All";
  if (u.searchParams.get("all") === "1" || state.q || state.lesson !== "All") {
    state.featuredOnly = false;
  }
  if (state.q && els.search) els.search.value = state.q;
}

export async function initCatalog() {
  els.grid         = document.getElementById("grid");
  els.search       = document.getElementById("search");
  els.count        = document.getElementById("count");
  els.empty        = document.getElementById("empty");
  els.sentinel     = document.getElementById("sentinel");
  els.shelfTitle   = document.getElementById("shelfTitle");
  els.loadmore     = document.getElementById("loadmore");
  els.loadmoreWrap = document.getElementById("loadmoreWrap");
  els.sidebarList  = document.getElementById("sidebarList");

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
  // If nothing is flagged featured, fall back to showing everything rather
  // than an empty front page.
  if (!state.all.some((g) => g.popular)) state.featuredOnly = false;

  readURL();
  buildSidebar();
  applyFilter();

  let t;
  els.search.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.q = els.search.value.trim().toLowerCase();
      if (state.q) state.featuredOnly = false;
      syncURL();
      applyFilter();
    }, 120);
  });

  els.loadmore.addEventListener("click", () => {
    state.featuredOnly = false;
    syncURL();
    applyFilter();
  });

  const hideBtn = document.getElementById("hideDownBtn");
  hideBtn?.addEventListener("click", () => {
    state.hideDown = !state.hideDown;
    hideBtn.setAttribute("aria-pressed", String(state.hideDown));
    applyFilter();
  });

  new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) renderMore();
  }, { rootMargin: "600px" }).observe(els.sentinel);
}
