// Serves canada.json and packs/*.pmtiles from the private R2 bucket.
// Cached at Cloudflare's edge so repeat downloads don't touch R2 at all.
let brake = { at: 0, paused: false };

async function downloadsPaused(env) {
  if (Date.now() - brake.at < 60_000) return brake.paused;
  try {
    const month = new Date().toISOString().slice(0, 7);
    const g = await env.DB.prepare("SELECT until FROM guard WHERE name = 'downloads'").first();
    brake = { at: Date.now(), paused: !!(g && g.until > month) };
  } catch {
    // guard table not created yet (admin never opened) means no brake
    brake = { at: Date.now(), paused: false };
  }
  return brake.paused;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    const key = url.pathname.slice(1);
    if (!(key === "canada.json" || /^packs\/[a-z]{2,8}-[0-9a-f]{12}\.pmtiles$/.test(key))) return new Response("Not found", { status: 404 });
    if (await downloadsPaused(env)) {
      return new Response("Map downloads are paused until next month. Installed maps keep working.", {
        status: 503, headers: { "Retry-After": "86400", "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    const cache = caches.default;
    const cacheKey = new Request(url.origin + "/" + key, { method: "GET" });
    const range = req.headers.get("Range");
    if (!range) {
      const hit = await cache.match(cacheKey);
      if (hit) return req.method === "HEAD" ? new Response(null, hit) : hit;
    }
    const obj = req.method === "HEAD" ? await env.MAPS.head(key) : await env.MAPS.get(key, { range: req.headers, onlyIf: req.headers });
    if (!obj) return new Response("Not found", { status: 404 });
    const h = new Headers();
    obj.writeHttpMetadata(h);
    h.set("ETag", obj.httpEtag);
    h.set("Accept-Ranges", "bytes");
    h.set("Access-Control-Allow-Origin", "*");
    if (!h.has("Cache-Control")) h.set("Cache-Control", key === "canada.json" ? "public, max-age=300" : "public, max-age=31536000, immutable");
    if (req.method === "HEAD") {
      h.set("Content-Length", String(obj.size));
      return new Response(null, { status: 200, headers: h });
    }
    if (!obj.body) return new Response(null, { status: 304, headers: h }); // If-None-Match matched
    if (range && obj.range) {
      const r = obj.range, start = r.offset ?? obj.size - r.suffix, len = r.length ?? obj.size - start;
      h.set("Content-Range", `bytes ${start}-${start + len - 1}/${obj.size}`);
      h.set("Content-Length", String(len));
      return new Response(obj.body, { status: 206, headers: h });
    }
    h.set("Content-Length", String(obj.size));
    const res = new Response(obj.body, { headers: h });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
};
