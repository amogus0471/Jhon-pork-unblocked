# Deploying

Two hosts, one repo, same static output. Nothing here needs a build step.

## 1. GitHub Pages

Settings -> Pages -> Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.

`.nojekyll` is already committed so directories are served as-is.

Presence and the discussion board have no backend on Pages, so both widgets
hide themselves. Everything else works.

Live at: `https://amogus0471.github.io/Jhon-pork-unblocked/`

## 2. Cloudflare Pages

Connect the same repo (Workers & Pages -> Create -> Pages -> Connect to Git).

- Build command: *(leave empty)*
- Build output directory: `/`

Cloudflare picks up `functions/` automatically, which is what brings the two
dynamic features to life.

### KV bindings

Create two KV namespaces (Storage & Databases -> KV), then bind them under
Settings -> Functions -> KV namespace bindings:

| Variable name | Namespace | Used by |
|---|---|---|
| `PRESENCE` | e.g. `jpc-presence` | students-in-session count |
| `COMMENTS` | e.g. `jpc-comments` | discussion board |

### Environment variable

| Name | Value | Used by |
|---|---|---|
| `ADMIN_KEY` | a long random string you keep | deleting comments |

Without `ADMIN_KEY` the delete endpoint refuses every request, which is the
safe default.

Delete a comment:

```
curl -X DELETE -H "x-admin-key: YOUR_KEY" \
  "https://YOUR-SITE.pages.dev/api/comments?module=SLUG&id=COMMENT_ID"
```

## 3. Custom domain (recommended later)

`github.io` is the most category-recognised host of its kind, so a plain
`.com` pointed at either host is the single biggest durability win. Add it in
Pages settings, then commit a `CNAME` file containing just the domain.

Because both hosts serve the same repo with relative links only, you can point
a domain at either one and swap without touching the site.

## Rebuilding the catalog

```
node tools/ingest.mjs --scan            # classify only, no writes, no network
node tools/ingest.mjs --build           # rebuild games/ and data/games.json
node tools/healthcheck.mjs --write      # probe upstreams, record health flags
```

`--build` clears `games/` and regenerates from the source folder, so it is safe
to re-run. Point it elsewhere with `UGS_SOURCE=/path/to/files`.

## Pushing large updates

The initial import is ~390MB, which is too large for one HTTPS push. Push it in
chunks instead of one shot - the repo is already configured with a larger
`http.postBuffer`. If a push aborts with `RPC failed`, commit fewer modules per
commit and push again; nothing is lost, git just resends the missing objects.
