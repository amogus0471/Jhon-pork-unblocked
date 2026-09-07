/* Cloudflare Pages Function - live "students in session" count.
 *
 * Real count or nothing: the client hides the widget when this endpoint is
 * unreachable, so a static host (GitHub Pages) simply shows no number rather
 * than a fabricated one.
 *
 * Requires a KV namespace bound as PRESENCE. Workers KV free tier allows
 * roughly 1000 writes/day, so the client heartbeats about once per 5 minutes
 * rather than continuously, and entries expire on their own.
 *
 * The count is approximate by construction: KV list is eventually consistent
 * and TTL expiry is not instant. It is honest about being approximate rather
 * than pretending to be exact. */

const WINDOW_SECONDS = 600; // a session counts as present for 10 minutes

export async function onRequestPost({ request, env }) {
  if (!env.PRESENCE) {
    return json({ error: "presence store not configured" }, 503);
  }

  let sid;
  try {
    const body = await request.json();
    sid = String(body.sid || "").slice(0, 64);
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (!/^[a-z0-9]{4,64}$/i.test(sid)) return json({ error: "bad session id" }, 400);

  // Refresh this session's marker, then count the live ones.
  await env.PRESENCE.put("s:" + sid, "1", { expirationTtl: WINDOW_SECONDS });

  const listed = await env.PRESENCE.list({ prefix: "s:", limit: 1000 });
  const online = listed.keys.length;

  return json({ online, approximate: true }, 200, {
    "cache-control": "no-store",
  });
}

export async function onRequestGet({ env }) {
  if (!env.PRESENCE) return json({ error: "presence store not configured" }, 503);
  const listed = await env.PRESENCE.list({ prefix: "s:", limit: 1000 });
  return json({ online: listed.keys.length, approximate: true }, 200, {
    "cache-control": "no-store",
  });
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
