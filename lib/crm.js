// Lightweight CRM: contacts, deal links (who's involved in a deal and how), interactions (timeline).
// Private: nothing here is ever sent to the partner page.
import { nyDate } from "./db.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const CONTACT_TYPES = ["buyer", "seller", "broker", "sponsor", "other"];
export const ROLES = ["brought", "cobroker", "sent", "interested", "passed", "ioi"];
export const CHANNELS = ["email", "call", "meeting", "whatsapp", "note"];
export const ROLE_LABEL = { brought: "brought it to me", cobroker: "co-broker", sent: "sent it to", interested: "interested", passed: "passed", ioi: "IOI" };

export const CRM_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', firm TEXT DEFAULT '', type TEXT NOT NULL DEFAULT 'other', email TEXT DEFAULT '', phone TEXT DEFAULT '', whatsapp TEXT DEFAULT '', notes TEXT DEFAULT '', followUp TEXT DEFAULT '', followUpNote TEXT DEFAULT '', source TEXT DEFAULT 'manual', archivedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS contacts_email ON contacts(email)`,
  `CREATE TABLE IF NOT EXISTS deal_contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, dealId TEXT NOT NULL, contactId TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'sent', ioi TEXT DEFAULT '', note TEXT DEFAULT '', date TEXT NOT NULL, createdAt TEXT NOT NULL, UNIQUE(dealId, contactId))`,
  `CREATE INDEX IF NOT EXISTS dc_contact ON deal_contacts(contactId)`,
  `CREATE TABLE IF NOT EXISTS interactions (id INTEGER PRIMARY KEY AUTOINCREMENT, contactId TEXT NOT NULL, dealId TEXT DEFAULT '', date TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'note', summary TEXT NOT NULL DEFAULT '', link TEXT DEFAULT '', source TEXT DEFAULT 'manual', createdAt TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS int_contact ON interactions(contactId, date)`,
  `CREATE INDEX IF NOT EXISTS int_deal ON interactions(dealId, date)`,
];

let ready = null;
export function initCrm(db) {
  ready ||= db.batch(CRM_SCHEMA.map((q) => db.prepare(q))).catch((e) => { ready = null; throw e; });
  return ready;
}

const EDITABLE = { name: "text", firm: "text", type: "type", email: "text", phone: "text", whatsapp: "text", notes: "longtext", followUp: "date", followUpNote: "text" };

const log = (db, action, text) => db.prepare("INSERT INTO changes (t, action, dealId, text) VALUES (?, ?, '', ?)").bind(new Date().toISOString(), action, text);
const now = () => new Date().toISOString();
const clip = (v, n = 600) => String(v ?? "").trim().slice(0, n);
const safeLink = (v) => { const s = clip(v, 1000); return /^https?:\/\//i.test(s) ? s : ""; };

export async function listContacts(db, archived) {
  const { results } = await db.prepare(`
    SELECT c.*, (SELECT MAX(date) FROM interactions i WHERE i.contactId = c.id) AS lastContact,
           (SELECT COUNT(*) FROM deal_contacts dc WHERE dc.contactId = c.id) AS dealCount
    FROM contacts c WHERE c.archivedAt IS ${archived ? "NOT NULL" : "NULL"}
    ORDER BY (c.followUp = '' OR c.followUp IS NULL), c.followUp, c.name COLLATE NOCASE`).all();
  return { today: nyDate(), contacts: results };
}

export async function createContact(db, f = {}) {
  const t = now();
  const name = clip(f.name, 200);
  const id = `c-${(name || "contact").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "contact"}-${crypto.randomUUID().slice(0, 6)}`;
  const type = CONTACT_TYPES.includes(f.type) ? f.type : "other";
  await db.batch([
    db.prepare("INSERT INTO contacts (id, name, firm, type, email, phone, whatsapp, notes, source, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, name, clip(f.firm, 200), type, clip(f.email, 200).toLowerCase(), clip(f.phone, 60), clip(f.whatsapp, 60), clip(f.notes, 5000), f.source === "agent" ? "agent" : "manual", t, t),
    log(db, "contact added", [name, f.firm].filter(Boolean).join(", ") || "(new contact)"),
  ]);
  return db.prepare("SELECT * FROM contacts WHERE id = ?").bind(id).first();
}

export async function updateContact(db, id, field, value) {
  const type = EDITABLE[field];
  if (!type) throw new Error("That field can't be edited.");
  let v;
  if (type === "type") v = CONTACT_TYPES.includes(value) ? value : "other";
  else if (type === "date") { v = String(value || ""); if (v && !DATE_RE.test(v)) throw new Error("Use a date like 2026-11-20."); }
  else v = clip(value, type === "longtext" ? 5000 : 300);
  if (field === "email") v = v.toLowerCase();
  const before = await db.prepare(`SELECT name, ${field} AS v FROM contacts WHERE id = ?`).bind(id).first();
  if (!before) throw new Error("Contact not found.");
  if (before.v !== v) {
    await db.batch([
      db.prepare(`UPDATE contacts SET ${field} = ?, updatedAt = ? WHERE id = ?`).bind(v, now(), id),
      log(db, "contact edited", `${before.name || "(contact)"}: ${field}${field === "notes" ? " edited" : ` → "${String(v).slice(0, 60)}"`}`),
    ]);
  }
  return db.prepare("SELECT * FROM contacts WHERE id = ?").bind(id).first();
}

export async function bulkContacts(db, ids, action) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 500) throw new Error("Select at least one contact.");
  if (!["archive", "restore", "delete"].includes(action)) throw new Error("Unknown action.");
  const scope = action === "archive" ? "archivedAt IS NULL" : "archivedAt IS NOT NULL";
  const { results: rows } = await db.prepare(`SELECT id, name FROM contacts WHERE ${scope} AND id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
  if (!rows.length) return 0;
  const ph = rows.map(() => "?").join(","), rid = rows.map((r) => r.id), t = now();
  const stmts = action === "archive" ? [db.prepare(`UPDATE contacts SET archivedAt = ?, updatedAt = ? WHERE id IN (${ph})`).bind(t, t, ...rid)]
    : action === "restore" ? [db.prepare(`UPDATE contacts SET archivedAt = NULL, updatedAt = ? WHERE id IN (${ph})`).bind(t, ...rid)]
    : [db.prepare(`DELETE FROM deal_contacts WHERE contactId IN (${ph})`).bind(...rid), db.prepare(`DELETE FROM interactions WHERE contactId IN (${ph})`).bind(...rid), db.prepare(`DELETE FROM contacts WHERE archivedAt IS NOT NULL AND id IN (${ph})`).bind(...rid)];
  const label = { archive: "contact archived", restore: "contact restored", delete: "contact deleted" }[action];
  await db.batch([...stmts, ...rows.map((r) => log(db, label, r.name || "(contact)"))]);
  return rows.length;
}

export async function contactDetail(db, id) {
  const contact = await db.prepare("SELECT * FROM contacts WHERE id = ?").bind(id).first();
  if (!contact) throw new Error("Contact not found.");
  const links = (await db.prepare(`SELECT dc.*, d.company, d.structure, d.size, d.price, d.side, d.archivedAt AS dealArchived FROM deal_contacts dc LEFT JOIN deals d ON d.id = dc.dealId WHERE dc.contactId = ? ORDER BY dc.date DESC`).bind(id).all()).results;
  const timeline = (await db.prepare(`SELECT i.*, d.company FROM interactions i LEFT JOIN deals d ON d.id = i.dealId WHERE i.contactId = ? ORDER BY i.date DESC, i.id DESC LIMIT 300`).bind(id).all()).results;
  return { contact, links, timeline };
}

export async function dealDetail(db, id) {
  const deal = await db.prepare("SELECT * FROM deals WHERE id = ?").bind(id).first();
  if (!deal) throw new Error("Deal not found.");
  const links = (await db.prepare(`SELECT dc.*, c.name, c.firm, c.type FROM deal_contacts dc JOIN contacts c ON c.id = dc.contactId WHERE dc.dealId = ? ORDER BY CASE dc.role WHEN 'brought' THEN 0 WHEN 'cobroker' THEN 1 WHEN 'ioi' THEN 2 WHEN 'interested' THEN 3 WHEN 'sent' THEN 4 ELSE 5 END, dc.date DESC`).bind(id).all()).results;
  const timeline = (await db.prepare(`SELECT i.*, c.name FROM interactions i JOIN contacts c ON c.id = i.contactId WHERE i.dealId = ? ORDER BY i.date DESC, i.id DESC LIMIT 300`).bind(id).all()).results;
  return { deal, links, timeline };
}

export async function upsertLink(db, f = {}) {
  const dealId = clip(f.dealId, 80), contactId = clip(f.contactId, 80);
  const role = ROLES.includes(f.role) ? f.role : "sent";
  const names = await db.prepare("SELECT (SELECT company FROM deals WHERE id = ?1) AS company, (SELECT name FROM contacts WHERE id = ?2) AS name").bind(dealId, contactId).first();
  if (names?.company == null) throw new Error("Deal not found.");
  if (names.name == null) throw new Error("Contact not found.");
  const t = now();
  await db.batch([
    db.prepare(`INSERT INTO deal_contacts (dealId, contactId, role, ioi, note, date, createdAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT(dealId, contactId) DO UPDATE SET role = ?3, ioi = ?4, note = ?5, date = ?6`).bind(dealId, contactId, role, clip(f.ioi, 100), clip(f.note, 500), nyDate(), t),
    log(db, "deal link", `${names.name}: ${ROLE_LABEL[role]} · ${names.company}${f.ioi ? ` (${clip(f.ioi, 100)})` : ""}`),
  ]);
  return { ok: true };
}

export async function deleteLink(db, id) {
  const r = await db.prepare("SELECT dc.id, c.name, d.company FROM deal_contacts dc LEFT JOIN contacts c ON c.id = dc.contactId LEFT JOIN deals d ON d.id = dc.dealId WHERE dc.id = ?").bind(id).first();
  if (!r) throw new Error("Link not found.");
  await db.batch([db.prepare("DELETE FROM deal_contacts WHERE id = ?").bind(id), log(db, "deal link removed", `${r.name} · ${r.company}`)]);
  return { ok: true };
}

export async function addInteraction(db, f = {}) {
  const contactId = clip(f.contactId, 80);
  const c = await db.prepare("SELECT name FROM contacts WHERE id = ?").bind(contactId).first();
  if (!c) throw new Error("Pick a contact.");
  const summary = clip(f.summary, 3000);
  if (!summary) throw new Error("Write a short summary.");
  const date = DATE_RE.test(f.date || "") ? f.date : nyDate();
  const channel = CHANNELS.includes(f.channel) ? f.channel : "note";
  await db.batch([
    db.prepare("INSERT INTO interactions (contactId, dealId, date, channel, summary, link, source, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(contactId, clip(f.dealId, 80), date, channel, summary, safeLink(f.link), f.source === "agent" ? "agent" : "manual", now()),
    log(db, "interaction", `${c.name} · ${channel}: ${summary.slice(0, 80)}`),
  ]);
  return { ok: true };
}

export async function deleteInteraction(db, id) {
  await db.batch([db.prepare("DELETE FROM interactions WHERE id = ?").bind(id), log(db, "interaction removed", `#${id}`)]);
  return { ok: true };
}

export async function contactsCsv(db) {
  const { results } = await db.prepare(`SELECT c.*, (SELECT MAX(date) FROM interactions i WHERE i.contactId = c.id) AS lastContact,
    (SELECT GROUP_CONCAT(d.company || ' (' || dc.role || ')', '; ') FROM deal_contacts dc JOIN deals d ON d.id = dc.dealId WHERE dc.contactId = c.id) AS deals
    FROM contacts c ORDER BY c.archivedAt IS NOT NULL, c.name COLLATE NOCASE`).all();
  const cols = ["name", "firm", "type", "email", "phone", "whatsapp", "notes", "followUp", "followUpNote", "lastContact", "deals", "source", "archivedAt", "createdAt", "id"];
  const cell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...results.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}
