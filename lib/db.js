// D1 data layer. Sets up its own tables and loads data/seed.json on first use.
import seed from "../data/seed.json";

export const nyDate = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const PUBLIC_FIELDS = ["id", "company", "side", "sector", "structure", "shareClass", "size", "price", "fees", "minCheck", "notes", "received", "featured"];
// Fields the admin grid may edit, with their type.
export const EDITABLE = {
  company: "text", side: "side", sector: "text", structure: "text", shareClass: "text", size: "text", price: "text",
  fees: "text", minCheck: "text", notes: "text", received: "date", featured: "bool", hidden: "bool", source: "text", internalNotes: "longtext",
};
const COLS = ["id", ...Object.keys(EDITABLE), "archivedAt", "createdAt", "updatedAt"];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS deals (id TEXT PRIMARY KEY, company TEXT NOT NULL DEFAULT '', side TEXT NOT NULL DEFAULT 'supply', sector TEXT DEFAULT '', structure TEXT DEFAULT '', shareClass TEXT DEFAULT '', size TEXT DEFAULT '', price TEXT DEFAULT '', fees TEXT DEFAULT '', minCheck TEXT DEFAULT '', notes TEXT DEFAULT '', received TEXT NOT NULL, featured INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, source TEXT DEFAULT '', internalNotes TEXT DEFAULT '', archivedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT NOT NULL, type TEXT NOT NULL, name TEXT DEFAULT '', deal TEXT DEFAULT '', ip TEXT DEFAULT '', city TEXT DEFAULT '', country TEXT DEFAULT '', ua TEXT DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS events_t ON events(t)`,
  `CREATE INDEX IF NOT EXISTS events_ip ON events(ip, type, t)`,
  `CREATE TABLE IF NOT EXISTS companies (name TEXT PRIMARY KEY COLLATE NOCASE, note TEXT NOT NULL DEFAULT '', updatedAt TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS changes (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT NOT NULL, action TEXT NOT NULL, dealId TEXT DEFAULT '', text TEXT DEFAULT '')`,
];

let ready = null; // once per isolate
export function init(db) {
  ready ||= (async () => {
    await db.batch(SCHEMA.map((s) => db.prepare(s)));
    const { n } = await db.prepare("SELECT COUNT(*) AS n FROM deals").first();
    const { m } = await db.prepare("SELECT COUNT(*) AS m FROM changes").first();
    if (n === 0 && m === 0) {
      const now = new Date().toISOString();
      const stmts = seed.deals.map((d) => insertStmt(db, { ...d, received: d.received || d.posted, createdAt: now, updatedAt: now }));
      for (const [name, note] of Object.entries(seed.companyNotes || {})) stmts.push(db.prepare("INSERT INTO companies (name, note, updatedAt) VALUES (?, ?, ?)").bind(name, note, now));
      stmts.push(db.prepare("INSERT INTO changes (t, action, text) VALUES (?, 'imported', ?)").bind(now, `${seed.deals.length} starting deals`));
      await db.batch(stmts);
    }
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

function insertStmt(db, d) {
  const row = {
    id: d.id, company: d.company || "", side: d.side === "demand" ? "demand" : "supply", sector: d.sector || "", structure: d.structure || "",
    shareClass: d.shareClass || "", size: d.size || "", price: d.price || "", fees: d.fees || "", minCheck: d.minCheck || "", notes: d.notes || "",
    received: DATE_RE.test(d.received || "") ? d.received : nyDate(), featured: d.featured ? 1 : 0, hidden: d.hidden || d.status === "draft" ? 1 : 0,
    source: d.source || "", internalNotes: d.internalNotes || "", archivedAt: null, createdAt: d.createdAt, updatedAt: d.updatedAt,
  };
  return db.prepare(`INSERT INTO deals (${COLS.join(",")}) VALUES (${COLS.map(() => "?").join(",")})`).bind(...COLS.map((c) => row[c]));
}

const ageDays = (received, today) => Math.round((Date.parse(today) - Date.parse(received)) / 86400000);

async function companyNotes(db) {
  const { results } = await db.prepare("SELECT name, note FROM companies WHERE note != ''").all();
  return Object.fromEntries(results.map((r) => [r.name.toLowerCase(), r.note]));
}

export async function setCompanyNote(db, company, note) {
  const name = String(company || "").trim().slice(0, 200);
  if (!name) throw new Error("Company name is required.");
  const v = String(note ?? "").trim().slice(0, 1000);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO companies (name, note, updatedAt) VALUES (?1, ?2, ?3) ON CONFLICT(name) DO UPDATE SET note = ?2, updatedAt = ?3").bind(name, v, now),
    logChange(db, "company note", null, `${name}: ${v ? `"${v.slice(0, 100)}"` : "cleared"}`),
  ]);
  return { company: name, note: v };
}

export async function publicDeals(db) {
  const today = nyDate();
  const { results } = await db.prepare(`SELECT ${PUBLIC_FIELDS.join(",")}, updatedAt FROM deals WHERE archivedAt IS NULL AND hidden = 0 AND company != '' ORDER BY received DESC, company`).all();
  let updated = "";
  const deals = results.map((d) => {
    if (d.updatedAt > updated) updated = d.updatedAt;
    const out = {};
    for (const k of PUBLIC_FIELDS) if (d[k] !== "" && d[k] !== null && d[k] !== 0) out[k] = k === "featured" ? true : d[k];
    out.age = ageDays(d.received, today);
    return out;
  });
  const notes = await companyNotes(db);
  const live = new Set(deals.map((d) => d.company.toLowerCase()));
  const companies = Object.fromEntries(Object.entries(notes).filter(([k]) => live.has(k)));
  return { today, updated: updated ? nyDate(new Date(updated)) : today, deals, companies };
}

export async function adminDeals(db, archived) {
  const { results } = await db.prepare(`SELECT * FROM deals WHERE archivedAt IS ${archived ? "NOT NULL" : "NULL"} ORDER BY ${archived ? "archivedAt DESC" : "received DESC, company"}`).all();
  return { today: nyDate(), deals: results, companies: await companyNotes(db) };
}

const summary = (d) => [d.company, d.structure, d.size, d.price].filter(Boolean).join(" · ");
const logChange = (db, action, d, text) => db.prepare("INSERT INTO changes (t, action, dealId, text) VALUES (?, ?, ?, ?)").bind(new Date().toISOString(), action, d?.id || "", text ?? summary(d || {}));

function coerce(field, value) {
  const type = EDITABLE[field];
  if (type === "bool") return value ? 1 : 0;
  if (type === "side") return value === "demand" ? "demand" : "supply";
  if (type === "date") { if (!DATE_RE.test(value || "")) throw new Error("Use a date like 2026-11-13."); return value; }
  return String(value ?? "").trim().slice(0, type === "longtext" ? 5000 : 600);
}

export async function createDeal(db, fields = {}) {
  const now = new Date().toISOString();
  const company = String(fields.company || "").trim().slice(0, 600);
  const id = `${(company || "deal").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "deal"}-${crypto.randomUUID().slice(0, 6)}`;
  const d = { ...fields, id, company, received: fields.received || nyDate(), createdAt: now, updatedAt: now };
  await db.batch([insertStmt(db, d), logChange(db, "added", d)]);
  return db.prepare("SELECT * FROM deals WHERE id = ?").bind(id).first();
}

export async function updateField(db, id, field, value) {
  if (!EDITABLE[field]) throw new Error("That field can't be edited.");
  const v = coerce(field, value);
  const before = await db.prepare(`SELECT id, company, ${field} AS v FROM deals WHERE id = ?`).bind(id).first();
  if (!before) throw new Error("Deal not found.");
  if (before.v === v) return db.prepare("SELECT * FROM deals WHERE id = ?").bind(id).first();
  const label = field === "internalNotes" || field === "source" ? `${before.company}: ${field} edited` : `${before.company}: ${field} "${String(before.v ?? "").slice(0, 60)}" → "${String(v).slice(0, 60)}"`;
  await db.batch([
    db.prepare(`UPDATE deals SET ${field} = ?, updatedAt = ? WHERE id = ?`).bind(v, new Date().toISOString(), id),
    logChange(db, "edited", { id }, label),
  ]);
  return db.prepare("SELECT * FROM deals WHERE id = ?").bind(id).first();
}

export async function bulk(db, ids, action) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 500) throw new Error("Select at least one deal.");
  const now = new Date().toISOString();
  const q = ids.map(() => "?").join(",");
  if (!["archive", "restore", "received", "delete"].includes(action)) throw new Error("Unknown action.");
  const scope = action === "restore" || action === "delete" ? "archivedAt IS NOT NULL" : "archivedAt IS NULL";
  const { results: rows } = await db.prepare(`SELECT id, company, structure, size, price FROM deals WHERE ${scope} AND id IN (${q})`).bind(...ids).all();
  if (!rows.length) return 0;
  const ph = (from) => rows.map((_, i) => `?${i + from}`).join(",");
  const sql = {
    archive: `UPDATE deals SET archivedAt = ?1, updatedAt = ?1 WHERE id IN (${ph(2)})`,
    restore: `UPDATE deals SET archivedAt = NULL, updatedAt = ?1 WHERE id IN (${ph(2)})`,
    received: `UPDATE deals SET received = ?2, updatedAt = ?1 WHERE id IN (${ph(3)})`,
    delete: `DELETE FROM deals WHERE archivedAt IS NOT NULL AND ?1 IS NOT NULL AND id IN (${ph(2)})`,
  }[action];
  if (!sql) throw new Error("Unknown action.");
  const ids2 = rows.map((r) => r.id);
  const params = action === "received" ? [now, nyDate(), ...ids2] : [now, ...ids2];
  const label = { archive: "archived", restore: "restored", received: "marked received today", delete: "deleted permanently" }[action];
  const extra = action === "delete" ? [
    db.prepare(`DELETE FROM deal_contacts WHERE dealId IN (${ph(1)})`).bind(...ids2),
    db.prepare(`UPDATE interactions SET dealId = '' WHERE dealId IN (${ph(1)})`).bind(...ids2),
  ] : [];
  await db.batch([db.prepare(sql).bind(...params), ...extra, ...rows.map((r) => logChange(db, label, r))]);
  return rows.length;
}

export async function history(db) {
  const { results } = await db.prepare("SELECT * FROM changes ORDER BY id DESC LIMIT 1000").all();
  return results;
}

export async function exportCsv(db) {
  const { results } = await db.prepare("SELECT * FROM deals ORDER BY archivedAt IS NOT NULL, received DESC, company").all();
  const cols = ["company", "side", "sector", "structure", "shareClass", "size", "price", "fees", "minCheck", "notes", "received", "featured", "hidden", "source", "internalNotes", "archivedAt", "createdAt", "updatedAt", "id"];
  const cell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...results.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}

export function logEvent(db, ctx, request, type, name, deal = "") {
  const cf = request.cf || {};
  ctx.waitUntil(db.prepare("INSERT INTO events (t, type, name, deal, ip, city, country, ua) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(new Date().toISOString(), type, String(name || "").slice(0, 80), String(deal || "").slice(0, 80), request.headers.get("CF-Connecting-IP") || "", cf.city || "", cf.country || "", (request.headers.get("User-Agent") || "").slice(0, 160))
    .run().catch(() => {}));
}

export async function recentFailures(db, ip) {
  const since = new Date(Date.now() - 15 * 60000).toISOString();
  const r = await db.prepare("SELECT COUNT(*) AS n FROM events WHERE ip = ? AND type = 'login_fail' AND t > ?").bind(ip, since).first();
  return r?.n || 0;
}

export async function stats(db) {
  const people = (await db.prepare(`SELECT COALESCE(NULLIF(name,''),'(no name)') AS name, MAX(t) AS last, SUM(type='view') AS views, SUM(type LIKE 'click_%') AS clicks FROM events WHERE type IN ('view','login') OR type LIKE 'click_%' GROUP BY 1 ORDER BY last DESC LIMIT 200`).all()).results;
  const deals = (await db.prepare(`SELECT e.deal, d.company, d.structure, SUM(e.type='click_email') AS email, SUM(e.type='click_whatsapp') AS whatsapp, COUNT(*) AS total FROM events e LEFT JOIN deals d ON d.id = e.deal WHERE e.type LIKE 'click_%' AND e.deal != '' GROUP BY e.deal ORDER BY total DESC LIMIT 100`).all()).results;
  const general = (await db.prepare(`SELECT type, COUNT(*) AS n FROM events WHERE type LIKE 'click_%' AND deal = '' GROUP BY type`).all()).results;
  const recent = (await db.prepare(`SELECT e.t, e.type, e.name, e.city, e.country, d.company FROM events e LEFT JOIN deals d ON d.id = e.deal WHERE e.type != 'login_fail' ORDER BY e.id DESC LIMIT 200`).all()).results;
  return { people, deals, general, recent };
}
