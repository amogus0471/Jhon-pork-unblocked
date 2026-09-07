/* player.js - mounts one module and runs Presentation Mode. */

import { esc } from "./tiles.js";

let current = null;

function qs(name) {
  return new URL(location.href).searchParams.get(name);
}

function mount(game) {
  const stage = document.getElementById("stage");
  // Built as an element rather than markup so the src is never string-concatenated.
  const frame = document.createElement("iframe");
  frame.src = game.src;
  frame.title = game.title;
  frame.allow = "autoplay; fullscreen; gamepad; keyboard-map; clipboard-write";
  frame.setAttribute("allowfullscreen", "");
  stage.innerHTML = "";
  stage.appendChild(frame);
  return frame;
}

function chipFor(status) {
  const map = {
    "vendored":        ["chip-verified", "Verified - hosted here"],
    "remote-fallback": ["chip-remote",   "Hosted upstream"],
  };
  return map[status] || ["chip-review", "Unavailable"];
}

export async function initPlayer() {
  const id = qs("id");
  const titleEl  = document.getElementById("moduleTitle");
  const metaEl   = document.getElementById("moduleMeta");
  const stage    = document.getElementById("stage");
  const noticeEl = document.getElementById("notice");

  let data;
  try {
    const res = await fetch("data/games.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    data = await res.json();
  } catch (err) {
    stage.innerHTML = "";
    noticeEl.textContent = "Could not load the syllabus: " + err.message;
    noticeEl.classList.remove("hidden");
    return;
  }

  const game = (data.games || []).find((g) => g.slug === id);
  if (!game) {
    titleEl.textContent = "Module not found";
    stage.innerHTML = "";
    noticeEl.textContent = "No module matches that id. It may have been renamed - try the catalog.";
    noticeEl.classList.remove("hidden");
    return;
  }

  current = game;
  document.title = game.title + " - Jhon Pork's Classroom";
  titleEl.textContent = game.title;

  const [cls, label] = chipFor(game.status);
  metaEl.innerHTML =
    `<span class="chip chip-lesson">${esc(game.lesson || "General Studies")}</span>` +
    `<span class="chip ${cls}">${esc(label)}</span>` +
    (game.engine === "ruffle" ? `<span class="chip chip-flash">Flash</span>` : "");

  if (!game.src) {
    stage.innerHTML = "";
    noticeEl.textContent = "This module is not published in this build (" + (game.note || game.status) + ").";
    noticeEl.classList.remove("hidden");
    return;
  }

  if (game.status === "remote-fallback") {
    noticeEl.textContent = "This module still loads from an upstream host, so it can break if that host goes away or is blocked.";
    noticeEl.classList.remove("hidden");
  }

  mount(game);

  document.getElementById("fullscreenBtn").addEventListener("click", () => {
    const el = document.getElementById("stage");
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => { /* denied */ });
  });

  document.getElementById("reloadBtn").addEventListener("click", () => mount(current));
}
