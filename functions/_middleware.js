// deals.prophet.partners: one handler for the whole site.
// Partner password gate, admin (Basic Auth), JSON API, stats. Data in D1 (binding DB).
import * as data from "../lib/db.js";

const COOKIE = "pp_deals";
const MAX_AGE = 60 * 60 * 24 * 30;
const MAX_FAILS = 10; // wrong passwords per IP per 15 min
const enc = new TextEncoder();

const HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...HEADERS } });
const html = (body, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...HEADERS } });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
}
// Constant-time compare via HMAC digests (equal length regardless of input).
async function same(a, b) {
  const [x, y] = await Promise.all([hmac(String(a), "cmp"), hmac(String(b), "cmp")]);
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return r === 0 && x.length === y.length;
}
// Sessions are signed with the partner password mixed in, so changing the password signs everyone out.
const sessionSecret = (env) => `${env.COOKIE_SECRET || ""}|${env.DEALS_PASSWORD}`;

async function readSession(request, env) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig || !(await same(sig, await hmac(payload, sessionSecret(env))))) return null;
  try {
    const s = JSON.parse(fromB64url(payload));
    return Date.now() - s.t < MAX_AGE * 1000 ? s : null;
  } catch { return null; }
}

// Reject state-changing requests that come from another site (CSRF).
function sameOrigin(request, url) {
  const site = request.headers.get("Sec-Fetch-Site");
  if (site) return site === "same-origin" || site === "none";
  const origin = request.headers.get("Origin");
  return origin ? origin === url.origin : false;
}

function contact(env) {
  const phone = env.CONTACT_PHONE || "+19292592077";
  return { email: env.CONTACT_EMAIL || "elen@prophet.partners", phone, whatsapp: env.CONTACT_WHATSAPP || phone, booking: env.BOOKING_URL || "" };
}

function loginPage(error = "", status = 200) {
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>deal sheet | prophet.partners</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#000;font:15px/1.5 "Helvetica Neue",Helvetica,Arial,system-ui,sans-serif}
form{width:min(360px,92vw);border-top:2px solid #000;padding:28px 0 0}
.brand{font-weight:700;font-size:17px;letter-spacing:-.01em}.brand span{color:#ff0000}
h1{font-weight:700;font-size:40px;line-height:1;letter-spacing:-.03em;margin:22px 0 6px}h1 em{font-style:normal;color:#ff0000}
p{color:#767676;margin:0 0 22px;font-size:13px}
label{display:block;font-size:12px;color:#767676;margin:14px 0 6px}
input{width:100%;padding:11px 12px;border:1px solid #d9d9d9;border-radius:0;font:inherit;background:#fff}
input:focus{outline:2px solid #ff0000;outline-offset:-1px;border-color:transparent}
button{margin-top:20px;width:100%;padding:12px;border:0;border-radius:0;background:#000;color:#fff;font-size:14px;font-weight:500;cursor:pointer}
button:hover{background:#ff0000}
.err{color:#ff0000;font-size:13px;margin-top:12px}
</style></head><body>
<form method="post" action="/login">
<div class="brand">prophet<span>.</span>partners</div><h1>deal sheet<em>.</em></h1><p>private markets &amp; secondaries. confidential.</p>
<label for="name">your name</label><input id="name" name="name" autocomplete="name" placeholder="optional">
<label for="pw">password</label><input id="pw" name="password" type="password" required autofocus autocomplete="current-password">
<button type="submit">enter</button>
${error ? `<div class="err">${esc(error)}</div>` : ""}
</form></body></html>`, status);
}

async function statsPage(db) {
  const s = await data.stats(db);
  const time = (t) => new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const label = { view: "viewed page", login: "signed in", click_email: "email", click_whatsapp: "whatsapp", click_call: "call", click_book: "book a call" };
  const tr = (cells) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
  return html(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>stats | deals admin</title>
<style>body{font:14px/1.45 "Helvetica Neue",Helvetica,Arial,system-ui,sans-serif;margin:0;padding:28px;background:#fff;color:#000}a{color:#000}h1{font-weight:700;font-size:28px;letter-spacing:-.02em;margin:8px 0}
h2{font-size:12px;font-weight:600;text-transform:lowercase;margin:30px 0 8px;display:flex;gap:8px;align-items:center}h2::before{content:"";width:8px;height:8px;background:#ff0000}
table{border-collapse:collapse;border:1px solid #e6e6e6;width:100%;max-width:960px}td,th{padding:7px 10px;border-bottom:1px solid #f0f0f0;text-align:left;font-variant-numeric:tabular-nums}th{font-size:11px;color:#767676;font-weight:500;text-transform:lowercase}p{color:#767676}</style></head><body>
<a href="/admin/">← deals admin</a><h1>stats</h1><p>New York time. Names are what visitors typed when signing in.</p>
<h2>visitors</h2><table><tr><th>name</th><th>last seen</th><th>page views</th><th>contact clicks</th></tr>${s.people.map((p) => tr([p.name, time(p.last), p.views, p.clicks])).join("") || "<tr><td colspan=4>no visits yet</td></tr>"}</table>
<h2>interest by deal</h2><table><tr><th>deal</th><th>email</th><th>whatsapp</th><th>total</th></tr>${s.deals.map((d) => tr([d.company ? `${d.company} · ${d.structure || ""}` : `${d.deal} (deleted)`, d.email, d.whatsapp, d.total])).join("") || "<tr><td colspan=4>no clicks yet</td></tr>"}</table>
<h2>general contact clicks (header)</h2><table><tr><th>type</th><th>clicks</th></tr>${s.general.map((g) => tr([label[g.type] || g.type, g.n])).join("") || "<tr><td colspan=2>none yet</td></tr>"}</table>
<h2>recent activity</h2><table><tr><th>time</th><th>name</th><th>event</th><th>deal</th><th>location</th></tr>${s.recent.map((r) => tr([time(r.t), r.name || "(no name)", label[r.type] || r.type, r.company || "", [r.city, r.country].filter(Boolean).join(", ")])).join("")}</table>
</body></html>`);
}

async function adminApi(request, url, db) {
  const route = url.pathname.slice("/api/admin/".length);
  if (request.method === "GET") {
    if (route === "deals") return json(await data.adminDeals(db, url.searchParams.get("archived") === "1"));
    if (route === "history") return json(await data.history(db));
    if (route === "export.csv") {
      return new Response("﻿" + (await data.exportCsv(db)), { headers: { ...HEADERS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="prophet-deals-${data.nyDate()}.csv"` } });
    }
    return json({ error: "Not found" }, 404);
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) return json({ error: "Expected JSON" }, 415);
  const body = await request.json().catch(() => ({}));
  try {
    if (route === "create") return json(await data.createDeal(db, body.fields || {}));
    if (route === "update") return json(await data.updateField(db, String(body.id), String(body.field), body.value));
    if (route === "company-note") return json(await data.setCompanyNote(db, body.company, body.note));
    if (route === "bulk") return json({ count: await data.bulk(db, body.ids, String(body.action)) });
  } catch (e) {
    return json({ error: e.message || "Save failed" }, 400);
  }
  return json({ error: "Not found" }, 404);
}

async function checkAdmin(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Basic ") || !env.ADMIN_PASSWORD) return false;
  let decoded = "";
  try { decoded = new TextDecoder().decode(Uint8Array.from(atob(auth.slice(6)), (c) => c.charCodeAt(0))); } catch { return false; }
  return same(decoded.slice(decoded.indexOf(":") + 1), env.ADMIN_PASSWORD);
}

export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  const url = new URL(request.url);
  if (!env.DEALS_PASSWORD || !env.ADMIN_PASSWORD || !env.DB) return html("Setup incomplete: set DEALS_PASSWORD, ADMIN_PASSWORD and the DB (D1) binding. See README.", 500);
  if (url.pathname === "/robots.txt") return next();
  const db = env.DB;
  await data.init(db);

  // Every state-changing request must come from this site.
  if (request.method !== "GET" && request.method !== "HEAD" && !sameOrigin(request, url)) return json({ error: "Cross-site request blocked" }, 403);

  // ---- admin ----
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/admin/")) {
    if (!(await checkAdmin(request, env))) {
      return new Response("Admin password required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="prophet-deals-admin", charset="UTF-8"', ...HEADERS } });
    }
    if (url.pathname.startsWith("/api/admin/")) return adminApi(request, url, db);
    if (url.pathname === "/admin/stats") return statsPage(db);
    if (url.pathname === "/admin") return Response.redirect(new URL("/admin/", url), 302);
    const res = await next();
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(HEADERS)) out.headers.set(k, v);
    return out;
  }

  // ---- partner login ----
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (url.pathname === "/login" && request.method === "POST") {
    if ((await data.recentFailures(db, ip)) >= MAX_FAILS) return loginPage("Too many attempts. Try again in 15 minutes.", 429);
    const form = await request.formData();
    const name = String(form.get("name") || "").trim().slice(0, 80);
    if (!(await same(String(form.get("password") || ""), env.DEALS_PASSWORD))) {
      data.logEvent(db, ctx, request, "login_fail", name);
      return loginPage("Wrong password.", 401);
    }
    const payload = b64url(enc.encode(JSON.stringify({ n: name, t: Date.now() })));
    data.logEvent(db, ctx, request, "login", name);
    return new Response(null, { status: 303, headers: { ...HEADERS, Location: "/", "Set-Cookie": `${COOKIE}=${payload}.${await hmac(payload, sessionSecret(env))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}` } });
  }
  if (url.pathname === "/logout") {
    return new Response(null, { status: 303, headers: { ...HEADERS, Location: "/", "Set-Cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
  }

  const session = await readSession(request, env);
  if (!session) {
    if (url.pathname.startsWith("/api/") || url.pathname.endsWith(".json")) return json({ error: "signed_out" }, 401);
    return loginPage();
  }

  // ---- partner API ----
  if (url.pathname === "/deals.json") return json({ ...(await data.publicDeals(db)), contact: contact(env) });
  if (url.pathname === "/api/event" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const type = { email: "click_email", whatsapp: "click_whatsapp", call: "click_call", book: "click_book" }[body.type];
    if (type) data.logEvent(db, ctx, request, type, session.n, body.deal || "");
    return new Response(null, { status: 204, headers: HEADERS });
  }
  if (url.pathname === "/" || url.pathname === "/index.html") data.logEvent(db, ctx, request, "view", session.n);

  const res = await next();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(HEADERS)) out.headers.set(k, v);
  return out;
}
