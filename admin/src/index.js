// Double Perspective admin Worker.
// Every request must carry a valid Cloudflare Access token for the owner; anything
// else gets 403. Mutating requests also need the X-DP-Admin header (blocks CSRF).
import { EmailMessage } from "cloudflare:email";
import { PAGE_HTML, APP_JS } from "./ui.js";

// ---- Free-plan limits the usage monitor compares against -------------------
const LIMITS = {
  workersRequestsDay: 100_000,
  d1RowsReadDay: 5_000_000,
  d1RowsWrittenDay: 100_000,
  d1StorageBytes: 5 * 1024 ** 3,
  r2StorageBytes: 10 * 1024 ** 3,
  r2ClassAMonth: 1_000_000,
  r2ClassBMonth: 10_000_000,
};
const WARN_LEVELS = [0.7, 0.9, 0.95];
// At this share of an R2 free limit, downloads (maps Worker) or uploads (admin) pause
// until the month resets, so R2 can never bill.
const R2_BRAKE = 0.95;

// Website fields that "quick edits" may change, and the EN/FR files holding them.
const EDIT_FIELDS = {
  "umbral-status": { label: "Umbral Purge status (homepage)", files: ["index.html", "fr/index.html"] },
  "zz-status": { label: "Zenith & Zero status (homepage)", files: ["index.html", "fr/index.html"] },
  "zz-hero-status": { label: "Zenith & Zero status (games page)", files: ["zenith-zero.html", "fr/zenith-zero.html"] },
  "lirecho-store": { label: "Lirecho store button", files: ["index.html", "fr/index.html"] },
  "lirecho-note": { label: "Lirecho version note", files: ["index.html", "fr/index.html"] },
  "estivite-note": { label: "Estivite note", files: ["index.html", "fr/index.html"] },
  "sacado-note": { label: "Sac-à-Do note", files: ["index.html", "fr/index.html"] },
};

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

export default {
  async fetch(req, env, ctx) {
    try {
      const user = await verifyAccess(req, env);
      if (!user) return text("Forbidden", 403);
      await ensureSchema(env);
      const url = new URL(req.url);
      const method = req.method;
      if (method !== "GET" && method !== "HEAD" && req.headers.get("X-DP-Admin") !== "1") {
        return text("Missing X-DP-Admin header", 403);
      }
      const ctxInfo = { email: user.email, ip: req.headers.get("CF-Connecting-IP") || "", country: req.cf?.country || "" };

      if (url.pathname === "/" && method === "GET") {
        ctx.waitUntil(log(env, ctxInfo, "open-dashboard", ""));
        return html(PAGE_HTML);
      }
      if (url.pathname === "/app.js") return new Response(APP_JS, { headers: { ...SECURITY_HEADERS, "Content-Type": "text/javascript; charset=utf-8" } });
      if (url.pathname === "/api/me") return json({ email: user.email, team: env.ACCESS_TEAM });
      if (url.pathname === "/api/usage" && method === "GET") return json(await getUsage(env));
      if (url.pathname === "/api/log" && method === "GET") return json(await getLog(env));
      if (url.pathname === "/api/packs" && method === "GET") return json(await getPacks(env));
      if (url.pathname === "/api/catalog" && method === "PUT") return json(await putCatalog(req, env, ctxInfo));
      const pm = url.pathname.match(/^\/api\/packs\/([a-z]{2,8})$/);
      if (pm && method === "PUT") return json(await putPack(req, env, ctxInfo, pm[1]));
      const im = url.pathname.match(/^\/api\/packs\/([a-z]{2,8})\/import$/);
      if (im && method === "POST") return json(await importPack(req, env, ctxInfo, im[1]));
      if (url.pathname === "/api/edits" && method === "GET") return json(await getEdits(env));
      if (url.pathname === "/api/edits" && method === "POST") return json(await postEdit(req, env, ctxInfo));
      return text("Not found", 404);
    } catch (e) {
      return json({ error: String(e && e.message ? e.message : e) }, 500);
    }
  },

  // Hourly: compare usage with free-plan limits and email the owner at 70% and 90%.
  async scheduled(event, env, ctx) {
    await ensureSchema(env);
    const usage = await getUsage(env);
    const day = new Date().toISOString().slice(0, 10);
    const hits = [];
    for (const m of usage.metrics) {
      if (m.value == null || !m.limit) continue;
      const ratio = m.value / m.limit;
      for (const lvl of WARN_LEVELS) {
        if (ratio < lvl) continue;
        const period = m.period === "month" ? day.slice(0, 7) : day;
        const key = `${period}:${m.id}:${lvl}`;
        const seen = await env.DB.prepare("SELECT 1 FROM usage_alerts WHERE key = ?").bind(key).first();
        if (seen) continue;
        await env.DB.prepare("INSERT INTO usage_alerts (key, ts) VALUES (?, ?)").bind(key, Date.now()).run();
        hits.push(`${m.label}: ${fmt(m.value, m.unit)} of ${fmt(m.limit, m.unit)} (${Math.round(ratio * 100)}%) this ${m.period}`);
      }
    }
    // Brakes: pause R2 downloads/uploads near the free limits until next month.
    const month = day.slice(0, 7);
    const nextMonth = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 1)).toISOString().slice(0, 7);
    const brake = async (name, metricId, why) => {
      const m = usage.metrics.find((x) => x.id === metricId);
      if (!m || m.value == null || m.value / m.limit < R2_BRAKE) return;
      const cur = await env.DB.prepare("SELECT until FROM guard WHERE name = ?").bind(name).first();
      if (cur && cur.until >= nextMonth) return;
      await env.DB.prepare("INSERT OR REPLACE INTO guard (name, until, reason, ts) VALUES (?, ?, ?, ?)").bind(name, nextMonth, why, Date.now()).run();
      hits.push(`BRAKE ON: ${why}. Paused until ${nextMonth}-01 (UTC).`);
    };
    await brake("downloads", "r2-b", "map downloads paused, R2 reads at 95% of the free monthly limit");
    await brake("uploads", "r2-a", "uploads paused, R2 writes at 95% of the free monthly limit");
    await brake("uploads", "r2-storage", "uploads paused, R2 storage at 95% of the free 10 GB");
    // If the monitor itself can't read usage, say so once a day: no data means no brakes.
    if (usage.errors.length) {
      const key = `${day}:monitor-error`;
      const seen = await env.DB.prepare("SELECT 1 FROM usage_alerts WHERE key = ?").bind(key).first();
      if (!seen) {
        await env.DB.prepare("INSERT INTO usage_alerts (key, ts) VALUES (?, ?)").bind(key, Date.now()).run();
        hits.push("USAGE MONITOR: can't read " + usage.errors.join("; ") + ". Add or renew the CF_API_TOKEN secret on the dp-admin Worker (Settings > Variables and Secrets).");
      }
    }
    if (hits.length) {
      const onlyMonitor = hits.every((h) => h.startsWith("USAGE MONITOR"));
      await sendMail(env,
        onlyMonitor ? "Admin usage monitor can't read your Cloudflare usage" : `Cloudflare usage warning (${hits.length})`,
        (onlyMonitor
          ? "Nothing is near a limit as far as the admin knows, but it can't read your usage right now, so it can't warn you or pause R2 automatically.\n\n- "
          : "These free-plan limits are getting close:\n\n- ") + hits.join("\n- ") +
        "\n\nWorkers and D1 are on the free plan: they stop at the limit and never bill." +
        "\nR2 is the only service that could bill, so map downloads/uploads pause automatically at 95%." +
        "\nOpen https://admin.doubleperspective.com for details.\n");
      await log(env, { email: "cron", ip: "", country: "" }, "usage-alert", hits.join(" | "));
    }
  },
};

// ---- Cloudflare Access token check ----------------------------------------
let certCache = { at: 0, keys: [] };
async function verifyAccess(req, env) {
  const token = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_TEAM || !env.ACCESS_AUD || env.ACCESS_AUD.startsWith("REPLACE")) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = JSON.parse(b64urlText(parts[0]));
    payload = JSON.parse(b64urlText(parts[1]));
  } catch { return null; }
  if (header.alg !== "RS256") return null;
  const issuer = `https://${env.ACCESS_TEAM}.cloudflareaccess.com`;
  if (Date.now() - certCache.at > 3600_000 || !certCache.keys.find((k) => k.kid === header.kid)) {
    const r = await fetch(`${issuer}/cdn-cgi/access/certs`);
    if (!r.ok) return null;
    certCache = { at: Date.now(), keys: (await r.json()).keys || [] };
  }
  const jwk = certCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) return null;
  const now = Date.now() / 1000;
  if (!payload.exp || payload.exp < now) return null;
  if (payload.nbf && payload.nbf > now + 60) return null;
  if (payload.iss !== issuer) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (String(payload.email || "").toLowerCase() !== String(env.OWNER_EMAIL).toLowerCase()) return null;
  return payload;
}

// ---- Database --------------------------------------------------------------
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, email TEXT, ip TEXT, country TEXT, action TEXT NOT NULL, detail TEXT)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS admin_log_ts ON admin_log (ts)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS usage_alerts (key TEXT PRIMARY KEY, ts INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS guard (name TEXT PRIMARY KEY, until TEXT, reason TEXT, ts INTEGER NOT NULL)"),
  ]);
  schemaReady = true;
}
async function log(env, who, action, detail) {
  await env.DB.prepare("INSERT INTO admin_log (ts, email, ip, country, action, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(Date.now(), who.email, who.ip, who.country, action, String(detail).slice(0, 2000)).run();
  // keep one year of history
  await env.DB.prepare("DELETE FROM admin_log WHERE ts < ?").bind(Date.now() - 365 * 86400_000).run();
}
async function getLog(env) {
  const { results } = await env.DB.prepare("SELECT ts, email, ip, country, action, detail FROM admin_log ORDER BY ts DESC LIMIT 300").all();
  return { entries: results, accessLogsUrl: `https://one.dash.cloudflare.com/${env.ACCOUNT_ID}/logs/access` };
}

// ---- Usage monitor (Cloudflare GraphQL analytics) --------------------------
const R2_CLASS_A = new Set(["ListBuckets", "PutBucket", "ListObjects", "PutObject", "CopyObject", "CompleteMultipartUpload", "CreateMultipartUpload", "ListMultipartUploads", "UploadPart", "UploadPartCopy", "ListParts", "PutBucketEncryption", "PutBucketCors", "PutBucketLifecycleConfiguration"]);
const R2_FREE = new Set(["DeleteObject", "DeleteBucket", "AbortMultipartUpload"]);

async function gql(env, query, variables) {
  if (!env.CF_API_TOKEN) throw new Error("CF_API_TOKEN secret not set");
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors && j.errors.length) throw new Error(j.errors.map((e) => e.message).join("; "));
  return j.data.viewer.accounts[0];
}

async function getUsage(env) {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const v = { acc: env.ACCOUNT_ID, dayStart: dayStart.toISOString(), now: now.toISOString(), monthStart: monthStart.toISOString(), dayDate: dayStart.toISOString().slice(0, 10) };
  const metrics = [];
  const errors = [];
  const add = (id, label, value, limit, unit, period) => metrics.push({ id, label, value, limit, unit, period });

  await Promise.all([
    (async () => {
      try {
        const a = await gql(env, `query($acc:String!,$dayStart:Time!,$now:Time!){viewer{accounts(filter:{accountTag:$acc}){
          workersInvocationsAdaptive(limit:10000,filter:{datetime_geq:$dayStart,datetime_leq:$now}){sum{requests}}}}}`, v);
        add("workers", "Workers requests", sum(a.workersInvocationsAdaptive, (g) => g.sum.requests), LIMITS.workersRequestsDay, "count", "day");
      } catch (e) { errors.push("Workers: " + e.message); add("workers", "Workers requests", null, LIMITS.workersRequestsDay, "count", "day"); }
    })(),
    (async () => {
      try {
        const a = await gql(env, `query($acc:String!,$dayDate:Date!){viewer{accounts(filter:{accountTag:$acc}){
          d1AnalyticsAdaptiveGroups(limit:10000,filter:{date_geq:$dayDate}){sum{rowsRead rowsWritten}}}}}`, v);
        add("d1-read", "D1 rows read", sum(a.d1AnalyticsAdaptiveGroups, (g) => g.sum.rowsRead), LIMITS.d1RowsReadDay, "count", "day");
        add("d1-write", "D1 rows written", sum(a.d1AnalyticsAdaptiveGroups, (g) => g.sum.rowsWritten), LIMITS.d1RowsWrittenDay, "count", "day");
      } catch (e) { errors.push("D1: " + e.message); }
    })(),
    (async () => {
      try {
        const a = await gql(env, `query($acc:String!,$monthStart:Time!,$now:Time!){viewer{accounts(filter:{accountTag:$acc}){
          r2OperationsAdaptiveGroups(limit:10000,filter:{datetime_geq:$monthStart,datetime_leq:$now}){sum{requests} dimensions{actionType}}}}}`, v);
        let A = 0, B = 0;
        for (const g of a.r2OperationsAdaptiveGroups || []) {
          const t = g.dimensions.actionType;
          if (R2_FREE.has(t)) continue;
          if (R2_CLASS_A.has(t)) A += g.sum.requests; else B += g.sum.requests;
        }
        add("r2-a", "R2 writes/lists (Class A)", A, LIMITS.r2ClassAMonth, "count", "month");
        add("r2-b", "R2 reads/downloads (Class B)", B, LIMITS.r2ClassBMonth, "count", "month");
      } catch (e) { errors.push("R2 operations: " + e.message); }
    })(),
    (async () => {
      try {
        const a = await gql(env, `query($acc:String!,$monthStart:Time!,$now:Time!){viewer{accounts(filter:{accountTag:$acc}){
          r2StorageAdaptiveGroups(limit:1000,filter:{datetime_geq:$monthStart,datetime_leq:$now},orderBy:[datetime_DESC]){max{payloadSize metadataSize objectCount} dimensions{bucketName datetime}}}}}`, v);
        const latest = new Map();
        for (const g of a.r2StorageAdaptiveGroups || []) if (!latest.has(g.dimensions.bucketName)) latest.set(g.dimensions.bucketName, g.max);
        let bytes = 0; for (const m of latest.values()) bytes += (m.payloadSize || 0) + (m.metadataSize || 0);
        add("r2-storage", "R2 storage", bytes, LIMITS.r2StorageBytes, "bytes", "month");
      } catch (e) { errors.push("R2 storage: " + e.message); }
    })(),
  ]);
  const order = ["workers", "d1-read", "d1-write", "r2-storage", "r2-a", "r2-b"];
  metrics.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
  const { results: guards } = await env.DB.prepare("SELECT name, until, reason FROM guard").all();
  const month = now.toISOString().slice(0, 7);
  return { at: now.toISOString(), metrics, errors, warnAt: WARN_LEVELS, brakeAt: R2_BRAKE, brakes: guards.filter((g) => g.until > month) };
}

// ---- Map pack manager -------------------------------------------------------
const CATALOG_KEY = "canada.json";
async function readCatalog(env) {
  const o = await env.MAPS.get(CATALOG_KEY);
  return o ? JSON.parse(await o.text()) : null;
}
async function writeCatalog(env, cat) {
  await env.MAPS.put(CATALOG_KEY, JSON.stringify(cat, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "public, max-age=300" },
  });
}
async function getPacks(env) {
  const catalog = await readCatalog(env);
  const objects = [];
  let cursor;
  do {
    const l = await env.MAPS.list({ prefix: "packs/", cursor });
    for (const o of l.objects) objects.push({ key: o.key, bytes: o.size, uploaded: o.uploaded });
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
  return { catalog, objects, publicUrl: env.MAPS_PUBLIC_URL };
}
async function putCatalog(req, env, who) {
  const cat = await req.json();
  if (cat.schemaVersion !== 1 || !Array.isArray(cat.packs)) throw new Error("Not a map-pack catalog (schemaVersion 1 with packs[])");
  for (const p of cat.packs) if (!/^[a-z]{2,8}$/.test(p.id || "")) throw new Error("Bad pack id: " + p.id);
  const old = await readCatalog(env);
  // keep paths of packs already uploaded
  if (old) for (const p of cat.packs) { const o = old.packs.find((x) => x.id === p.id); if (o && o.path && o.sha256 === p.sha256) p.path = o.path; }
  await writeCatalog(env, cat);
  await log(env, who, "catalog-import", `${cat.packs.length} packs, snapshot ${cat.sourceSnapshot || "?"}`);
  return { ok: true, packs: cat.packs.length };
}
async function putPack(req, env, who, id) {
  const len = Number(req.headers.get("Content-Length"));
  if (!len) throw new Error("Content-Length required");
  const expected = (req.headers.get("X-Expected-SHA256") || "").toLowerCase();
  return storePack(env, who, id, req.body, len, expected, "upload");
}

// Pull a pack from this repo's temporary transfer branch (used when files can't be
// picked in a browser). Only raw GitHub URLs of the site repo are accepted, and the
// file must match the catalog's SHA-256 exactly.
const IMPORT_PREFIX = "https://raw.githubusercontent.com/";
async function importPack(req, env, who, id) {
  const { url } = await req.json();
  if (typeof url !== "string" || !url.startsWith(IMPORT_PREFIX + env.GITHUB_REPO + "/") || url.includes("..")) throw new Error("Only raw.githubusercontent.com URLs from " + env.GITHUB_REPO + " are accepted");
  const cat = await readCatalog(env);
  const entry = cat && cat.packs.find((p) => p.id === id);
  if (!entry || !entry.sha256) throw new Error("Pack not in catalog");
  const r = await fetch(url, { headers: { "Accept-Encoding": "identity" } });
  if (!r.ok) throw new Error("Download failed: " + r.status);
  const len = Number(r.headers.get("Content-Length"));
  if (r.headers.get("Content-Encoding") || len !== entry.bytes) throw new Error(`Source size ${len} does not match catalog ${entry.bytes}`);
  return storePack(env, who, id, r.body, len, entry.sha256.toLowerCase(), "import");
}

// R2 verifies the SHA-256 itself while storing (put with sha256), so the Worker does
// no hashing and stays inside the free plan's CPU limit.
async function storePack(env, who, id, stream, len, expected, how) {
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error("A SHA-256 checksum is required");
  const cat = await readCatalog(env);
  if (!cat) throw new Error("Import the catalog (canada.json) first");
  if (!cat.packs.find((p) => p.id === id)) throw new Error("No pack '" + id + "' in the catalog");
  const month = new Date().toISOString().slice(0, 7);
  const g = await env.DB.prepare("SELECT until, reason FROM guard WHERE name = 'uploads'").first();
  if (g && g.until > month) throw new Error("Uploads are paused to stay inside the free plan: " + g.reason);
  let stored = 0, cur;
  do { const l = await env.MAPS.list({ cursor: cur }); for (const o of l.objects) stored += o.size; cur = l.truncated ? l.cursor : undefined; } while (cur);
  if (stored + len > LIMITS.r2StorageBytes * R2_BRAKE) throw new Error(`Not enough free R2 storage: ${fmt(stored, "bytes")} used, this file is ${fmt(len, "bytes")}, the free limit is 10 GB`);

  // Content-addressed name: phones never see a half-replaced file.
  const finalKey = `packs/${id}-${expected.slice(0, 12)}.pmtiles`;
  try {
    await env.MAPS.put(finalKey, stream, { sha256: expected, httpMetadata: { contentType: "application/octet-stream", cacheControl: "public, max-age=31536000, immutable" } });
  } catch (e) {
    throw new Error("R2 refused the file (checksum or size mismatch?): " + e.message);
  }
  const head = await env.MAPS.get(finalKey, { range: { offset: 0, length: 7 } });
  const magic = head ? new TextDecoder().decode(await head.arrayBuffer()) : "";
  if (magic !== "PMTiles" || (head && head.size !== len)) {
    await env.MAPS.delete(finalKey);
    throw new Error("Stored file is not a complete PMTiles archive");
  }
  const fresh = await readCatalog(env);
  const e2 = fresh.packs.find((p) => p.id === id);
  const oldPath = e2.path;
  e2.bytes = len;
  e2.sha256 = expected;
  e2.path = finalKey;
  fresh.updated = new Date().toISOString();
  await writeCatalog(env, fresh);
  if (oldPath && oldPath !== finalKey) await env.MAPS.delete(oldPath);
  await log(env, who, "pack-" + how, `${id}: ${len} bytes, sha256 ${expected}`);
  return { ok: true, id, bytes: len, sha256: expected, path: finalKey, url: `${env.MAPS_PUBLIC_URL}/${finalKey}` };
}

// ---- Quick website edits (commits to GitHub) --------------------------------
async function gh(env, path, init = {}) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN secret not set");
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "dp-admin", "X-GitHub-Api-Version": "2022-11-28", ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function readRepoFile(env, path) {
  const j = await gh(env, `/contents/${path}?ref=${env.GITHUB_BRANCH}`);
  const bin = atob(j.content.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function fieldRegex(key) {
  return new RegExp(`<(a|p|small|span)\\b([^>]*?)\\sdata-dp-edit="${key}"([^>]*)>([\\s\\S]*?)</\\1>`);
}
function extract(htmlText, key) {
  const m = htmlText.match(fieldRegex(key));
  if (!m) return null;
  const attrs = m[2] + m[3];
  const href = m[1] === "a" ? (attrs.match(/\shref="([^"]*)"/) || [])[1] || "" : null;
  return { tag: m[1], text: unescapeHtml(m[4]), href: href == null ? null : unescapeHtml(href) };
}
async function getEdits(env) {
  const files = [...new Set(Object.values(EDIT_FIELDS).flatMap((f) => f.files))];
  const content = Object.fromEntries(await Promise.all(files.map(async (f) => [f, await readRepoFile(env, f)])));
  return {
    fields: Object.entries(EDIT_FIELDS).map(([key, f]) => ({
      key, label: f.label,
      en: extract(content[f.files[0]], key),
      fr: extract(content[f.files[1]], key),
    })),
  };
}
async function postEdit(req, env, who) {
  const body = await req.json();
  const field = EDIT_FIELDS[body.key];
  if (!field) throw new Error("Unknown field");
  const langs = [["en", field.files[0]], ["fr", field.files[1]]];
  const changes = [];
  for (const [lang, path] of langs) {
    const val = body[lang];
    if (!val || typeof val.text !== "string" || !val.text.trim()) throw new Error(`Missing ${lang.toUpperCase()} text`);
    if (val.text.length > 600) throw new Error("Text too long");
    if (val.href != null && !/^(https:\/\/[^\s"<>]+|[a-z0-9\-_/.#?=&]+)$/i.test(val.href)) throw new Error("Link must be https:// or a site-relative path");
    const src = await readRepoFile(env, path);
    const re = fieldRegex(body.key);
    const m = src.match(re);
    if (!m) throw new Error(`Field not found in ${path}`);
    let open = `<${m[1]}${m[2]} data-dp-edit="${body.key}"${m[3]}>`;
    if (m[1] === "a" && val.href != null) open = open.replace(/\shref="[^"]*"/, ` href="${escapeAttr(val.href)}"`);
    const replaced = src.replace(re, () => `${open}${escapeHtml(val.text.trim())}</${m[1]}>`);
    if (replaced !== src) changes.push({ path, content: replaced, before: extract(src, body.key), after: extract(replaced, body.key) });
  }
  if (!changes.length) return { ok: true, unchanged: true };
  // One commit for both languages via the Git Data API.
  const ref = await gh(env, `/git/ref/heads/${env.GITHUB_BRANCH}`);
  const baseCommit = await gh(env, `/git/commits/${ref.object.sha}`);
  const tree = await gh(env, "/git/trees", { method: "POST", body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: changes.map((c) => ({ path: c.path, mode: "100644", type: "blob", content: c.content })) }) });
  const commit = await gh(env, "/git/commits", { method: "POST", body: JSON.stringify({ message: `Admin edit: ${field.label}`, tree: tree.sha, parents: [ref.object.sha] }) });
  await gh(env, `/git/refs/heads/${env.GITHUB_BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
  await log(env, who, "site-edit", `${body.key}: ` + changes.map((c) => `${c.path} "${c.before?.text}" -> "${c.after?.text}"`).join("; "));
  return { ok: true, commit: commit.sha, files: changes.map((c) => c.path) };
}

// ---- Email ---------------------------------------------------------------------
async function sendMail(env, subject, body) {
  const raw = [
    `From: Double Perspective Admin <${env.ALERT_FROM}>`,
    `To: ${env.OWNER_EMAIL}`,
    `Subject: ${subject}`,
    `Message-ID: <${crypto.randomUUID()}@doubleperspective.com>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");
  await env.ALERT_EMAIL.send(new EmailMessage(env.ALERT_FROM, env.OWNER_EMAIL, raw));
}

// ---- Helpers -----------------------------------------------------------------
function b64urlBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function b64urlText(s) { return new TextDecoder().decode(b64urlBytes(s)); }
function hex(buf) { return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function sum(arr, f) { return (arr || []).reduce((a, g) => a + (f(g) || 0), 0); }
function fmt(v, unit) { return unit === "bytes" ? (v / 1024 ** 3).toFixed(2) + " GB" : Math.round(v).toLocaleString("en-CA"); }
function escapeHtml(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }
function unescapeHtml(s) { return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"); }
function text(s, status = 200) { return new Response(s, { status, headers: { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8" } }); }
function html(s) { return new Response(s, { headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" } }); }
function json(o, status = 200) { return new Response(JSON.stringify(o), { status, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" } }); }
