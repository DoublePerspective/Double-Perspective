// Follower page for a private link: https://follow.doubleperspective.com/f/<token>
// Plain HTML/JS/CSS (strict CSP, no third-party scripts, no tiles): the path is drawn as an SVG,
// and "Open in Maps" links hand the last position to the follower's own map app.

export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>Gravel &amp; Pavement Scout</title>
<link rel="stylesheet" href="/f/style.css">
</head>
<body>
<main>
  <p class="brand">Gravel &amp; Pavement Scout</p>
  <h1 id="title">…</h1>
  <section id="status" class="card"><p id="state">…</p><p id="detail" class="muted"></p></section>
  <section class="card">
    <div id="map" class="map"><div id="tiles"></div><svg id="path"></svg>
    <a class="attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></div>
    <p id="last" class="muted"></p>
    <p class="actions"><a id="gmaps" class="button" target="_blank" rel="noopener noreferrer">Google Maps</a>
    <a id="osm" class="button" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></p>
  </section>
  <section class="card"><h2 id="eventsTitle"></h2><ul id="events"></ul></section>
  <section class="card"><button id="alerts" type="button"></button><p id="alertsNote" class="muted"></p></section>
  <p class="muted small" id="footer"></p>
</main>
<script src="/f/app.js"></script>
</body>
</html>`;

export const GONE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Link expired / Lien expiré</title><link rel="stylesheet" href="/f/style.css"></head>
<body><main><p class="brand">Gravel &amp; Pavement Scout</p>
<h1>This link has expired.</h1><p class="muted">The rider ended sharing, or the ride finished more than 12 hours ago.</p>
<h1 lang="fr">Ce lien a expiré.</h1><p class="muted" lang="fr">Le motard a arrêté le partage, ou la sortie s’est terminée il y a plus de 12 heures.</p>
</main></body></html>`;

export const PAGE_CSS = `
:root { color-scheme: light dark; --bg:#0f1417; --card:#192126; --text:#eef1ec; --muted:#9aa7aa; --accent:#23d18b; --warn:#f2b134; --bad:#ff5a4f; }
@media (prefers-color-scheme: light) { :root { --bg:#f3f5f4; --card:#fff; --text:#1d2a2f; --muted:#5d6a6e; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:16px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width:560px; margin:0 auto; padding:16px; }
.brand { color:var(--accent); font-weight:700; letter-spacing:.04em; text-transform:uppercase; font-size:12px; margin:8px 0 0; }
h1 { font-size:22px; margin:4px 0 12px; } h2 { font-size:15px; margin:0 0 8px; }
.card { background:var(--card); border-radius:14px; padding:14px 16px; margin:0 0 12px; }
#state { font-size:20px; font-weight:700; margin:0; }
.ok #state { color:var(--accent); } .warn #state { color:var(--warn); } .bad #state { color:var(--bad); }
.bad { outline:2px solid var(--bad); }
.muted { color:var(--muted); margin:4px 0 0; } .small { font-size:13px; }
.map { position:relative; width:100%; height:260px; overflow:hidden; border-radius:10px; background:#dfe5e2; }
#tiles, #path { position:absolute; inset:0; }
#tiles img { position:absolute; width:256px; height:256px; user-select:none; }
#path { width:100%; height:100%; pointer-events:none; }
.attribution { position:absolute; right:0; bottom:0; padding:1px 6px; font-size:11px; background:rgba(255,255,255,.8); color:#333; text-decoration:none; border-top-left-radius:6px; }
.actions { display:flex; gap:8px; flex-wrap:wrap; margin:10px 0 0; }
.button, button { display:inline-block; border:0; border-radius:10px; padding:10px 14px; background:var(--accent); color:#04130c; font-weight:700; text-decoration:none; font-size:15px; cursor:pointer; }
button[disabled] { opacity:.5; cursor:default; }
ul { list-style:none; margin:0; padding:0; } li { padding:6px 0; border-top:1px solid rgba(127,127,127,.18); } li:first-child { border-top:0; }
`;

export const PAGE_JS = `
"use strict";
const token = location.pathname.split("/").pop();
const fr = (navigator.language || "en").toLowerCase().startsWith("fr");
document.documentElement.lang = fr ? "fr" : "en";
const T = fr ? {
  title: (n) => "Sortie de " + n, idle: "Aucune sortie en cours", riding: "En route", paused: "En pause", ended: "Rentré · sortie terminée",
  no_news: "Pas de nouvelles depuis un moment", alarm: "Pas de nouvelles — alerte", no_answer: "N’a pas répondu à « Tout va bien? »",
  since: "Dernière nouvelle", next: "Prochaine nouvelle attendue vers", back: "Retour prévu vers", until: "jusqu’à environ",
  noSignal: "Probablement hors réseau cellulaire.", call: "Essayez de l’appeler. Si vous êtes inquiet, appelez le 911 avec la dernière position.",
  last: "Dernière position", battery: "Batterie", events: "Arrêts et événements", none: "Rien pour l’instant.",
  kinds: { start:"Départ", stop:"Arrêt", fuel:"Plein d’essence", restaurant:"Repas", camp:"Camp pour la nuit", pause:"Pause", ok:"Tout va bien", end:"Arrivé", no_answer:"Pas de réponse à « Tout va bien? »", battery:"Batterie faible" },
  alertsOn: "Recevoir les alertes sur cet appareil", alertsDone: "Alertes activées sur cet appareil", alertsOff: "Désactiver les alertes",
  iosNote: "Sur iPhone : touchez Partager puis « Sur l’écran d’accueil », ouvrez la page depuis l’icône, puis activez les alertes.",
  noPush: "Ce navigateur ne permet pas les alertes. La page se met à jour toute seule.",
  blocked: "Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur, puis réessayez.",
  footer: "Lien privé partagé par le motard. Les positions sont effacées 7 jours après la sortie. Les nouvelles dépendent du réseau cellulaire; ce n’est pas un service d’urgence.",
  ago: (m) => m < 1 ? "à l’instant" : m < 60 ? "il y a " + m + " min" : "il y a " + Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0"),
} : {
  title: (n) => n + "’s ride", idle: "No ride in progress", riding: "On the road", paused: "Taking a break", ended: "Home safe · ride ended",
  no_news: "No news for a while", alarm: "No news — alert", no_answer: "Didn’t answer “Everything OK?”",
  since: "Last news", next: "Next check-in expected around", back: "Expected back around", until: "until about",
  noSignal: "Probably out of cell coverage.", call: "Try calling them. If you’re worried, call 911 with the last position.",
  last: "Last position", battery: "Battery", events: "Stops and events", none: "Nothing yet.",
  kinds: { start:"Started", stop:"Stopped", fuel:"Fuel stop", restaurant:"Meal", camp:"Camp for the night", pause:"Break", ok:"Everything OK", end:"Arrived", no_answer:"No answer to “Everything OK?”", battery:"Low battery" },
  alertsOn: "Get alerts on this device", alertsDone: "Alerts are on for this device", alertsOff: "Turn alerts off",
  iosNote: "On iPhone: tap Share, then “Add to Home Screen”, open the page from the icon, then turn on alerts.",
  noPush: "This browser can’t show alerts. The page updates by itself.",
  blocked: "Notifications are blocked for this site. Allow them in the browser settings, then try again.",
  footer: "Private link shared by the rider. Positions are deleted 7 days after the ride. Check-ins need cell signal; this is not an emergency service.",
  ago: (m) => m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " ago",
};
const $ = (id) => document.getElementById(id);
const time = (t) => new Date(t).toLocaleTimeString(fr ? "fr-CA" : "en-CA", { hour: "numeric", minute: "2-digit" });
const day = (t) => new Date(t).toLocaleDateString(fr ? "fr-CA" : "en-CA", { weekday: "short", month: "short", day: "numeric" });

async function load() {
  const res = await fetch("/api/f/" + token, { cache: "no-store" });
  if (res.status === 410) { location.reload(); return; }
  const v = await res.json();
  render(v);
}

function render(v) {
  $("title").textContent = T.title(v.riderName);
  document.title = T.title(v.riderName) + " · Gravel & Pavement Scout";
  $("footer").textContent = T.footer;
  $("eventsTitle").textContent = T.events;
  const r = v.ride, card = $("status");
  card.className = "card";
  let state = T.idle, detail = "";
  if (r) {
    const mins = r.last ? Math.round((v.now - r.last.t) / 60000) : 0;
    state = T[r.state] || T.riding;
    if (r.state === "riding") { card.classList.add("ok"); detail = T.since + " " + T.ago(mins) + " · " + T.next + " " + time(r.nextExpected); }
    else if (r.state === "paused") { card.classList.add("ok"); state = (T.kinds[r.kind] || T.paused) + " · " + T.until + " " + time(r.until); detail = T.since + " " + T.ago(mins); }
    else if (r.state === "no_news") { card.classList.add("warn"); detail = T.since + " " + T.ago(mins) + " (" + time(r.since) + "). " + T.noSignal; }
    else if (r.state === "alarm" || r.state === "no_answer") { card.classList.add("bad"); detail = T.since + " " + T.ago(mins) + " (" + day(r.since) + " " + time(r.since) + "). " + T.call; }
    else if (r.state === "ended") { card.classList.add("ok"); detail = day(r.ended) + " " + time(r.ended); }
    if (r.expectedReturn && !r.ended) detail += " · " + T.back + " " + time(r.expectedReturn);
    if (r.battery !== null && r.battery !== undefined) detail += " · " + T.battery + " " + r.battery + " %";
  }
  $("state").textContent = state;
  $("detail").textContent = detail;

  const last = r && r.last;
  if (last) {
    const ll = last.lat.toFixed(5) + "," + last.lon.toFixed(5);
    $("last").textContent = T.last + (fr ? " : " : ": ") + ll + " · " + day(last.t) + " " + time(last.t);
    $("gmaps").href = "https://www.google.com/maps/search/?api=1&query=" + ll;
    $("osm").href = "https://www.openstreetmap.org/?mlat=" + last.lat + "&mlon=" + last.lon + "#map=13/" + last.lat + "/" + last.lon;
    $("gmaps").hidden = $("osm").hidden = false;
  } else {
    $("last").textContent = ""; $("gmaps").hidden = $("osm").hidden = true;
  }
  drawPath(v.points, last, (v.tracks || []).map(decodePolyline));

  const list = $("events"); list.textContent = "";
  const events = v.points.filter((p) => p.kind !== "move").slice(-30).reverse();
  if (!events.length) { const li = document.createElement("li"); li.textContent = T.none; list.append(li); }
  for (const p of events) {
    const li = document.createElement("li");
    li.textContent = time(p.t) + " · " + (T.kinds[p.kind] || p.kind);
    list.append(li);
  }
}

// Map: OpenStreetMap tiles placed by hand (no map library), path and stops drawn on top in SVG.
// Tiles are requested with only the site origin as referrer, never the private link.
const TILE = 256, MAX_ZOOM = 15;
const worldX = (lon, z) => (lon + 180) / 360 * TILE * 2 ** z;
const worldY = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * TILE * 2 ** z; };
let lastDrawKey = "";

/** Google encoded polyline (precision 5) → [{lat, lon}]. */
function decodePolyline(str) {
  const out = []; let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i < str.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d; else lon += d;
    }
    out.push({ lat: lat / 1e5, lon: lon / 1e5 });
  }
  return out;
}

function drawPath(points, last, tracks) {
  const box = $("map"), tiles = $("tiles"), svg = $("path");
  const pts = points.length ? points.slice() : [];
  if (last && !pts.some((p) => p.t === last.t)) pts.push(last);
  const trackPts = [].concat(...tracks);
  box.hidden = !pts.length;
  if (!pts.length) return;
  const W = box.clientWidth || 320, H = box.clientHeight || 260;
  const key = W + "x" + H + ":" + pts.length + ":" + trackPts.length + ":" + (last ? last.t : 0);
  if (key === lastDrawKey) return;
  lastDrawKey = key;

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of pts.concat(trackPts)) { minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon); }
  let z = pts.length === 1 ? 13 : MAX_ZOOM;
  while (z > 3 && (worldX(maxLon, z) - worldX(minLon, z) > W - 60 || worldY(minLat, z) - worldY(maxLat, z) > H - 90)) z--;
  const cx = (worldX(minLon, z) + worldX(maxLon, z)) / 2, cy = (worldY(maxLat, z) + worldY(minLat, z)) / 2 - 15; // room for the pin above
  const left = cx - W / 2, top = cy - H / 2, n = 2 ** z;

  tiles.textContent = "";
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + W) / TILE); tx++) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + H) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      const img = document.createElement("img");
      img.alt = ""; img.decoding = "async"; img.referrerPolicy = "origin";
      img.src = "https://tile.openstreetmap.org/" + z + "/" + (((tx % n) + n) % n) + "/" + ty + ".png";
      img.style.left = (tx * TILE - left) + "px"; img.style.top = (ty * TILE - top) + "px";
      tiles.append(img);
    }
  }

  const xy = (p) => [worldX(p.lon, z) - left, worldY(p.lat, z) - top];
  const ns = "http://www.w3.org/2000/svg";
  svg.textContent = "";
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  // With road-following tracks (Pro), draw them; otherwise join the check-ins in time order.
  const lines = tracks.length ? tracks.filter((t) => t.length > 1) : pts.length > 1 ? [pts.slice().sort((a, b) => a.t - b.t)] : [];
  for (const [color, width] of [["#ffffff", 7], ["#0f8f5c", 4]]) for (const seg of lines) {
    {
      const line = document.createElementNS(ns, "polyline");
      line.setAttribute("points", seg.map((p) => xy(p).map((v) => v.toFixed(1)).join(",")).join(" "));
      line.setAttribute("fill", "none"); line.setAttribute("stroke", color); line.setAttribute("stroke-width", width);
      line.setAttribute("stroke-linejoin", "round"); line.setAttribute("stroke-linecap", "round");
      svg.append(line);
    }
  }
  for (const p of pts.filter((p) => p.kind !== "move" && (!last || p.t !== last.t))) {
    const [x, y] = xy(p), dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", x); dot.setAttribute("cy", y); dot.setAttribute("r", "5");
    dot.setAttribute("fill", "#f2b134"); dot.setAttribute("stroke", "#fff"); dot.setAttribute("stroke-width", "2");
    svg.append(dot);
  }
  if (last) {
    // Map pin whose tip sits exactly on the last position.
    const [x, y] = xy(last);
    const shadow = document.createElementNS(ns, "ellipse");
    shadow.setAttribute("cx", x); shadow.setAttribute("cy", y); shadow.setAttribute("rx", "7"); shadow.setAttribute("ry", "2.5");
    shadow.setAttribute("fill", "rgba(0,0,0,.35)");
    const pin = document.createElementNS(ns, "path");
    pin.setAttribute("d", "M" + x.toFixed(1) + " " + y.toFixed(1) + " c-2.5-7.5-13-13-13-23.5 a13 13 0 1 1 26 0 c0 10.5-10.5 16-13 23.5z");
    pin.setAttribute("fill", "#ff3b30"); pin.setAttribute("stroke", "#fff"); pin.setAttribute("stroke-width", "2.5"); pin.setAttribute("stroke-linejoin", "round");
    const hole = document.createElementNS(ns, "circle");
    hole.setAttribute("cx", x); hole.setAttribute("cy", y - 23.5); hole.setAttribute("r", "5"); hole.setAttribute("fill", "#fff");
    svg.append(shadow, pin, hole);
  }
}
window.addEventListener("resize", () => { lastDrawKey = ""; load().catch(console.warn); });

// ---- alerts (Web Push without payload; the service worker fetches the status itself)
const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function setupAlerts() {
  const button = $("alerts"), note = $("alertsNote");
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    button.hidden = true; note.textContent = ios ? T.iosNote : T.noPush; return;
  }
  const reg = await navigator.serviceWorker.register("/f/sw.js?t=" + token, { scope: "/f/" + token });
  let sub = await reg.pushManager.getSubscription();
  const show = () => {
    button.textContent = sub ? T.alertsOff : T.alertsOn;
    note.textContent = sub ? T.alertsDone : Notification.permission === "denied" ? T.blocked : ios ? T.iosNote : "";
  };
  show();
  button.onclick = async () => {
    button.disabled = true;
    try {
      if (sub) {
        await fetch("/api/f/" + token + "/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe(); sub = null;
      } else {
        const { publicKey } = await (await fetch("/api/vapid")).json();
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) });
        const res = await fetch("/api/f/" + token + "/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        if (!res.ok) { await sub.unsubscribe(); sub = null; }
      }
    } catch (e) { console.warn(e); }
    button.disabled = false; show();
  };
}

load().catch(console.warn);
setupAlerts().catch(console.warn);
setInterval(() => load().catch(console.warn), 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load().catch(console.warn); });
`;

export const SW_JS = `
"use strict";
const token = new URL(self.location).searchParams.get("t");
const fr = (self.navigator.language || "en").toLowerCase().startsWith("fr");
const TEXT = fr ? {
  riding: (n) => n + " est en route", paused: (n) => n + " est en pause", ended: (n) => n + " est rentré",
  no_news: (n) => "Pas de nouvelles de " + n, alarm: (n) => "Alerte : pas de nouvelles de " + n,
  no_answer: (n) => n + " n’a pas répondu à « Tout va bien? »", body: "Touchez pour voir la dernière position.",
} : {
  riding: (n) => n + " is on the road", paused: (n) => n + " is taking a break", ended: (n) => n + " is home safe",
  no_news: (n) => "No news from " + n, alarm: (n) => "Alert: no news from " + n,
  no_answer: (n) => n + " didn’t answer “Everything OK?”", body: "Tap to see the last position.",
};
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let title = "Gravel & Pavement Scout", urgent = false;
    try {
      const v = await (await fetch("/api/f/" + token, { cache: "no-store" })).json();
      const state = (v.ride && v.ride.state) || "riding";
      title = (TEXT[state] || TEXT.riding)(v.riderName);
      urgent = state === "alarm" || state === "no_answer";
    } catch (e) {}
    await self.registration.showNotification(title, { body: TEXT.body, tag: "ride-" + token.slice(0, 8), renotify: true, requireInteraction: urgent, data: { url: "/f/" + token } });
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => {
    for (const c of list) if (c.url.includes(event.notification.data.url)) return c.focus();
    return self.clients.openWindow(event.notification.data.url);
  }));
});
`;
