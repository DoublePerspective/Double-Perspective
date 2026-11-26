// dp-follow: check-ins and follower alerts for Gravel & Pavement Scout.
// Design: FOLLOW_API.md in this folder. No accounts: each phone registers once and
// keeps a random secret token; only its SHA-256 is stored. Followers use either the app
// (an invite link redeemed by another registered phone) or a private web link.

import { PAGE_HTML, PAGE_JS, PAGE_CSS, SW_JS, GONE_HTML } from "./page.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const KEEP_AFTER_RIDE = 7 * DAY;     // positions are deleted 7 days after a ride ends
const LINK_AFTER_RIDE = 12 * HOUR;   // a "this ride only" link stops working 12 h after the ride ends
const STALE_RIDE = 48 * HOUR;        // a ride never ended is treated as ended 48 h after its last check-in
const INTERVALS = [15, 30, 60];
const KINDS = ["start", "move", "stop", "fuel", "restaurant", "camp", "pause", "ok", "battery", "no_answer", "end"];
const MAX_POINTS_PER_POST = 200;
const MAX_ACTIVE_LINKS = 20;

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",            // a link token must never leak to Google Maps etc.
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Strict-Transport-Security": "max-age=31536000",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
};

export default {
  async fetch(request, env, ctx) {
    try {
      await ensureSchema(env);
      return await route(request, env, ctx);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: "server error" }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    await ensureSchema(env);
    await checkOverdue(env);
    await cleanUp(env);
  },
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

// ---------------------------------------------------------------- routing

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/" && method === "GET") return text("Gravel & Pavement Scout check-ins. Nothing to see here.\n");
  if (path === "/robots.txt") return text("User-agent: *\nDisallow: /\n");
  if (path === "/api/vapid" && method === "GET") return json({ publicKey: (await vapidKeys(env)).publicKey });

  // Follower web page (token in the path; the page reads it from location).
  let m = path.match(/^\/f\/([A-Za-z0-9_-]{43})$/);
  if (m && method === "GET") {
    const link = await findLink(env, m[1]);
    if (!link) return html(GONE_HTML, 410);
    return html(PAGE_HTML, 200);
  }
  if (path === "/f/app.js") return asset(PAGE_JS, "text/javascript; charset=utf-8");
  if (path === "/f/style.css") return asset(PAGE_CSS, "text/css; charset=utf-8");
  if (path === "/f/sw.js") return asset(SW_JS, "text/javascript; charset=utf-8", { "Service-Worker-Allowed": "/f/" });

  m = path.match(/^\/api\/f\/([A-Za-z0-9_-]{43})(\/push)?$/);
  if (m) {
    const link = await findLink(env, m[1]);
    if (!link) return json({ error: "expired" }, 410);
    if (!m[2] && method === "GET") return json(await followerView(env, link));
    if (m[2] && method === "POST") return addWebPush(env, link, await body(request));
    if (m[2] && method === "DELETE") return removeWebPush(env, link, await body(request));
    fail(405, "method not allowed");
  }

  // Everything else is the app, authenticated with the rider token.
  if (path === "/api/riders" && method === "POST") return registerRider(env, await body(request));

  const rider = await authRider(env, request);
  if (path === "/api/riders/me" && method === "PUT") return updateRider(env, rider, await body(request));
  if (path === "/api/riders/me" && method === "DELETE") return deleteRider(env, rider);

  if (path === "/api/rides" && method === "POST") return startRide(env, rider, await body(request));
  m = path.match(/^\/api\/rides\/(\d+)\/(checkins|pause|alert|end)$/);
  if (m && method === "POST") {
    const ride = await ownRide(env, rider, Number(m[1]));
    const data = await body(request);
    if (m[2] === "checkins") return postCheckins(env, ride, data);
    if (m[2] === "pause") return pauseRide(env, ride, data);
    if (m[2] === "alert") return alertNow(env, ride, data);
    return endRide(env, ride, data);
  }

  if (path === "/api/links" && method === "GET") return listLinks(env, rider);
  if (path === "/api/links" && method === "POST") return createLink(env, rider, await body(request));
  m = path.match(/^\/api\/links\/(\d+)$/);
  if (m && method === "DELETE") return revokeLink(env, rider, Number(m[1]));

  m = path.match(/^\/api\/follow\/([A-Za-z0-9_-]{43})$/);
  if (m && method === "POST") return followWithLink(env, rider, m[1]);
  if (path === "/api/following" && method === "GET") return listFollowing(env, rider);
  m = path.match(/^\/api\/following\/(\d+)$/);
  if (m && method === "DELETE") return unfollow(env, rider, Number(m[1]));
  if (path === "/api/followers" && method === "GET") return listFollowers(env, rider);
  m = path.match(/^\/api\/followers\/(\d+)$/);
  if (m && method === "DELETE") return removeFollower(env, rider, Number(m[1]));

  fail(404, "not found");
}

// ---------------------------------------------------------------- schema & settings

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS riders (id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'en', fcm_token TEXT, created INTEGER NOT NULL, seen INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS rides (id INTEGER PRIMARY KEY AUTOINCREMENT, rider_id INTEGER NOT NULL, started INTEGER NOT NULL, ended INTEGER, interval_min INTEGER NOT NULL, expected_return INTEGER, last_at INTEGER NOT NULL, last_lat REAL, last_lon REAL, last_kind TEXT, battery INTEGER, pause_until INTEGER, pause_kind TEXT, nonews_sent INTEGER NOT NULL DEFAULT 0, alarm_sent INTEGER NOT NULL DEFAULT 0)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS rides_rider ON rides (rider_id, started)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS rides_open ON rides (ended)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS points (ride_id INTEGER NOT NULL, t INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, kind TEXT NOT NULL, note TEXT, PRIMARY KEY (ride_id, t, kind))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS links (id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE, rider_id INTEGER NOT NULL, ride_id INTEGER, label TEXT, created INTEGER NOT NULL, revoked INTEGER)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS links_rider ON links (rider_id)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS follows (id INTEGER PRIMARY KEY AUTOINCREMENT, rider_id INTEGER NOT NULL, follower_id INTEGER NOT NULL, link_id INTEGER NOT NULL, created INTEGER NOT NULL, UNIQUE (rider_id, follower_id))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS webpush (id INTEGER PRIMARY KEY AUTOINCREMENT, link_id INTEGER NOT NULL, endpoint TEXT NOT NULL UNIQUE, created INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
  ]);
  schemaReady = true;
}

async function setting(env, key) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return row ? JSON.parse(row.value) : null;
}
async function putSetting(env, key, value) {
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, JSON.stringify(value)).run();
}

/**
 * Free-plan limits are a server switch so early access can start or end without an app update.
 * settings.free_limits = {"enforced": false} (default) → everyone gets Pro behaviour.
 * Pro status itself will come from Google Play purchase verification (not built yet).
 */
async function limitsFor(env, rider) {
  const config = (await setting(env, "free_limits")) || { enforced: false };
  const pro = !config.enforced; // TODO: OR rider has a verified Play subscription
  return pro
    ? { pro: true, intervals: INTERVALS, maxFollowers: 999, fullPath: true }
    : { pro: false, intervals: [30, 60], maxFollowers: 1, fullPath: false };
}

// ---------------------------------------------------------------- riders

async function registerRider(env, data) {
  const name = cleanText(data.name, 40) || "Rider";
  const lang = data.lang === "fr" ? "fr" : "en";
  const token = randomToken();
  const now = Date.now();
  const row = await env.DB.prepare("INSERT INTO riders (token_hash, name, lang, created, seen) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(await sha256(token), name, lang, now, now).first();
  return json({ riderId: row.id, token }, 201);
}

async function authRider(env, request) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401, "missing or invalid token");
  const rider = await env.DB.prepare("SELECT * FROM riders WHERE token_hash = ?").bind(await sha256(token)).first();
  if (!rider) fail(401, "unknown rider");
  const now = Date.now();
  if (now - rider.seen > HOUR) await env.DB.prepare("UPDATE riders SET seen = ? WHERE id = ?").bind(now, rider.id).run();
  return rider;
}

async function updateRider(env, rider, data) {
  const name = data.name !== undefined ? cleanText(data.name, 40) || rider.name : rider.name;
  const lang = data.lang === "fr" || data.lang === "en" ? data.lang : rider.lang;
  const fcm = data.fcmToken !== undefined ? cleanText(data.fcmToken, 4096) || null : rider.fcm_token;
  await env.DB.prepare("UPDATE riders SET name = ?, lang = ?, fcm_token = ? WHERE id = ?").bind(name, lang, fcm, rider.id).run();
  return json({ ok: true, limits: await limitsFor(env, rider) });
}

/** Deletes everything about this phone: rider, rides, positions, links, follows. */
async function deleteRider(env, rider) {
  const rides = "SELECT id FROM rides WHERE rider_id = ?1";
  const links = "SELECT id FROM links WHERE rider_id = ?1";
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM points WHERE ride_id IN (${rides})`).bind(rider.id),
    env.DB.prepare("DELETE FROM rides WHERE rider_id = ?1").bind(rider.id),
    env.DB.prepare(`DELETE FROM webpush WHERE link_id IN (${links})`).bind(rider.id),
    env.DB.prepare("DELETE FROM links WHERE rider_id = ?1").bind(rider.id),
    env.DB.prepare("DELETE FROM follows WHERE rider_id = ?1 OR follower_id = ?1").bind(rider.id),
    env.DB.prepare("DELETE FROM riders WHERE id = ?1").bind(rider.id),
  ]);
  return json({ ok: true });
}

// ---------------------------------------------------------------- rides & check-ins

async function startRide(env, rider, data) {
  const limits = await limitsFor(env, rider);
  const interval = limits.intervals.includes(Number(data.intervalMin)) ? Number(data.intervalMin) : limits.intervals.includes(30) ? 30 : limits.intervals[0];
  const now = Date.now();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM rides WHERE rider_id = ? AND started > ?").bind(rider.id, now - DAY).first();
  if (recent.n >= 20) fail(429, "too many rides today");
  // Starting a new ride ends any ride still open on this phone.
  await env.DB.prepare("UPDATE rides SET ended = ? WHERE rider_id = ? AND ended IS NULL").bind(now, rider.id).run();
  const expected = validTime(data.expectedReturn, now, now + 7 * DAY);
  const point = validPoint({ ...data, kind: "start", t: now });
  const ride = await env.DB.prepare(
    "INSERT INTO rides (rider_id, started, interval_min, expected_return, last_at, last_lat, last_lon, last_kind, battery) VALUES (?, ?, ?, ?, ?, ?, ?, 'start', ?) RETURNING id"
  ).bind(rider.id, now, interval, expected, now, point?.lat ?? null, point?.lon ?? null, battery(data.battery)).first();
  if (point) await insertPoints(env, ride.id, [point]);
  await notifyFollowers(env, rider, { type: "start", rideId: ride.id });
  return json({ rideId: ride.id, intervalMin: interval, limits }, 201);
}

async function postCheckins(env, ride, data) {
  if (ride.ended) fail(409, "ride already ended");
  const now = Date.now();
  const list = Array.isArray(data.points) ? data.points.slice(0, MAX_POINTS_PER_POST) : [];
  // Queued positions from a dead zone are accepted back to the ride start, never from the future.
  const points = list.map((p) => validPoint(p, ride.started - MIN, now + 2 * MIN)).filter(Boolean);
  if (!points.length) fail(400, "no valid points");
  await insertPoints(env, ride.id, points);
  const last = points.reduce((a, b) => (b.t > a.t ? b : a));
  const wasOverdue = ride.nonews_sent || ride.alarm_sent;
  await env.DB.prepare(
    "UPDATE rides SET last_at = MAX(last_at, ?), last_lat = ?, last_lon = ?, last_kind = ?, battery = COALESCE(?, battery), nonews_sent = 0, alarm_sent = 0" +
    (last.kind === "move" ? ", pause_until = NULL, pause_kind = NULL" : "") + " WHERE id = ?"
  ).bind(last.t, last.lat, last.lon, last.kind, battery(data.battery), ride.id).run();
  if (wasOverdue) {
    const rider = await env.DB.prepare("SELECT * FROM riders WHERE id = ?").bind(ride.rider_id).first();
    await notifyFollowers(env, rider, { type: "back", rideId: ride.id });
  }
  return json({ ok: true, accepted: points.length });
}

/** Fuel / restaurant / camp / other: pushes the follower alerts back until `until`. */
async function pauseRide(env, ride, data) {
  if (ride.ended) fail(409, "ride already ended");
  const now = Date.now();
  const kind = ["fuel", "restaurant", "camp", "pause"].includes(data.kind) ? data.kind : "pause";
  const until = validTime(data.until, now + 5 * MIN, now + 24 * HOUR);
  if (!until) fail(400, "until must be between 5 minutes and 24 hours from now");
  const point = validPoint({ ...data, kind, t: now, note: undefined });
  if (point) await insertPoints(env, ride.id, [point]);
  await env.DB.prepare(
    "UPDATE rides SET pause_until = ?, pause_kind = ?, last_at = ?, last_kind = ?, last_lat = COALESCE(?, last_lat), last_lon = COALESCE(?, last_lon), nonews_sent = 0, alarm_sent = 0 WHERE id = ?"
  ).bind(until, kind, now, kind, point?.lat ?? null, point?.lon ?? null, ride.id).run();
  return json({ ok: true, until });
}

/** "Everything OK?" got no answer on the phone: alert followers right away, with the position. */
async function alertNow(env, ride, data) {
  if (ride.ended) fail(409, "ride already ended");
  const now = Date.now();
  const point = validPoint({ ...data, kind: "no_answer", t: now });
  if (point) await insertPoints(env, ride.id, [point]);
  await env.DB.prepare("UPDATE rides SET last_kind = 'no_answer', last_lat = COALESCE(?, last_lat), last_lon = COALESCE(?, last_lon), alarm_sent = 1, nonews_sent = 1, pause_until = NULL WHERE id = ?")
    .bind(point?.lat ?? null, point?.lon ?? null, ride.id).run();
  const rider = await env.DB.prepare("SELECT * FROM riders WHERE id = ?").bind(ride.rider_id).first();
  await notifyFollowers(env, rider, { type: "no_answer", rideId: ride.id });
  return json({ ok: true });
}

async function endRide(env, ride, data) {
  if (ride.ended) return json({ ok: true });
  const now = Date.now();
  const point = validPoint({ ...data, kind: "end", t: now });
  if (point) await insertPoints(env, ride.id, [point]);
  await env.DB.prepare("UPDATE rides SET ended = ?, last_at = ?, last_kind = 'end', last_lat = COALESCE(?, last_lat), last_lon = COALESCE(?, last_lon) WHERE id = ?")
    .bind(now, now, point?.lat ?? null, point?.lon ?? null, ride.id).run();
  const rider = await env.DB.prepare("SELECT * FROM riders WHERE id = ?").bind(ride.rider_id).first();
  await notifyFollowers(env, rider, { type: "end", rideId: ride.id });
  return json({ ok: true });
}

async function ownRide(env, rider, id) {
  const ride = await env.DB.prepare("SELECT * FROM rides WHERE id = ? AND rider_id = ?").bind(id, rider.id).first();
  if (!ride) fail(404, "ride not found");
  return ride;
}

async function insertPoints(env, rideId, points) {
  const stmt = env.DB.prepare("INSERT OR IGNORE INTO points (ride_id, t, lat, lon, kind, note) VALUES (?, ?, ?, ?, ?, ?)");
  await env.DB.batch(points.map((p) => stmt.bind(rideId, p.t, p.lat, p.lon, p.kind, p.note ?? null)));
}

// ---------------------------------------------------------------- links & followers

async function createLink(env, rider, data) {
  const limits = await limitsFor(env, rider);
  const now = Date.now();
  const active = await activeFollowerCount(env, rider, now);
  if (active >= Math.min(limits.maxFollowers, MAX_ACTIVE_LINKS)) fail(403, limits.pro ? "too many active links" : "free plan: 1 follower");
  let rideId = null;
  if (!data.permanent) {
    const open = await env.DB.prepare("SELECT id FROM rides WHERE rider_id = ? AND ended IS NULL ORDER BY started DESC LIMIT 1").bind(rider.id).first();
    if (!open) fail(409, "start a ride first, or create a permanent link");
    rideId = open.id;
  }
  const token = randomToken();
  const row = await env.DB.prepare("INSERT INTO links (token_hash, rider_id, ride_id, label, created) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(await sha256(token), rider.id, rideId, cleanText(data.label, 40) || null, now).first();
  return json({ linkId: row.id, url: `${env.PUBLIC_URL}/f/${token}`, permanent: !rideId }, 201);
}

async function activeFollowerCount(env, rider, now) {
  const links = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM links l LEFT JOIN rides r ON r.id = l.ride_id WHERE l.rider_id = ? AND l.revoked IS NULL AND (l.ride_id IS NULL OR r.ended IS NULL OR r.ended > ?)"
  ).bind(rider.id, now - LINK_AFTER_RIDE).first();
  return links.n;
}

async function listLinks(env, rider) {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    "SELECT l.id, l.label, l.created, l.ride_id, r.ended, (SELECT COUNT(*) FROM follows f WHERE f.link_id = l.id) AS app_followers, (SELECT COUNT(*) FROM webpush w WHERE w.link_id = l.id) AS web_alerts " +
    "FROM links l LEFT JOIN rides r ON r.id = l.ride_id WHERE l.rider_id = ? AND l.revoked IS NULL ORDER BY l.created DESC"
  ).bind(rider.id).all();
  return json({
    links: results.map((l) => ({
      linkId: l.id, label: l.label, created: l.created, permanent: l.ride_id === null,
      expires: l.ride_id === null ? null : l.ended ? l.ended + LINK_AFTER_RIDE : null,
      active: l.ride_id === null || !l.ended || l.ended + LINK_AFTER_RIDE > now,
      appFollowers: l.app_followers, webAlerts: l.web_alerts,
    })),
  });
}

/** Cancelling a link also stops every follower who joined through it, in the app and in browsers. */
async function revokeLink(env, rider, id) {
  const link = await env.DB.prepare("SELECT id FROM links WHERE id = ? AND rider_id = ?").bind(id, rider.id).first();
  if (!link) fail(404, "link not found");
  await env.DB.batch([
    env.DB.prepare("UPDATE links SET revoked = ? WHERE id = ?").bind(Date.now(), id),
    env.DB.prepare("DELETE FROM webpush WHERE link_id = ?").bind(id),
    env.DB.prepare("DELETE FROM follows WHERE link_id = ?").bind(id),
  ]);
  return json({ ok: true });
}

async function findLink(env, token) {
  const link = await env.DB.prepare("SELECT l.*, r.ended AS ride_ended FROM links l LEFT JOIN rides r ON r.id = l.ride_id WHERE l.token_hash = ?")
    .bind(await sha256(token)).first();
  if (!link || link.revoked) return null;
  if (link.ride_id !== null && link.ride_ended && link.ride_ended + LINK_AFTER_RIDE < Date.now()) return null;
  return link;
}

/** In-app follower: another registered phone opens the invite link in the app. */
async function followWithLink(env, follower, token) {
  const link = await findLink(env, token);
  if (!link) fail(410, "expired");
  if (link.rider_id === follower.id) fail(400, "you can't follow yourself");
  await env.DB.prepare("INSERT INTO follows (rider_id, follower_id, link_id, created) VALUES (?, ?, ?, ?) ON CONFLICT(rider_id, follower_id) DO UPDATE SET link_id = excluded.link_id")
    .bind(link.rider_id, follower.id, link.id, Date.now()).run();
  const rider = await env.DB.prepare("SELECT name FROM riders WHERE id = ?").bind(link.rider_id).first();
  return json({ ok: true, riderName: rider?.name });
}

async function listFollowing(env, follower) {
  const { results } = await env.DB.prepare(
    "SELECT f.id, f.link_id, r.id AS rider_id, r.name FROM follows f JOIN riders r ON r.id = f.rider_id WHERE f.follower_id = ?"
  ).bind(follower.id).all();
  const out = [];
  for (const row of results) {
    const link = await env.DB.prepare("SELECT l.*, rd.ended AS ride_ended FROM links l LEFT JOIN rides rd ON rd.id = l.ride_id WHERE l.id = ?").bind(row.link_id).first();
    if (!link || link.revoked) continue;
    out.push({ followId: row.id, ...(await followerView(env, link)) });
  }
  return json({ following: out });
}

async function unfollow(env, follower, id) {
  await env.DB.prepare("DELETE FROM follows WHERE id = ? AND follower_id = ?").bind(id, follower.id).run();
  return json({ ok: true });
}

async function listFollowers(env, rider) {
  const { results } = await env.DB.prepare(
    "SELECT f.id, f.created, r.name FROM follows f JOIN riders r ON r.id = f.follower_id WHERE f.rider_id = ?"
  ).bind(rider.id).all();
  return json({ followers: results.map((f) => ({ followerId: f.id, name: f.name, since: f.created })) });
}

async function removeFollower(env, rider, id) {
  await env.DB.prepare("DELETE FROM follows WHERE id = ? AND rider_id = ?").bind(id, rider.id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- what followers see

function rideState(ride, now = Date.now()) {
  if (!ride) return { state: "idle" };
  if (ride.ended) return { state: "ended" };
  const t = timings(ride);
  if (ride.last_kind === "no_answer") return { state: "no_answer", since: ride.last_at };
  if (ride.pause_until && ride.pause_until > now) return { state: "paused", until: ride.pause_until, kind: ride.pause_kind };
  if (now >= t.alarmAt) return { state: "alarm", since: ride.last_at };
  if (now >= t.noNewsAt) return { state: "no_news", since: ride.last_at };
  return { state: "riding", nextExpected: ride.last_at + ride.interval_min * MIN };
}

/** "No news" after 2 intervals + 15 min; alarm 30 min after the expected return, else 2 h (15/30 min) or 3 h (60 min). */
function timings(ride) {
  const interval = ride.interval_min * MIN;
  const base = Math.max(ride.last_at, ride.pause_until || 0);
  const noNewsAt = base + 2 * interval + 15 * MIN;
  const silence = ride.interval_min >= 60 ? 3 * HOUR : 2 * HOUR;
  const alarmAt = ride.expected_return ? Math.max(ride.expected_return + 30 * MIN, noNewsAt) : base + silence;
  return { noNewsAt, alarmAt: Math.max(alarmAt, noNewsAt) };
}

async function followerView(env, link) {
  const rider = await env.DB.prepare("SELECT id, name, lang FROM riders WHERE id = ?").bind(link.rider_id).first();
  const ride = link.ride_id !== null
    ? await env.DB.prepare("SELECT * FROM rides WHERE id = ?").bind(link.ride_id).first()
    : await env.DB.prepare("SELECT * FROM rides WHERE rider_id = ? ORDER BY started DESC LIMIT 1").bind(link.rider_id).first();
  const limits = await limitsFor(env, rider);
  let points = [];
  if (ride) {
    const query = limits.fullPath
      ? "SELECT t, lat, lon, kind FROM points WHERE ride_id = ? ORDER BY t"
      : "SELECT t, lat, lon, kind FROM points WHERE ride_id = ? AND kind <> 'move' ORDER BY t";
    points = (await env.DB.prepare(query).bind(ride.id).all()).results;
  }
  return {
    riderName: rider?.name || "Rider",
    lang: rider?.lang || "en",
    now: Date.now(),
    ride: ride && {
      started: ride.started, ended: ride.ended, intervalMin: ride.interval_min, expectedReturn: ride.expected_return,
      last: ride.last_lat === null ? null : { t: ride.last_at, lat: ride.last_lat, lon: ride.last_lon, kind: ride.last_kind },
      battery: ride.battery, pauseUntil: ride.pause_until, pauseKind: ride.pause_kind,
      ...rideState(ride),
    },
    points,
    fullPath: limits.fullPath,
  };
}

// ---------------------------------------------------------------- overdue checks (cron)

async function checkOverdue(env) {
  const now = Date.now();
  const { results } = await env.DB.prepare("SELECT * FROM rides WHERE ended IS NULL AND (nonews_sent = 0 OR alarm_sent = 0)").all();
  for (const ride of results) {
    if (ride.pause_until && ride.pause_until > now) continue;
    const t = timings(ride);
    const rider = await env.DB.prepare("SELECT * FROM riders WHERE id = ?").bind(ride.rider_id).first();
    if (!rider) continue;
    if (now >= t.alarmAt && !ride.alarm_sent) {
      await env.DB.prepare("UPDATE rides SET alarm_sent = 1, nonews_sent = 1 WHERE id = ?").bind(ride.id).run();
      await notifyFollowers(env, rider, { type: "alarm", rideId: ride.id });
    } else if (now >= t.noNewsAt && !ride.nonews_sent) {
      await env.DB.prepare("UPDATE rides SET nonews_sent = 1 WHERE id = ?").bind(ride.id).run();
      await notifyFollowers(env, rider, { type: "no_news", rideId: ride.id });
    }
  }
}

async function cleanUp(env) {
  const now = Date.now();
  // Rides never ended are closed 48 h after their last check-in.
  await env.DB.prepare("UPDATE rides SET ended = last_at + ? WHERE ended IS NULL AND last_at < ?").bind(STALE_RIDE, now - STALE_RIDE).run();
  const old = "SELECT id FROM rides WHERE ended IS NOT NULL AND ended < ?1";
  const deadLinks = "SELECT l.id FROM links l JOIN rides r ON r.id = l.ride_id WHERE r.ended < ?1";
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM webpush WHERE link_id IN (${deadLinks})`).bind(now - KEEP_AFTER_RIDE),
    env.DB.prepare(`DELETE FROM follows WHERE link_id IN (${deadLinks})`).bind(now - KEEP_AFTER_RIDE),
    env.DB.prepare(`DELETE FROM links WHERE id IN (${deadLinks})`).bind(now - KEEP_AFTER_RIDE),
    env.DB.prepare(`DELETE FROM points WHERE ride_id IN (${old})`).bind(now - KEEP_AFTER_RIDE),
    env.DB.prepare("DELETE FROM rides WHERE ended IS NOT NULL AND ended < ?1").bind(now - KEEP_AFTER_RIDE),
    env.DB.prepare("DELETE FROM links WHERE revoked IS NOT NULL AND revoked < ?1").bind(now - DAY),
    // Phones not seen for a year (app uninstalled) are forgotten.
    env.DB.prepare("DELETE FROM riders WHERE seen < ?1 AND id NOT IN (SELECT rider_id FROM rides)").bind(now - 365 * DAY),
  ]);
}

// ---------------------------------------------------------------- notifications

/** Sends `event` to everyone following `rider`: app followers (FCM) and browser followers (Web Push). */
async function notifyFollowers(env, rider, event) {
  if (!rider) return;
  const now = Date.now();
  const { results: links } = await env.DB.prepare(
    "SELECT l.id FROM links l LEFT JOIN rides r ON r.id = l.ride_id WHERE l.rider_id = ? AND l.revoked IS NULL AND (l.ride_id IS NULL OR l.ride_id = ?)"
  ).bind(rider.id, event.rideId ?? -1).all();
  if (!links.length) return;
  const ids = links.map((l) => l.id);
  const marks = ids.map(() => "?").join(",");

  const { results: subs } = await env.DB.prepare(`SELECT id, endpoint FROM webpush WHERE link_id IN (${marks})`).bind(...ids).all();
  for (const sub of subs) {
    const urgent = event.type === "alarm" || event.type === "no_answer";
    const status = await sendWebPush(env, sub.endpoint, urgent ? "high" : "normal").catch(() => 0);
    if (status === 404 || status === 410) await env.DB.prepare("DELETE FROM webpush WHERE id = ?").bind(sub.id).run();
  }

  const { results: apps } = await env.DB.prepare(
    `SELECT DISTINCT r.fcm_token FROM follows f JOIN riders r ON r.id = f.follower_id WHERE f.link_id IN (${marks}) AND r.fcm_token IS NOT NULL`
  ).bind(...ids).all();
  for (const app of apps) {
    await sendFcm(env, app.fcm_token, { type: event.type, riderId: String(rider.id), riderName: rider.name, rideId: String(event.rideId ?? ""), at: String(now) })
      .catch((e) => console.warn("fcm", e.message));
  }
}

async function addWebPush(env, link, data) {
  const endpoint = typeof data.endpoint === "string" ? data.endpoint : "";
  let host;
  try { host = new URL(endpoint).hostname; } catch { fail(400, "bad endpoint"); }
  // Only the browsers' own push services, so the server can't be used to call arbitrary URLs.
  const allowed = [/\.googleapis\.com$/, /\.mozilla\.com$/, /\.mozaws\.net$/, /\.notify\.windows\.com$/, /\.push\.apple\.com$/];
  if (!endpoint.startsWith("https://") || !allowed.some((r) => r.test(host))) fail(400, "unsupported push service");
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM webpush WHERE link_id = ?").bind(link.id).first();
  if (count.n >= 10) fail(429, "too many browsers on this link");
  await env.DB.prepare("INSERT INTO webpush (link_id, endpoint, created) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET link_id = excluded.link_id")
    .bind(link.id, endpoint, Date.now()).run();
  return json({ ok: true }, 201);
}

async function removeWebPush(env, link, data) {
  await env.DB.prepare("DELETE FROM webpush WHERE link_id = ? AND endpoint = ?").bind(link.id, String(data.endpoint || "")).run();
  return json({ ok: true });
}

/**
 * Web Push without a payload (no message encryption needed): the browser wakes the service
 * worker, which fetches the current status from /api/f/<token> and shows the notification.
 * VAPID keys are generated on first use and kept in D1, so no secret has to be pasted anywhere.
 */
async function sendWebPush(env, endpoint, urgency) {
  const keys = await vapidKeys(env);
  const audience = new URL(endpoint).origin;
  const jwt = await signJwt(
    { typ: "JWT", alg: "ES256" },
    { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.CONTACT },
    keys.privateKey, { name: "ECDSA", hash: "SHA-256" }
  );
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { TTL: "86400", Urgency: urgency, Authorization: `vapid t=${jwt}, k=${keys.publicKey}`, "Content-Length": "0" },
  });
  return response.status;
}

let vapidCache = null;
async function vapidKeys(env) {
  if (vapidCache) return vapidCache;
  let stored = await setting(env, "vapid");
  if (!stored) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    stored = {
      privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
      publicKey: b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))),
    };
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapid', ?)").bind(JSON.stringify(stored)).run();
    stored = await setting(env, "vapid"); // another request may have won the race
  }
  vapidCache = {
    publicKey: stored.publicKey,
    privateKey: await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]),
  };
  return vapidCache;
}

/** Firebase Cloud Messaging HTTP v1, with a data-only message so the app shows a notification in the rider's language. */
let fcmTokenCache = null;
async function sendFcm(env, token, data) {
  if (!env.FCM_SERVICE_ACCOUNT) return; // not configured yet
  const account = JSON.parse(env.FCM_SERVICE_ACCOUNT);
  const access = await fcmAccessToken(account);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { token, data, android: { priority: data.type === "alarm" || data.type === "no_answer" ? "HIGH" : "NORMAL", ttl: "86400s" } } }),
  });
  if (response.status === 404 || response.status === 400) {
    const detail = await response.text();
    if (/UNREGISTERED|INVALID_ARGUMENT/.test(detail)) await env.DB.prepare("UPDATE riders SET fcm_token = NULL WHERE fcm_token = ?").bind(token).run();
  }
}

async function fcmAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  if (fcmTokenCache && fcmTokenCache.exp > now + 60) return fcmTokenCache.token;
  const pem = account.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const assertion = await signJwt(
    { alg: "RS256", typ: "JWT" },
    { iss: account.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 },
    key, { name: "RSASSA-PKCS1-v1_5" }
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const result = await response.json();
  if (!result.access_token) throw new Error("FCM auth failed");
  fcmTokenCache = { token: result.access_token, exp: now + (result.expires_in || 3600) };
  return fcmTokenCache.token;
}

// ---------------------------------------------------------------- helpers

async function signJwt(header, claims, key, algorithm) {
  const enc = new TextEncoder();
  const input = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(claims)))}`;
  const signature = new Uint8Array(await crypto.subtle.sign(algorithm, key, enc.encode(input)));
  return `${input}.${b64url(signature)}`;
}

function validPoint(p, earliest = 0, latest = Date.now() + 2 * MIN) {
  const lat = Number(p?.lat), lon = Number(p?.lon), t = Number(p?.t);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (!Number.isFinite(t) || t < earliest || t > latest) return null;
  const kind = KINDS.includes(p.kind) ? p.kind : "move";
  return { t: Math.round(t), lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, kind, note: cleanText(p.note, 80) || null };
}

function validTime(value, min, max) {
  const t = Number(value);
  return Number.isFinite(t) && t >= min && t <= max ? Math.round(t) : null;
}

function battery(value) {
  const b = Number(value);
  return Number.isFinite(b) && b >= 0 && b <= 100 ? Math.round(b) : null;
}

function cleanText(value, max) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

function randomToken() {
  return b64url(crypto.getRandomValues(new Uint8Array(32))); // 43 characters
}

async function sha256(textValue) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(textValue));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function body(request) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.includes("application/json")) fail(415, "JSON expected");
  const raw = await request.text();
  if (raw.length > 64 * 1024) fail(413, "too large");
  try { return JSON.parse(raw || "{}"); } catch { fail(400, "invalid JSON"); }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
function text(value, status = 200) {
  return new Response(value, { status, headers: { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}
function html(value, status) {
  return new Response(value, {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
function asset(value, type, extra = {}) {
  return new Response(value, { headers: { ...SECURITY_HEADERS, "Content-Type": type, "Cache-Control": "public, max-age=300", ...extra } });
}

export { timings, rideState, validPoint }; // for tests
