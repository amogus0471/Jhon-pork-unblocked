/* sidebar.js - the left rail.
 *
 * On wide screens the rail is always visible and this does nothing. Below
 * 900px it becomes a slide-over, and these handlers drive it. The lesson list
 * inside is rendered by catalog.js, which owns the counts. */

let open = false;
const els = {};

function set(next) {
  open = next;
  els.rail.dataset.open = String(next);
  els.scrim.dataset.open = String(next);
  els.menubtn.setAttribute("aria-expanded", String(next));
  document.body.style.overflow = next ? "hidden" : "";
}

export function closeRail() { if (open) set(false); }
export function openRail() { if (!open) set(true); }

export function initRail() {
  els.rail    = document.getElementById("rail");
  els.scrim   = document.getElementById("scrim");
  els.menubtn = document.getElementById("menubtn");
  if (!els.rail || !els.menubtn) return;

  els.menubtn.addEventListener("click", () => set(!open));
  els.scrim.addEventListener("click", () => set(false));

  addEventListener("keydown", (ev) => {
    // Only swallow Escape while the slide-over is actually showing, so it
    // never competes with the player's fullscreen exit.
    if (ev.key === "Escape" && open) {
      ev.stopPropagation();
      set(false);
    }
  });
}
