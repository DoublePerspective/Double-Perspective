// Admin dashboard markup and script (served from the Worker; no external assets).
export const PAGE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Double Perspective · Admin</title>
<style>
:root{--bg:#10191c;--panel:#17242a;--line:#2a3b42;--text:#f4efe6;--muted:#a9b5b3;--gold:#f2b65a;--teal:#57b6c2;--red:#e06a5a;--green:#7cc48a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{display:flex;align-items:center;gap:16px;padding:14px 22px;border-bottom:1px solid var(--line)}
header b{letter-spacing:.12em}header b span{color:var(--gold)}#who{margin-left:auto;color:var(--muted);font-size:13px}
nav{display:flex;gap:4px;padding:10px 22px;border-bottom:1px solid var(--line);flex-wrap:wrap}
nav button{background:none;border:1px solid transparent;color:var(--muted);padding:7px 14px;border-radius:8px;cursor:pointer;font:inherit}
nav button.on{color:var(--text);border-color:var(--line);background:var(--panel)}
main{padding:22px;max-width:1100px}section{display:none}section.on{display:block}
h2{font-size:18px;margin:0 0 14px}.muted{color:var(--muted)}.small{font-size:13px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:14px}
.meter{height:10px;background:#0c1316;border-radius:6px;overflow:hidden;margin:6px 0 2px}.meter i{display:block;height:100%;background:var(--teal)}
.meter i.warn{background:var(--gold)}.meter i.bad{background:var(--red)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:500}code{font-size:12px;color:var(--muted);word-break:break-all}
button.act,label.act{background:var(--teal);color:#06262b;border:0;border-radius:8px;padding:7px 12px;font:inherit;font-weight:600;cursor:pointer;display:inline-block}
button.act:disabled{opacity:.5;cursor:default}input[type=text]{width:100%;background:#0c1316;border:1px solid var(--line);color:var(--text);border-radius:8px;padding:8px;font:inherit}
.ok{color:var(--green)}.err{color:var(--red)}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:700px){.row{grid-template-columns:1fr}}
</style></head><body>
<header><b>DOUBLE <span>PERSPECTIVE</span> · ADMIN</b><span id="who"></span></header>
<nav><button data-tab="usage" class="on">Usage &amp; limits</button><button data-tab="packs">Map packs</button><button data-tab="edits">Site edits</button><button data-tab="log">Access log</button></nav>
<main>
<section id="usage" class="on"><h2>Free-plan usage</h2><p class="muted small">Daily limits reset at 00:00 UTC (19:00 Toronto); monthly ones on the 1st. Emails at 70%, 90% and 95%. Workers and D1 stop at their limits and never bill; R2 is the only service that could, so map downloads and uploads pause automatically at 95%.</p><div id="brakes"></div><div id="usage-body" class="grid"></div><p id="usage-err" class="err small"></p></section>
<section id="packs"><h2>Map packs</h2>
<div class="card"><p class="small muted">Catalog: <code id="cat-url"></code></p>
<p class="small">1. Import the catalog <code>canada.json</code> from the GPS project (app/src/main/assets/map-packs). 2. Upload each <code>.pmtiles</code> pack; size and SHA-256 are checked in your browser and again on the server, then written to the catalog.</p>
<label class="act">Import catalog<input id="cat-file" type="file" accept=".json" hidden></label> <span id="cat-msg" class="small"></span></div>
<div class="card"><table><thead><tr><th>Pack</th><th>Catalog size / SHA-256</th><th>Hosted file</th><th></th></tr></thead><tbody id="packs-body"></tbody></table></div></section>
<section id="edits"><h2>Quick site edits</h2><p class="muted small">Each save makes one commit to GitHub with the English and French text together; Cloudflare republishes the site in about a minute.</p><div id="edits-body"></div></section>
<section id="log"><h2>Access log</h2><p class="small muted">Every admin action is recorded here. Sign-ins and refused attempts are in <a id="access-logs" style="color:var(--teal)" target="_blank" rel="noopener">Cloudflare Access logs</a>.</p><div class="card"><table><thead><tr><th>When</th><th>Who</th><th>From</th><th>Action</th><th>Detail</th></tr></thead><tbody id="log-body"></tbody></table></div></section>
</main><script src="/app.js"></script></body></html>`;

export const APP_JS = `
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { "X-DP-Admin": "1", ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({ error: r.status + " " + r.statusText }));
  if (!r.ok || j.error) throw new Error(j.error || r.statusText);
  return j;
}
const fmt = (v, u) => v == null ? "unavailable" : u === "bytes" ? (v / 1073741824).toFixed(2) + " GB" : Math.round(v).toLocaleString("en-CA");
const loaded = {};
document.querySelectorAll("nav button").forEach((b) => b.onclick = () => {
  document.querySelectorAll("nav button, main section").forEach((x) => x.classList.remove("on"));
  b.classList.add("on"); $("#" + b.dataset.tab).classList.add("on"); load(b.dataset.tab);
});
function load(tab) { ({ usage: loadUsage, packs: loadPacks, edits: loadEdits, log: loadLog })[tab](); }

async function loadUsage() {
  $("#usage-body").innerHTML = '<p class="muted">Loading…</p>';
  try {
    const u = await api("/api/usage");
    $("#usage-body").innerHTML = u.metrics.map((m) => {
      const pct = m.value == null ? 0 : Math.min(100, (m.value / m.limit) * 100);
      const cls = pct >= 90 ? "bad" : pct >= 70 ? "warn" : "";
      return '<div class="card"><b>' + esc(m.label) + '</b><div class="meter"><i class="' + cls + '" style="width:' + pct.toFixed(1) + '%"></i></div>' +
        '<span class="small">' + fmt(m.value, m.unit) + " of " + fmt(m.limit, m.unit) + " this " + m.period + " (" + pct.toFixed(1) + "%)</span></div>";
    }).join("");
    $("#brakes").innerHTML = (u.brakes || []).map((b) => "<div class='card err'><b>Paused:</b> " + esc(b.reason) + " (until " + esc(b.until) + "-01 UTC)</div>").join("");
    $("#usage-err").textContent = u.errors.length ? "Some numbers are unavailable: " + u.errors.join(" · ") : "";
  } catch (e) { $("#usage-body").innerHTML = '<p class="err">' + esc(e.message) + "</p>"; }
}

async function sha256Hex(file) {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function loadPacks() {
  const body = $("#packs-body");
  body.innerHTML = '<tr><td colspan="4" class="muted">Loading…</td></tr>';
  try {
    const p = await api("/api/packs");
    $("#cat-url").textContent = p.publicUrl + "/canada.json";
    if (!p.catalog) { body.innerHTML = '<tr><td colspan="4" class="muted">No catalog yet — import canada.json first.</td></tr>'; return; }
    const hosted = new Map(p.objects.map((o) => [o.key, o]));
    body.innerHTML = p.catalog.packs.map((k) => {
      const h = k.path && hosted.get(k.path);
      return "<tr><td><b>" + esc(k.name) + "</b><br><span class='small muted'>" + esc(k.nameFr) + " · " + esc(k.id) + "</span></td>" +
        "<td class='small'>" + fmt(k.bytes) + " bytes<br><code>" + esc(k.sha256) + "</code></td>" +
        "<td class='small'>" + (h ? "<span class='ok'>✓ hosted</span><br><code>" + esc(k.path) + "</code>" : "<span class='muted'>not uploaded</span>") + "</td>" +
        "<td><label class='act'>Upload<input type='file' accept='.pmtiles' hidden data-id='" + esc(k.id) + "' data-sha='" + esc(k.sha256) + "'></label><div class='small' id='msg-" + esc(k.id) + "'></div></td></tr>";
    }).join("");
    body.querySelectorAll("input[type=file]").forEach((inp) => inp.onchange = () => uploadPack(inp));
  } catch (e) { body.innerHTML = '<tr><td colspan="4" class="err">' + esc(e.message) + "</td></tr>"; }
}
async function uploadPack(inp) {
  const f = inp.files[0]; if (!f) return;
  const msg = $("#msg-" + inp.dataset.id);
  try {
    msg.textContent = "Checking…";
    const sha = await sha256Hex(f);
    if (inp.dataset.sha && sha !== inp.dataset.sha && !confirm("This file's SHA-256 differs from the catalog (a rebuilt pack?). Upload it and update the catalog?")) { msg.textContent = "Cancelled"; return; }
    msg.textContent = "Uploading " + (f.size / 1048576).toFixed(1) + " MB…";
    const r = await api("/api/packs/" + inp.dataset.id, { method: "PUT", body: f, headers: { "X-Expected-SHA256": sha, "Content-Type": "application/octet-stream" } });
    msg.innerHTML = "<span class='ok'>Done</span>"; setTimeout(loadPacks, 800);
  } catch (e) { msg.innerHTML = "<span class='err'>" + esc(e.message) + "</span>"; }
}
$("#cat-file").onchange = async (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  try { const r = await api("/api/catalog", { method: "PUT", body: await f.text(), headers: { "Content-Type": "application/json" } }); $("#cat-msg").innerHTML = "<span class='ok'>Imported " + r.packs + " packs</span>"; loadPacks(); }
  catch (e) { $("#cat-msg").innerHTML = "<span class='err'>" + esc(e.message) + "</span>"; }
};

async function loadEdits() {
  const box = $("#edits-body"); box.innerHTML = '<p class="muted">Loading from GitHub…</p>';
  try {
    const { fields } = await api("/api/edits");
    box.innerHTML = fields.map((f) => {
      const side = (lang, v) => !v ? "<p class='err small'>Not found in the " + lang + " page</p>" :
        "<label class='small muted'>" + lang + " text</label><input type='text' data-k='" + f.key + "' data-l='" + lang.toLowerCase() + "' data-f='text' value='" + esc(v.text) + "'>" +
        (v.href != null ? "<label class='small muted'>" + lang + " link</label><input type='text' data-k='" + f.key + "' data-l='" + lang.toLowerCase() + "' data-f='href' value='" + esc(v.href) + "'>" : "");
      return "<div class='card'><b>" + esc(f.label) + "</b><div class='row'><div>" + side("EN", f.en) + "</div><div>" + side("FR", f.fr) + "</div></div>" +
        "<p><button class='act' data-save='" + f.key + "'>Save &amp; publish</button> <span class='small' id='em-" + f.key + "'></span></p></div>";
    }).join("");
    box.querySelectorAll("[data-save]").forEach((b) => b.onclick = () => saveEdit(b));
  } catch (e) { box.innerHTML = '<p class="err">' + esc(e.message) + "</p>"; }
}
async function saveEdit(btn) {
  const key = btn.dataset.save, out = { key, en: {}, fr: {} };
  document.querySelectorAll("input[data-k='" + key + "']").forEach((i) => out[i.dataset.l][i.dataset.f] = i.value);
  const m = $("#em-" + key); btn.disabled = true; m.textContent = "Committing…";
  try { const r = await api("/api/edits", { method: "POST", body: JSON.stringify(out), headers: { "Content-Type": "application/json" } });
    m.innerHTML = r.unchanged ? "<span class='muted'>No change</span>" : "<span class='ok'>Committed " + r.commit.slice(0, 7) + " · live in about a minute</span>"; }
  catch (e) { m.innerHTML = "<span class='err'>" + esc(e.message) + "</span>"; }
  btn.disabled = false;
}

async function loadLog() {
  const body = $("#log-body"); body.innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';
  try {
    const l = await api("/api/log"); $("#access-logs").href = l.accessLogsUrl;
    body.innerHTML = l.entries.map((e) => "<tr><td class='small'>" + new Date(e.ts).toLocaleString("en-CA") + "</td><td class='small'>" + esc(e.email) +
      "</td><td class='small'>" + esc(e.ip) + " " + esc(e.country) + "</td><td>" + esc(e.action) + "</td><td class='small'><code>" + esc(e.detail) + "</code></td></tr>").join("") ||
      '<tr><td colspan="5" class="muted">Nothing yet</td></tr>';
  } catch (e) { body.innerHTML = '<tr><td colspan="5" class="err">' + esc(e.message) + "</td></tr>"; }
}
api("/api/me").then((m) => $("#who").textContent = m.email).catch(() => {});
loadUsage();
`;
