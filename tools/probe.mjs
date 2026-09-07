import fs from "node:fs";
import path from "node:path";

const SRC = process.env.UGS_SOURCE || "C:/Users/Jeanluc/Downloads/UGS Files old-20260907T182733Z-1-001/UGS Files old";
const RE_JSDELIVR = /https?:\/\/cdn\.jsdelivr\.net\/[^\s"'<>)]+/gi;
const RE_BASE = /<base\s+href=["'](https?:\/\/[^"']+)["']/i;

const files = fs.readdirSync(SRC).filter(f => /\.html?$/i.test(f));
// deterministic spread across the corpus
const step = Math.floor(files.length / 40);
const sample = [];
for (let i = 0; i < files.length && sample.length < 40; i += step) sample.push(files[i]);

const jsd = new Set(), sites = new Set();
for (const f of sample) {
  const p = path.join(SRC, f);
  if (fs.statSync(p).size > 200000) continue;
  const head = fs.readFileSync(p, "utf8").slice(0, 40000);
  for (const u of head.match(RE_JSDELIVR) || []) jsd.add(u);
  const b = head.match(RE_BASE);
  if (b) sites.add(b[1]);
}

async function probe(url) {
  const ctl = AbortSignal.timeout(12000);
  try {
    const r = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, signal: ctl });
    const len = r.headers.get("content-range")?.split("/")[1] || r.headers.get("content-length") || "?";
    return { url, ok: r.ok || r.status === 206, status: r.status, size: len };
  } catch (e) {
    return { url, ok: false, status: "ERR", size: "-", err: String(e.name || e).slice(0, 30) };
  }
}

const targets = [...jsd].slice(0, 22).concat([...sites].slice(0, 8));
console.log("Probing " + targets.length + " URLs (" + jsd.size + " jsdelivr, " + sites.size + " sites found in sample)\n");

const results = await Promise.all(targets.map(probe));
let okc = 0;
for (const r of results) {
  if (r.ok) okc++;
  const kind = r.url.includes("jsdelivr") ? "jsd " : "site";
  console.log((r.ok ? " OK " : "FAIL") + " " + kind + " " + String(r.status).padEnd(5) + String(r.size).padStart(10) + "  " + r.url.slice(0, 92));
}
console.log("\nReachable: " + okc + "/" + results.length);
