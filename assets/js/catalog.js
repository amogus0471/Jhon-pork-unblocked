/* catalog.js - row-based browsing.
 *
 * Home shows a Popular strip plus one strip per lesson, which is far easier
 * to scan than a wall of ~2800 tiles. Searching, picking a lesson, or hitting
 * "Show everything" switches to a flat grid that fills in progressively. */

import { tileSVG, esc } from "./tiles.js";
import { closeRail } from "./sidebar.js";

const BATCH = 72;
const PER_ROW = 14;

const state = {
  all: [],
  filtered: [],
  shown: 0,
  q: "",
  lesson: "All",
  hideDown: false,
  onlyHot: false,
  mode: "home",
};

const els = {};

function playable(g) {
  return g.healthy !== false && (g.status === "vendored" || g.status === "remote-fallback");
}

function tileHTML(g) {
  const dead = g.healthy === false;
  const art = g.art
    ? `<img src="${esc(g.art)}" alt="" loading="lazy" decoding="async">`
    : tileSVG(g);

  let flag = "";
  if (dead) flag = `<span class="flag">Down</span>`;
  else if (g.popular) flag = `<span class="flag flag-hot">Hot</span>`;
  else if (g.engine === "ruffle") flag = `<span class="flag flag-flash">Flash</span>`;
  else if (g.status === "vendored") flag = `<span class="flag flag-local">Local</span>`;

  const inner = flag + `<div class="tile-art">${art}</div><span class="tile-name">${esc(g.title)}</span>`;

  return playable(g)
    ? `<a class="tile" href="play.html?id=${encodeURIComponent(g.slug)}">${inner}</a>`
    : `<div class="tile" aria-disabled="true" title="${esc(g.healthNote || g.note || "Unavailable")}">${inner}</div>`;
}

function visible(g) {
  if (state.hideDown && g.healthy === false) return false;
  return true;
}

function matchesQuery(g) {
  if (!state.q) return true;
  return g.title.toLowerCase().includes(state.q) ||
         (g.lesson || "").toLowerCase().includes(state.q);
}

function renderHome() {
  const pool = state.all.filter(visible);
  const chunks = [];

  const hot = pool.filter((g) => g.popular);
  if (hot.length) chunks.push(["Popular now", "__hot", hot]);

  const byLesson = new Map();
  for (const g of pool) {
    if (!byLesson.has(g.lesson)) byLesson.set(g.lesson, []);
    byLesson.get(g.lesson).push(g);
  }
  // Biggest lessons first, but the catch-all goes last since it is the least
  // informative shelf on the page.
  const ordered = [...byLesson].sort((a, b) => {
    if (a[0] === "General Studies") return 1;
    if (b[0] === "General Studies") return -1;
    return b[1].length - a[1].length;
  });
  for (const [name, list] of ordered) chunks.push([name, name, list]);

  els.rows.innerHTML = chunks.map(function (c) {
    const label = c[0], key = c[1], list = c[2];
    return `<section>
      <div class="row-head">
        <span class="row-title">${esc(label)}</span>
        <button class="row-more" data-lesson="${esc(key)}" type="button">View more</button>
        <span class="row-count">${list.length.toLocaleString()}</span>
      </div>
      <div class="strip">${list.slice(0, PER_ROW).map(tileHTML).join("")}</div>
    </section>`;
  }).join("");

  els.rows.querySelectorAll(".row-more").forEach((b) => {
    b.addEventListener("click", () => {
      const k = b.dataset.lesson;
      if (k === "__hot") { state.lesson = "All"; state.onlyHot = true; }
      else { state.lesson = k; state.onlyHot = false; }
      state.mode = "flat";
      sync(); render();
      scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  els.empty.classList.add("hidden");
  els.loadwrap.classList.remove("hidden");
  els.sentinel.classList.add("hidden");
}

function renderFlat() {
  state.filtered = state.all.filter((g) =>
    visible(g) &&
    matchesQuery(g) &&
    (state.lesson === "All" || g.lesson === state.lesson) &&
    (!state.onlyHot || g.popular)
  );
  state.shown = 0;

  const label = state.q ? "Results for " + state.q
    : state.onlyHot ? "Popular now"
    : state.lesson !== "All" ? state.lesson
    : "All resources";

  els.rows.innerHTML = `
    <div class="row-head">
      <span class="row-title">${esc(label)}</span>
      <span class="row-count">${state.filtered.length.toLocaleString()}</span>
    </div>
    <div class="grid" id="flatgrid"></div>`;

  els.empty.classList.toggle("hidden", state.filtered.length > 0);
  els.loadwrap.classList.add("hidden");
  more();
}

function more() {
  const grid = document.getElementById("flatgrid");
  if (!grid) return;
  const next = state.filtered.slice(state.shown, state.shown + BATCH);
  if (!next.length) { els.sentinel.classList.add("hidden"); return; }
  grid.insertAdjacentHTML("beforeend", next.map(tileHTML).join(""));
  state.shown += next.length;
  els.sentinel.classList.toggle("hidden", state.shown >= state.filtered.length);
}

function render() {
  if (state.mode === "home" && !state.q) renderHome();
  else renderFlat();
  markRail();
}

function buildRail() {
  const pool = state.all.filter((g) => g.healthy !== false);
  els.railAllCount.textContent = pool.length.toLocaleString();

  const counts = new Map();
  for (const g of pool) counts.set(g.lesson, (counts.get(g.lesson) || 0) + 1);

  els.railLessons.innerHTML = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(function (c) {
      return `<button class="rail-link" data-lesson="${esc(c[0])}" type="button" aria-pressed="false">
        <span>${esc(c[0])}</span><span class="rail-count">${c[1].toLocaleString()}</span>
      </button>`;
    }).join("");

  els.railLessons.addEventListener("click", (ev) => {
    const b = ev.target.closest(".rail-link");
    if (!b) return;
    state.lesson = b.dataset.lesson;
    state.onlyHot = false;
    state.mode = "flat";
    state.q = ""; els.search.value = "";
    sync(); render(); closeRail();
    scrollTo({ top: 0, behavior: "smooth" });
  });

  els.railAll.addEventListener("click", () => {
    state.lesson = "All"; state.onlyHot = false; state.mode = "flat";
    state.q = ""; els.search.value = "";
    sync(); render(); closeRail();
    scrollTo({ top: 0, behavior: "smooth" });
  });
}

function markRail() {
  els.railLessons.querySelectorAll(".rail-link").forEach((b) =>
    b.setAttribute("aria-pressed",
      String(state.mode === "flat" && b.dataset.lesson === state.lesson)));
  els.railAll.setAttribute("aria-pressed",
    String(state.mode === "flat" && state.lesson === "All" && !state.onlyHot && !state.q));
}

function sync() {
  const u = new URL(location.href);
  state.q ? u.searchParams.set("q", state.q) : u.searchParams.delete("q");
  state.lesson !== "All" ? u.searchParams.set("lesson", state.lesson) : u.searchParams.delete("lesson");
  state.mode === "flat" ? u.searchParams.set("view", "all") : u.searchParams.delete("view");
  history.replaceState(null, "", u);
}

function readURL() {
  const u = new URL(location.href);
  state.q = (u.searchParams.get("q") || "").toLowerCase();
  state.lesson = u.searchParams.get("lesson") || "All";
  if (state.q || state.lesson !== "All" || u.searchParams.get("view") === "all") state.mode = "flat";
  if (state.q) els.search.value = state.q;
}

export async function initCatalog() {
  els.rows         = document.getElementById("rows");
  els.search       = document.getElementById("search");
  els.empty        = document.getElementById("empty");
  els.sentinel     = document.getElementById("sentinel");
  els.loadwrap     = document.getElementById("loadwrap");
  els.railLessons  = document.getElementById("railLessons");
  els.railAll      = document.getElementById("railAll");
  els.railAllCount = document.getElementById("railAllCount");

  let data;
  try {
    const res = await fetch("data/games.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    data = await res.json();
  } catch (err) {
    els.rows.innerHTML = `<div class="notice">Could not load the index (${esc(err.message)}). Run <code>node tools/ingest.mjs --build</code>.</div>`;
    return;
  }

  state.all = data.games || [];
  readURL();
  buildRail();
  render();

  let t;
  els.search.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.q = els.search.value.trim().toLowerCase();
      state.mode = state.q ? "flat" : "home";
      if (!state.q) { state.lesson = "All"; state.onlyHot = false; }
      sync(); render();
    }, 120);
  });

  document.getElementById("loadmore").addEventListener("click", () => {
    state.mode = "flat"; state.lesson = "All"; state.onlyHot = false;
    sync(); render();
    scrollTo({ top: 0, behavior: "smooth" });
  });

  const hide = document.getElementById("hideDownBtn");
  hide.addEventListener("click", () => {
    state.hideDown = !state.hideDown;
    hide.setAttribute("aria-pressed", String(state.hideDown));
    render();
  });

  new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) more(); },
    { rootMargin: "700px" }).observe(els.sentinel);
}
