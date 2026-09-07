/* Cloudflare Pages Function - per-module discussion board.
 *
 * Requires a KV namespace bound as COMMENTS. Comments are low volume, so the
 * free tier write budget is comfortable here (unlike the presence heartbeat).
 *
 * An anonymous public box on a school-adjacent site needs moderation from the
 * start, so this ships with: a length cap, per-IP rate limiting, a word
 * filter, and a delete path behind ADMIN_KEY. */

const MAX_LEN       = 500;
const MAX_NAME      = 32;
const MAX_PER_THREAD = 200;
const RATE_WINDOW   = 60;   // seconds
const RATE_MAX      = 3;    // posts per window per IP

const BLOCKED = [
  /\bn[i1]gg/i, /\bf[a@]gg/i, /\bk[i1]ke\b/i, /\btr[a@]nny\b/i,
  /\bc[o0]on\b/i, /\bret[a@]rd/i, /\bwh[o0]re\b/i, /\bk[i1]ll y[o0]urself\b/i,
  /\bkys\b/i,
];

export async function onRequestGet({ request, env }) {
  if (!env.COMMENTS) return json({ error: "discussion store not configured" }, 503);
  const slug = slugOf(request);
  if (!slug) return json({ error: "missing module" }, 400);

  const raw = await env.COMMENTS.get("t:" + slug);
  const thread = raw ? JSON.parse(raw) : [];
  return json({ comments: thread }, 200, { "cache-control": "no-store" });
}

export async function onRequestPost({ request, env }) {
  if (!env.COMMENTS) return json({ error: "discussion store not configured" }, 503);

  const slug = slugOf(request);
  if (!slug) return json({ error: "missing module" }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad request" }, 400); }

  const text = String(body.text || "").trim().slice(0, MAX_LEN);
  const name = String(body.name || "Anonymous").trim().slice(0, MAX_NAME) || "Anonymous";
  if (!text) return json({ error: "empty comment" }, 400);
  if (BLOCKED.some((re) => re.test(text) || re.test(name))) {
    return json({ error: "That message was blocked." }, 422);
  }

  // Rate limit on a hash of the IP - the raw address is never stored.
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const key = "r:" + (await sha256(ip)).slice(0, 24);
  const seen = Number((await env.COMMENTS.get(key)) || 0);
  if (seen >= RATE_MAX) {
    return json({ error: "Slow down a moment before posting again." }, 429);
  }
  await env.COMMENTS.put(key, String(seen + 1), { expirationTtl: RATE_WINDOW });

  const raw = await env.COMMENTS.get("t:" + slug);
  const thread = raw ? JSON.parse(raw) : [];
  thread.push({
    id: crypto.randomUUID(),
    name,
    text,
    at: new Date().toISOString(),
  });
  while (thread.length > MAX_PER_THREAD) thread.shift();

  await env.COMMENTS.put("t:" + slug, JSON.stringify(thread));
  return json({ ok: true, comments: thread }, 200, { "cache-control": "no-store" });
}

/* Moderation: DELETE /api/comments?module=<slug>&id=<id> with x-admin-key. */
export async function onRequestDelete({ request, env }) {
  if (!env.COMMENTS) return json({ error: "discussion store not configured" }, 503);
  if (!env.ADMIN_KEY || request.headers.get("x-admin-key") !== env.ADMIN_KEY) {
    return json({ error: "not authorised" }, 401);
  }
  const slug = slugOf(request);
  const id = new URL(request.url).searchParams.get("id");
  if (!slug || !id) return json({ error: "missing module or id" }, 400);

  const raw = await env.COMMENTS.get("t:" + slug);
  const thread = raw ? JSON.parse(raw) : [];
  const next = thread.filter((c) => c.id !== id);
  await env.COMMENTS.put("t:" + slug, JSON.stringify(next));
  return json({ ok: true, removed: thread.length - next.length });
}

function slugOf(request) {
  const s = new URL(request.url).searchParams.get("module") || "";
  return /^[a-z0-9][a-z0-9-]{0,79}$/i.test(s) ? s : null;
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
