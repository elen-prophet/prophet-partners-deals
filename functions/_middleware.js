// deals.prophet.partners: one handler for the whole site.
// Partner password gate, admin (Basic Auth), JSON API, stats. Data in D1 (binding DB).
import * as data from "../lib/db.js";
import * as crm from "../lib/crm.js";
import * as agent from "../lib/agent.js";

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

const ROLES = ["Fund", "Syndicate", "Family office", "Investor", "Shareholder", "Broker", "Something else"];
const DISCLOSURE = `<p>DISCLOSURE: Rainmaker Securities, LLC ("RMS") is a FINRA registered broker-dealer and SIPC member. RMS representatives are supervised from the RMS registered branch office located at 3131 NE 1st Ave., Suite 3102, Miami, FL 33137. RMS is engaged by its clients to make referrals to buyers or sellers of securities. If such client closes a securities transaction with a buyer or seller so referred, RMS is entitled to a success fee from the client. Such success fee may be in the form of cash or in warrants to purchase securities of the client or client's affiliate. It is not uncommon for RMS or RMS representatives to hold equity in its issuer clients or in the issuers of securities purchased or sold by the parties to a transaction. This communication does not represent an offer or solicitation to buy or sell securities. Such an offer must be made via definitive legal documentation by the buyer or seller of securities. RMS deals only in securities offered in private placements ("Securities"). The Securities are not approved or disapproved by the SEC or any other federal or state agency. No regulatory agency has endorsed the accuracy or adequacy of this communication or any offer or solicitation to buy or sell the Securities. Only investors that qualify as "accredited investors", as defined Rule 501(d) of the Securities Act of 1933, may invest in the Securities. Investments in the Securities are speculative and involve a high degree of risk. An investor in the Securities should have little to no need for liquidity in the foreseeable future and should be able to withstand the loss of the entire investment. Potential buyers or sellers of the Securities should seek professional counsel prior to entering into any transaction.</p>
    <p>The principal of prophet.partners is also registered agent of Rainmaker Securities, LLC ("RMS"). RMS is a FINRA registered broker-dealer and SIPC member. Find RMS and its agents on <a href="https://brokercheck.finra.org/" target="_blank" rel="noopener">BrokerCheck</a>. The RMS relationship summary can be found on the <a href="https://www.rainmakersecurities.com/crs" target="_blank" rel="noopener">RMS website</a>. RMS is not an affiliate of prophet.partners. All securities transactions conducted by the principals of prophet.partners will be conducted via RMS.</p>
    <p>Any company names referenced are for illustrative purposes only and do not constitute an offer to buy or sell any securities or imply the availability of any transaction.</p>`;

async function loginPage(env, db, { error = "", status = 200, sent = false } = {}) {
  const t = await data.teaser(db);
  const sectors = t.sectors.slice(0, 4).join(", ");
  const site = env.TURNSTILE_SITEKEY || "";
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" href="/favicon.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><title>deal sheet | prophet.partners</title>
${site ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ""}
<style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;font:15px/1.5 "Helvetica Neue",Helvetica,Arial,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}.wrap{max-width:1080px;margin:0 auto;padding:28px 24px 48px}
.top{padding-bottom:18px;border-bottom:2px solid #000}.top img{height:30px;width:auto;display:block}
h1{font-weight:700;font-size:48px;line-height:1;letter-spacing:-.03em;margin:30px 0 10px}h1 em{font-style:normal;color:#ff0000}
.sub{font-size:16px;margin:0}
.teaser{margin-top:14px;font-size:14px;display:flex;gap:8px;align-items:baseline}.teaser b{font-size:22px;letter-spacing:-.02em}
.teaser .dot{width:8px;height:8px;border-radius:50%;background:#ff0000;display:inline-block;transform:translateY(-2px)}
.cred{margin-top:6px;font-size:12.5px;color:#767676}.cred a{color:#767676}
.grid{display:grid;grid-template-columns:320px 1fr;gap:28px;margin-top:34px;align-items:start}
.box{border-top:2px solid #000;padding-top:18px}
.lbl{font-size:12px;font-weight:600;text-transform:lowercase;display:flex;gap:8px;align-items:center;margin-bottom:12px}.lbl::before{content:"";width:8px;height:8px;background:#ff0000}
.req{background:#ff0000;color:#fff;padding:30px 32px;border-top:0}
.req .lbl{color:rgba(255,255,255,.8)}.req .lbl::before{background:#fff}
.req h2{font-weight:700;font-size:30px;line-height:1.1;letter-spacing:-.02em;margin:0}
.req .csub{margin:6px 0 20px;font-size:16px;color:rgba(255,255,255,.9)}
input,select,textarea{width:100%;padding:12px 13px;border:1px solid #d9d9d9;border-radius:0;font:inherit;background:#fff;color:#000}
.req input,.req select,.req textarea{border-color:transparent}
input:focus,select:focus,textarea:focus{outline:2px solid #000;outline-offset:-2px}
.box input:focus{outline-color:#ff0000}
textarea{min-height:96px;resize:vertical}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.f{display:grid;gap:10px}
.chk{display:flex;gap:9px;align-items:flex-start;font-size:13.5px;cursor:pointer}.chk input{width:auto;margin:3px 0 0;accent-color:#000}
button{padding:13px;border:0;border-radius:0;background:#000;color:#fff;font:inherit;font-weight:500;cursor:pointer;width:100%}
button:hover{background:#ff0000}.req button:hover{background:#fff;color:#000}
.err{color:#ff0000;font-size:13px;margin-top:10px}.req .err{color:#fff;font-weight:600}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.thanks{font-size:20px;font-weight:600;padding:20px 0}
.callme{margin-top:14px;font-size:13px;color:rgba(255,255,255,.9)}.callme a{text-decoration:none;border-bottom:1px solid rgba(255,255,255,.6)}
footer{margin-top:52px;border-top:2px solid #000;padding-top:16px;font-size:10.5px;line-height:1.6;color:#767676}footer p{margin:0 0 9px}
@media (max-width:820px){.wrap{padding:18px 16px 40px}h1{font-size:38px;margin-top:22px}.grid{grid-template-columns:1fr;gap:22px}.req{padding:24px 18px}.row2{grid-template-columns:1fr}input,select,textarea{font-size:16px}}
</style></head><body><div class="wrap">
<div class="top"><a href="https://prophet.partners"><img src="/logo.png" alt="prophet.partners"></a></div>
<h1>deal sheet<em>.</em></h1>
<p class="sub">Pre-IPO tech allocations. Confidential.</p>
${t.count ? `<div class="teaser"><span class="dot"></span><span><b>${t.count}</b> live allocations${sectors ? ` · ${esc(sectors)}` : ""} · updated daily</span></div>` : ""}
<div class="cred">Late-stage secondaries &amp; pre-IPO · Elena Kareva, Registered Representative, Rainmaker Securities · <a href="https://brokercheck.finra.org/" target="_blank" rel="noopener">BrokerCheck ↗</a></div>
<div class="grid">
  <form class="box" method="post" action="/login">
    <div class="lbl">have access</div>
    <div class="f"><input name="password" type="password" placeholder="password" required autocomplete="current-password" aria-label="password"><button type="submit">enter</button></div>
    ${error ? `<div class="err">${esc(error)}</div>` : ""}
  </form>
  <div class="box req" id="request">
    <div class="lbl">request access</div>
    <h2>Private markets run on relationships.</h2>
    <p class="csub">Let's build one.</p>
    ${sent ? `<div class="thanks">Thanks, we will be in touch.</div>` : `
    <form class="f" id="rq" method="post" action="/api/request">
      <input type="hidden" name="origin" value="deal sheet">
      <div class="hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>
      <div class="row2"><input name="name" placeholder="Name" autocomplete="name" required><input name="email" type="email" placeholder="Email" autocomplete="email" required></div>
      <input name="firm" placeholder="Firm" autocomplete="organization">
      <select name="role" id="role" required><option value="">You are...</option>${ROLES.map((r) => `<option>${r}</option>`).join("")}</select>
      <textarea name="message" placeholder="What are you looking for? Names, sectors, check size. Or what you'd like to sell."></textarea>
      <label class="chk"><input type="checkbox" name="accredited" id="acc"> <span>I'm an accredited investor, or represent one<span id="accreq"></span></span></label>
      <label class="chk"><input type="checkbox" name="weekly"> <span>Send me the weekly deal sheet</span></label>
      ${site ? `<div class="cf-turnstile" data-sitekey="${esc(site)}" data-theme="light"></div>` : ""}
      <button type="submit" id="send">send it</button>
      <div class="err" id="rqerr" hidden></div>
    </form>`}
  </div>
</div>
<footer>${DISCLOSURE}</footer>
</div>
<script>
(function(){
  var REQ=${JSON.stringify(crm.ACCREDITED_REQUIRED)};
  var f=document.getElementById("rq"); if(!f) return;
  var role=document.getElementById("role"), acc=document.getElementById("acc"), mark=document.getElementById("accreq");
  function sync(){ var need=REQ.indexOf(role.value)>=0; acc.required=need; mark.textContent=need?" (required)":""; }
  role.addEventListener("change",sync); sync();
  f.addEventListener("submit",function(e){
    e.preventDefault(); var err=document.getElementById("rqerr"), b=document.getElementById("send"); err.hidden=true;
    b.disabled=true; b.textContent="sending...";
    fetch(f.action,{method:"POST",body:new FormData(f),headers:{"Accept":"application/json"}}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
    .then(function(x){ if(x.ok){ f.outerHTML='<div class="thanks">Thanks, we will be in touch.</div>'; } else { err.textContent=x.j.error||"Something went wrong."; err.hidden=false; b.disabled=false; b.textContent="send it"; } })
    .catch(function(){ err.textContent="Something went wrong. Please try again."; err.hidden=false; b.disabled=false; b.textContent="send it"; });
  });
})();
</script>
</body></html>`, status);
}

async function statsPage(db) {
  const s = await data.stats(db);
  const time = (t) => new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const label = { view: "viewed page", login: "signed in", click_email: "email", click_whatsapp: "whatsapp", click_call: "call", click_book: "book a call" };
  const tr = (cells) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
  return html(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" href="/favicon.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><title>stats | deals admin</title>
<style>body{font:14px/1.45 "Helvetica Neue",Helvetica,Arial,system-ui,sans-serif;margin:0;padding:28px;background:#fff;color:#000}a{color:#000}h1{font-weight:700;font-size:28px;letter-spacing:-.02em;margin:8px 0}
h2{font-size:12px;font-weight:600;text-transform:lowercase;margin:30px 0 8px;display:flex;gap:8px;align-items:center}h2::before{content:"";width:8px;height:8px;background:#ff0000}
table{border-collapse:collapse;border:1px solid #e6e6e6;width:100%;max-width:960px}td,th{padding:7px 10px;border-bottom:1px solid #f0f0f0;text-align:left;font-variant-numeric:tabular-nums}th{font-size:11px;color:#767676;font-weight:500;text-transform:lowercase}p{color:#767676}</style></head><body>
<a href="/admin/">← deals admin</a><h1>stats</h1><p>New York time. Names are what visitors typed when signing in.</p>
<h2>visitors</h2><table><tr><th>name</th><th>last seen</th><th>page views</th><th>contact clicks</th></tr>${s.people.map((p) => tr([p.name, time(p.last), p.views, p.clicks])).join("") || "<tr><td colspan=4>no visits yet</td></tr>"}</table>
<h2>interest by deal</h2><table><tr><th>deal</th><th>email</th><th>call</th><th>total</th></tr>${s.deals.map((d) => tr([d.company ? `${d.company} · ${d.structure || ""}` : `${d.deal} (deleted)`, d.email, d.calls, d.total])).join("") || "<tr><td colspan=4>no clicks yet</td></tr>"}</table>
<h2>general contact clicks (header)</h2><table><tr><th>type</th><th>clicks</th></tr>${s.general.map((g) => tr([label[g.type] || g.type, g.n])).join("") || "<tr><td colspan=2>none yet</td></tr>"}</table>
<h2>recent activity</h2><table><tr><th>time</th><th>name</th><th>event</th><th>deal</th><th>location</th></tr>${s.recent.map((r) => tr([time(r.t), r.name || "(no name)", label[r.type] || r.type, r.company || "", [r.city, r.country].filter(Boolean).join(", ")])).join("")}</table>
</body></html>`);
}


// ---------- public access requests (login page + main site) ----------
const REQUEST_ORIGINS = ["https://prophet.partners", "https://www.prophet.partners"];
function corsFor(request, url, env) {
  const o = request.headers.get("Origin") || "";
  const extra = String(env.REQUEST_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);
  return o && (o === url.origin || REQUEST_ORIGINS.includes(o) || extra.includes(o)) ? { "Access-Control-Allow-Origin": o, Vary: "Origin" } : null;
}

async function handleRequest(ctx, request, env, url, db) {
  const cors = corsFor(request, url, env);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: cors ? 204 : 403, headers: { ...(cors || {}), "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Accept, Content-Type", "Access-Control-Max-Age": "86400" } });
  }
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");
  const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...HEADERS, ...(cors || {}) } });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (!cors) return reply({ error: "Request blocked." }, 403);

  let f;
  try {
    f = (request.headers.get("Content-Type") || "").includes("application/json") ? await request.json() : Object.fromEntries((await request.formData()).entries());
  } catch { return reply({ error: "Invalid form." }, 400); }
  const done = () => wantsJson ? reply({ ok: true })
    : cors["Access-Control-Allow-Origin"] === url.origin ? loginPage(env, db, { sent: true })
    : Response.redirect(`${cors["Access-Control-Allow-Origin"]}/#contact`, 303);
  if (f.website) return done(); // honeypot: bots fill hidden fields

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const since = new Date(Date.now() - 3600000).toISOString();
  const n = (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE ip = ? AND type = 'request' AND t > ?").bind(ip, since).first())?.n || 0;
  if (n >= 5) return reply({ error: "Too many requests. Please try again later." }, 429);

  if (env.TURNSTILE_SECRET) {
    const v = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(f["cf-turnstile-response"] || ""), remoteip: ip }) }).then((r) => r.json()).catch(() => ({}));
    if (!v.success) return reply({ error: "Please confirm you're human and try again." }, 400);
  }

  const email = String(f.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return reply({ error: "Please enter a valid email." }, 400);
  const role = ROLES.includes(f.role) ? f.role : "";
  const accredited = !!f.accredited && f.accredited !== "false";
  if (crm.ACCREDITED_REQUIRED.includes(role) && !accredited) return reply({ error: "Please confirm you're an accredited investor, or represent one." }, 400);
  const origin = cors["Access-Control-Allow-Origin"] === url.origin ? "deal sheet" : "main site";
  const r = { name: String(f.name || ""), email, firm: String(f.firm || ""), role, message: String(f.message || ""), accredited, weekly: !!f.weekly && f.weekly !== "false", origin };

  const saved = await crm.upsertFromRequest(db, r);
  data.logEvent(db, ctx, request, "request", r.name || email, "");

  // Notify Elen through Formspree (same account as the main site). The request is already saved even if this fails.
  const form = env.FORMSPREE_ID || "xdavpopa";
  const base = env.PUBLIC_URL || url.origin;
  const who = [r.name || email, r.firm, role.toLowerCase()].filter(Boolean).join(", ");
  const text = [
    `New access request (${origin})${saved.alreadyApproved ? " · already approved" : ""}`, "",
    `Name: ${r.name || "-"}`, `Firm: ${r.firm || "-"}`, `Email: ${email}`, `You are: ${role || "-"}`,
    `Accredited: ${accredited ? "yes (self-certified " + data.nyDate() + ")" : "no"}`, `Weekly deal sheet: ${r.weekly ? "yes" : "no"}`, "",
    `Message: ${r.message || "-"}`, "",
    `Approve and send the password: ${base}/admin/approve?id=${encodeURIComponent(saved.id)}`,
    `Open in CRM: ${base}/admin/#contact=${encodeURIComponent(saved.id)}`,
  ].join("\n");
  ctx.waitUntil(fetch(`https://formspree.io/f/${form}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ _subject: `New access request: ${who}`, email, _replyto: email, name: r.name, message: text }),
  }).then(async (res) => { if (!res.ok) console.log("formspree", res.status, await res.text()); }).catch((e) => console.log("formspree error", e.message)));

  return done();
}

async function approvePage(env, url, db, action) {
  const id = url.searchParams.get("id") || "";
  let c;
  try { c = await crm.setAccess(db, id, action === "decline" ? "declined" : "approved"); }
  catch (e) { return html(`<p style="font-family:system-ui;padding:24px">${esc(e.message)} <a href="/admin/">Back to admin</a></p>`, 404); }
  const first = (c.name || "").split(" ")[0] || "there";
  const site = env.PUBLIC_URL || url.origin;
  const body = `Hi ${first},\n\nGreat to connect. Here's access to our live deal sheet:\n${site}\nPassword: ${env.DEALS_PASSWORD}\n\nAll terms are indicative and updated daily.${c.weekly === "1" ? " You'll also get the weekly update on Fridays." : ""}\n\nBest,\nElena`;
  const mailto = `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent("Your access to the prophet.partners deal sheet")}&body=${encodeURIComponent(body)}`;
  const approved = action !== "decline";
  return html(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" href="/favicon.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><title>${approved ? "approved" : "declined"} | deals admin</title>
<style>body{font:15px/1.5 "Helvetica Neue",Helvetica,Arial,system-ui,sans-serif;margin:0;padding:32px 20px;max-width:560px}h1{font-size:28px;letter-spacing:-.02em;margin:0 0 6px}p{color:#555}
a.btn{display:inline-block;background:#000;color:#fff;text-decoration:none;padding:13px 18px;margin:14px 10px 0 0}a.btn:hover{background:#ff0000}a.ghost{background:#fff;color:#000;border:1px solid #000}
pre{white-space:pre-wrap;background:#fafafa;border:1px solid #e6e6e6;padding:12px;font:13px/1.5 inherit}</style></head><body>
<h1>${approved ? "Approved" : "Declined"} ✓</h1>
<p>${esc(c.name || c.email)}${c.firm ? ", " + esc(c.firm) : ""} · ${esc(c.email)}</p>
${approved ? `<a class="btn" id="go" href="${esc(mailto)}">send welcome email</a>` : ""}
<a class="btn ghost" href="/admin/#contact=${encodeURIComponent(c.id)}">open in CRM</a>
${approved ? `<p style="margin-top:22px">If your mail app didn't open, copy this:</p><pre>${esc(body)}</pre><script>setTimeout(function(){location.href=document.getElementById("go").href;},400)</script>` : ""}
</body></html>`);
}

async function adminApi(request, url, db) {
  const route = url.pathname.slice("/api/admin/".length);
  if (request.method === "GET") {
    if (route === "deals") return json(await data.adminDeals(db, url.searchParams.get("archived") === "1"));
    if (route === "history") return json(await data.history(db));
    if (route === "inbox") return json(await agent.inboxView(db));
    try {
      if (route === "contacts") return json(await crm.listContacts(db, url.searchParams.get("archived") === "1"));
      if (route === "contact") return json(await crm.contactDetail(db, url.searchParams.get("id") || ""));
      if (route === "deal") return json(await crm.dealDetail(db, url.searchParams.get("id") || ""));
    } catch (e) { return json({ error: e.message }, 404); }
    if (route === "contacts.csv") {
      return new Response("\ufeff" + (await crm.contactsCsv(db)), { headers: { ...HEADERS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="prophet-contacts-${data.nyDate()}.csv"` } });
    }
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
    if (route === "contact-create") return json(await crm.createContact(db, body.fields || {}));
    if (route === "contact-update") return json(await crm.updateContact(db, String(body.id), String(body.field), body.value));
    if (route === "inbox-resolve") return json(await agent.resolve(db, Number(body.id), String(body.action)));
    if (route === "access") return json(await crm.setAccess(db, String(body.id), String(body.access)));
    if (route === "contact-bulk") return json({ count: await crm.bulkContacts(db, body.ids, String(body.action)) });
    if (route === "link") return json(await crm.upsertLink(db, body));
    if (route === "link-delete") return json(await crm.deleteLink(db, Number(body.id)));
    if (route === "note") return json(await crm.appendNote(db, body));
    if (route === "company-note") return json(await data.setCompanyNote(db, body.company, body.note));
    if (route === "company") return json(await data.setCompany(db, body.company, String(body.field), body.value));
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
  if (["/robots.txt", "/logo.png", "/favicon.ico", "/favicon.png", "/apple-touch-icon.png"].includes(url.pathname)) return next();
  const db = env.DB;
  await data.init(db);
  await crm.initCrm(db);
  await agent.initAgent(db);

  // Public request-access form (this site and prophet.partners). Has its own origin check.
  if (url.pathname === "/api/request") return handleRequest(ctx, request, env, url, db);

  // Every state-changing request must come from this site.
  if (request.method !== "GET" && request.method !== "HEAD" && !sameOrigin(request, url)) return json({ error: "Cross-site request blocked" }, 403);

  // ---- admin ----
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/admin/")) {
    // Brute-force guard: 10 wrong admin passwords per IP per 15 minutes, then locked out.
    const aip = request.headers.get("CF-Connecting-IP") || "";
    if ((await data.recentFailures(db, aip, "admin_fail")) >= MAX_FAILS) return new Response("Too many attempts. Try again in 15 minutes.", { status: 429, headers: HEADERS });
    if (!(await checkAdmin(request, env))) {
      if (request.headers.get("Authorization")) data.logEvent(db, ctx, request, "admin_fail", "");
      return new Response("Admin password required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="prophet-deals-admin", charset="UTF-8"', ...HEADERS } });
    }
    await agent.processInbox(db).catch((e) => console.log("agent inbox", e.message));
    if (url.pathname.startsWith("/api/admin/")) return adminApi(request, url, db);
    if (url.pathname === "/admin/stats") return statsPage(db);
    // Approve/decline change data on GET (they're links in the notification email), so only allow real page opens,
    // never a hidden image or script request from another site.
    if ((url.pathname === "/admin/approve" || url.pathname === "/admin/decline") && !["document", null].includes(request.headers.get("Sec-Fetch-Dest"))) return html("Open this link directly.", 403);
    if (url.pathname === "/admin/approve") return approvePage(env, url, db, "approve");
    if (url.pathname === "/admin/decline") return approvePage(env, url, db, "decline");
    if (url.pathname === "/admin") return Response.redirect(new URL("/admin/", url), 302);
    const res = await next();
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(HEADERS)) out.headers.set(k, v);
    return out;
  }

  // ---- partner login ----
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (url.pathname === "/login" && request.method === "POST") {
    if ((await data.recentFailures(db, ip)) >= MAX_FAILS) return loginPage(env, db, { error: "Too many attempts. Try again in 15 minutes.", status: 429 });
    const form = await request.formData();
    const name = "";
    if (!(await same(String(form.get("password") || ""), env.DEALS_PASSWORD))) {
      data.logEvent(db, ctx, request, "login_fail", name);
      return loginPage(env, db, { error: "Wrong password.", status: 401 });
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
    return loginPage(env, db);
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
