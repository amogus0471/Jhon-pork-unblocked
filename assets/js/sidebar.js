/* sidebar.js - slide-out lesson nav.
 *
 * Open/close mechanics only. The lesson list itself is rendered by catalog.js,
 * which is the module that actually has the counts. */

let open = false;
let els = {};

function set(state) {
  open = state;
  els.sidebar.dataset.open = String(state);
  els.scrim.dataset.open = String(state);
  els.hamburger.setAttribute("aria-expanded", String(state));
  document.body.style.overflow = state ? "hidden" : "";
  if (state) {
    // move focus in so the panel is keyboard-reachable
    (els.sidebar.querySelector(".sidebar-item") || els.close).focus({ preventScroll: true });
  } else {
    els.hamburger.focus({ preventScroll: true });
  }
}

export function closeSidebar() { if (open) set(false); }
export function openSidebar() { if (!open) set(true); }

export function initSidebar() {
  els.sidebar   = document.getElementById("sidebar");
  els.scrim     = document.getElementById("scrim");
  els.hamburger = document.getElementById("hamburger");
  els.close     = document.getElementById("sidebarClose");
  if (!els.sidebar || !els.hamburger) return;

  els.hamburger.addEventListener("click", () => set(!open));
  els.close.addEventListener("click", () => set(false));
  els.scrim.addEventListener("click", () => set(false));

  addEventListener("keydown", (ev) => {
    // Escape closes the panel, but only when it is the thing on screen -
    // it must not fight the player's fullscreen exit.
    if (ev.key === "Escape" && open) {
      ev.stopPropagation();
      set(false);
    }
  });
}
