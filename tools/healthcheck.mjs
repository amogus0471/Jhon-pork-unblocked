#!/usr/bin/env node
/**
 * healthcheck.mjs - verify every module in the manifest is actually loadable.
 *
 *   node tools/healthcheck.mjs             check everything
 *   node tools/healthcheck.mjs --remote    only remote-fallback modules
 *   node tools/healthcheck.mjs --write     write results back to games.json
 *
 * Vendored modules are checked on disk. Remote-fallback modules are checked by
 * probing their upstream, which is the failure that actually happens: the
 * upstream repo gets deleted or jsDelivr starts refusing it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const ONLY_REMOTE = argv.includes("--remote");
const WRITE = argv.includes("--write");
const CONCURRENCY = 12;

const manifestPath = path.join(ROOT, "data", "games.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function checkLocal(g) {
  if (!g.src) return { ok: false, why: "no src" };
  const p = path.join(ROOT, g.src);
  if (!fs.existsSync(p)) return { ok: false, why: "file missing" };
  const size = fs.statSync(p).size;
  if (size < 200) return { ok: false, why: "file suspiciously small (" + size + "B)" };
  return { ok: true, why: "" };
}

async function probe(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });
    if (res.ok || res.status === 206) return { ok: true, why: "" };
    return { ok: false, why: "HTTP " + res.status };
  } catch (e) {
    return { ok: false, why: String(e.name || e).slice(0, 40) };
  }
}

async function checkRemote(g) {
  const local = checkLocal(g);
  if (!local.ok) return local;
  const refs = (g.upstream || []).filter((u) => /^https?:\/\//.test(u));
  if (!refs.length) return { ok: true, why: "no upstream recorded", unknown: true };

  /* jsDelivr answers 403 for a directory path even when the files inside it
     are fine, so probing a bare directory proves nothing. Only URLs naming an
     actual file are conclusive; the rest are reported unknown, not broken. */
  const files = refs.filter((u) => /\/[^\/?#]+\.[a-z0-9]{2,6}(\?|#|$)/i.test(u));
  if (!files.length) {
    return { ok: true, why: "upstream is a directory, not verifiable", unknown: true };
  }

  // One dead dependency is enough to break the module.
  for (const url of files.slice(0, 2)) {
    const r = await probe(url);
    if (!r.ok) return { ok: false, why: "upstream " + r.why };
  }
  return { ok: true, why: "" };
}

async function pool(items, worker) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const n = i++;
      out[n] = await worker(items[n], n);
      if (n && n % 200 === 0) process.stdout.write("  ... " + n + "/" + items.length + "\n");
    }
  }));
  return out;
}

const targets = manifest.games.filter((g) => {
  if (g.status === "oversized-deferred" || g.status === "needs-review") return false;
  if (ONLY_REMOTE) return g.status === "remote-fallback";
  return true;
});

console.log("Checking " + targets.length + " modules (concurrency " + CONCURRENCY + ")\n");

const results = await pool(targets, async (g) =>
  g.status === "vendored" ? checkLocal(g) : await checkRemote(g)
);

const broken = [];
targets.forEach((g, n) => {
  const r = results[n];
  g.healthy = r.ok;
  if (r.unknown) g.healthUnknown = true;
  g.healthNote = r.why || undefined;
  g.checked = new Date().toISOString().slice(0, 10);
  if (!r.ok) broken.push({ title: g.title, slug: g.slug, why: r.why, status: g.status });
});

const okCount = results.filter((r) => r.ok && !r.unknown).length;
const unknownCount = results.filter((r) => r.unknown).length;
console.log("\nhealthy " + okCount + " / " + targets.length);
console.log("unverifiable " + unknownCount + "  (upstream is a directory - not conclusive)");
console.log("broken       " + broken.length);

const byReason = new Map();
for (const b of broken) byReason.set(b.why, (byReason.get(b.why) || 0) + 1);
for (const [why, n] of [...byReason].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log("  " + String(n).padStart(4) + "  " + why);
}

if (WRITE) {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  console.log("\nwrote health flags into data/games.json");
} else {
  console.log("\n(dry run - pass --write to record results in games.json)");
}
