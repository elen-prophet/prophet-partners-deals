// Lightweight CRM (private, admin only): contacts, deal links, dated notes.
// Nothing here is ever sent to the partner page.
import { nyDate } from "./db.js";

export const TYPES = ["Fund", "SPV", "FO", "Broker", "Introducer", "Buy side", "Sell side"];
export const ROLES = ["brought", "cobroker", "sent", "interested", "passed", "ioi"];
export const CHANNELS = ["email", "call", "meeting", "whatsapp", "note"];
export const ROLE_LABEL = { brought: "brought it to me", cobroker: "co-broker", sent: "sent it to", interested: "interested", passed: "passed", ioi: "IOI" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const CRM_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', firm TEXT DEFAULT '', type TEXT DEFAULT '', email TEXT DEFAULT '', phone TEXT DEFAULT '', whatsapp TEXT DEFAULT '', notes TEXT DEFAULT '', followUp TEXT DEFAULT '', followUpNote TEXT DEFAULT '', source TEXT DEFAULT 'manual', archivedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS contacts_email ON contacts(email)`,
  `CREATE TABLE IF NOT EXISTS deal_contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, dealId TEXT NOT NULL, contactId TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'sent', ioi TEXT DEFAULT '', note TEXT DEFAULT '', date TEXT NOT NULL, createdAt TEXT NOT NULL, UNIQUE(dealId, contactId))`,
  `CREATE INDEX IF NOT EXISTS dc_contact ON deal_contacts(contactId)`,
  `CREATE TABLE IF NOT EXISTS interactions (id INTEGER PRIMARY KEY AUTOINCREMENT, contactId TEXT NOT NULL, dealId TEXT DEFAULT '', date TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'note', summary TEXT NOT NULL DEFAULT '', link TEXT DEFAULT '', source TEXT DEFAULT 'manual', createdAt TEXT NOT NULL)`,
];
// v2 columns, added safely to databases created by the earlier version.
const V2_COLUMNS = ["types", "directAccess", "lookingFor", "birthday", "personalNotes", "access", "weekly", "accredited"];

let ready = null;
export function initCrm(db) {
  ready ||= (async () => {
    await db.batch(CRM_SCHEMA.map((q) => db.prepare(q)));
    const { results: cols } = await db.prepare("PRAGMA table_info(contacts)").all();
    const have = new Set(cols.map((c) => c.name));
    const add = V2_COLUMNS.filter((c) => !have.has(c));
    if (add.length) await db.batch(add.map((c) => db.prepare(`ALTER TABLE contacts ADD COLUMN ${c} TEXT DEFAULT ''`)));
    if (add.includes("types")) {
      // One-time carry-over from v1 fields.
      await db.batch([
        db.prepare(`UPDATE contacts SET types = CASE type WHEN 'buyer' THEN 'Buy side' WHEN 'seller' THEN 'Sell side' WHEN 'broker' THEN 'Broker' WHEN 'sponsor' THEN 'SPV' ELSE '' END WHERE COALESCE(types,'') = ''`),
        db.prepare(`UPDATE contacts SET phone = whatsapp WHERE COALESCE(phone,'') = '' AND COALESCE(whatsapp,'') != ''`),
      ]);
    }
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

const log = (db, action, text) => db.prepare("INSERT INTO changes (t, action, dealId, text) VALUES (?, ?, '', ?)").bind(new Date().toISOString(), action, text);
const now = () => new Date().toISOString();
const clip = (v, n = 600) => String(v ?? "").trim().slice(0, n);
const safeLink = (v) => { const s = clip(v, 1000); return /^https?:\/\//i.test(s) ? s : ""; };

// "Anthropic, shield ai ,Anthropic" -> "Anthropic, shield ai"
export function normTags(v) {
  const seen = new Set(), out = [];
  for (const t of String(v ?? "").split(/[,;\n]/)) {
    const s = t.trim().replace(/\s+/g, " ").slice(0, 80);
    if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); }
  }
  return out.slice(0, 60).join(", ");
}
export function normTypes(v) {
  const want = new Set((Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => String(x).trim().toLowerCase()));
  return TYPES.filter((t) => want.has(t.toLowerCase())).join(", ");
}
// Accepts "Mar 14", "14 Mar", "3/14", "03-14", "March 14"; stores "MM-DD".
export function normBirthday(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  let m, d;
  let r = s.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (r) { m = +r[1]; d = +r[2]; }
  else if ((r = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2})$/))) { m = MONTHS.findIndex((x) => r[1].toLowerCase().startsWith(x.toLowerCase())) + 1; d = +r[2]; }
  else if ((r = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?$/))) { m = MONTHS.findIndex((x) => r[2].toLowerCase().startsWith(x.toLowerCase())) + 1; d = +r[1]; }
  if (!m || m > 12 || !d || d > 31) throw new Error('Birthday: use day and month, e.g. "Mar 14".');
  return `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export const ACCESS = ["requested", "approved", "declined"];
const FIELDS = { name: "text", firm: "text", types: "types", email: "email", phone: "text", directAccess: "tags", lookingFor: "tags", notes: "long", personalNotes: "long", birthday: "birthday", access: "access", weekly: "bool" };
function coerce(field, value) {
  switch (FIELDS[field]) {
    case "types": return normTypes(value);
    case "tags": return normTags(value);
    case "birthday": return normBirthday(value);
    case "access": return ACCESS.includes(value) ? value : "";
    case "bool": return value === true || value === "1" || value === "yes" ? "1" : "";
    case "email": return clip(value, 200).toLowerCase();
    case "long": return clip(value, 20000);
    default: return clip(value, 300);
  }
}

const SELECT = `SELECT c.id, c.name, c.firm, c.types, c.email, c.phone, c.directAccess, c.lookingFor, c.notes, c.personalNotes, c.birthday, c.source, c.access, c.weekly, c.accredited, c.archivedAt, c.createdAt, c.updatedAt,
  (SELECT COUNT(*) FROM deal_contacts dc JOIN deals d ON d.id = dc.dealId WHERE dc.contactId = c.id) AS dealCount FROM contacts c`;

export async function listContacts(db, archived) {
  const { results } = await db.prepare(`${SELECT} WHERE c.archivedAt IS ${archived ? "NOT NULL" : "NULL"} ORDER BY c.name COLLATE NOCASE`).all();
  return { today: nyDate(), types: TYPES, contacts: results };
}

export async function createContact(db, f = {}) {
  const t = now(), name = clip(f.name, 200);
  const id = `c-${(name || "contact").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "contact"}-${crypto.randomUUID().slice(0, 6)}`;
  await db.batch([
    db.prepare(`INSERT INTO contacts (id, name, firm, types, email, phone, directAccess, lookingFor, notes, personalNotes, birthday, source, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, name, clip(f.firm, 200), normTypes(f.types), clip(f.email, 200).toLowerCase(), clip(f.phone, 60), normTags(f.directAccess), normTags(f.lookingFor), clip(f.notes, 20000), clip(f.personalNotes, 20000), f.birthday ? normBirthday(f.birthday) : "", f.source === "agent" ? "agent" : "manual", t, t),
    log(db, "contact added", [name, f.firm].filter(Boolean).join(", ") || "(new contact)"),
  ]);
  return db.prepare(`${SELECT} WHERE c.id = ?`).bind(id).first();
}

export async function updateContact(db, id, field, value) {
  if (!FIELDS[field]) throw new Error("That field can't be edited.");
  const v = coerce(field, value);
  const before = await db.prepare(`SELECT name, ${field} AS v FROM contacts WHERE id = ?`).bind(id).first();
  if (!before) throw new Error("Contact not found.");
  if ((before.v ?? "") !== v) {
    const quiet = field === "notes" || field === "personalNotes";
    await db.batch([
      db.prepare(`UPDATE contacts SET ${field} = ?, updatedAt = ? WHERE id = ?`).bind(v, now(), id),
      log(db, "contact edited", `${before.name || "(contact)"}: ${field}${quiet ? " edited" : ` → "${String(v).slice(0, 80)}"`}`),
    ]);
  }
  return db.prepare(`${SELECT} WHERE c.id = ?`).bind(id).first();
}

// Adds a dated line to the top of Notes (or Personal notes). Used by the admin and, later, the agent.
export async function appendNote(db, f = {}) {
  const field = f.field === "personalNotes" ? "personalNotes" : "notes";
  const c = await db.prepare(`SELECT name, ${field} AS v FROM contacts WHERE id = ?`).bind(clip(f.contactId, 80)).first();
  if (!c) throw new Error("Pick a contact.");
  const text = clip(f.text, 3000).replace(/\s*\n\s*/g, " ");
  if (!text) throw new Error("Write a short note.");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(f.date || "") ? f.date : nyDate();
  const channel = CHANNELS.includes(f.channel) ? f.channel : "";
  const deal = clip(f.company, 120);
  const link = safeLink(f.link);
  const line = `${date}${channel ? ` · ${channel}` : ""}${deal ? ` · ${deal}` : ""}: ${text}${link ? ` (${link})` : ""}${f.source === "agent" ? " [agent]" : ""}`;
  const next = c.v ? `${line}\n${c.v}` : line;
  await db.batch([
    db.prepare(`UPDATE contacts SET ${field} = ?, updatedAt = ? WHERE id = ?`).bind(next.slice(0, 20000), now(), f.contactId),
    log(db, field === "notes" ? "note" : "personal note", `${c.name}: ${text.slice(0, 80)}`),
  ]);
  return { ok: true, line };
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
  const contact = await db.prepare(`${SELECT} WHERE c.id = ?`).bind(id).first();
  if (!contact) throw new Error("Contact not found.");
  const links = (await db.prepare(`SELECT dc.*, d.company, d.structure, d.size, d.price, d.side, d.archivedAt AS dealArchived FROM deal_contacts dc JOIN deals d ON d.id = dc.dealId WHERE dc.contactId = ? ORDER BY dc.date DESC`).bind(id).all()).results;
  return { contact, links };
}

const hasTag = (list, company) => String(list || "").split(",").some((t) => t.trim().toLowerCase() === company.trim().toLowerCase());

export async function dealDetail(db, id) {
  const deal = await db.prepare("SELECT * FROM deals WHERE id = ?").bind(id).first();
  if (!deal) throw new Error("Deal not found.");
  const links = (await db.prepare(`SELECT dc.*, c.name, c.firm, c.types FROM deal_contacts dc JOIN contacts c ON c.id = dc.contactId WHERE dc.dealId = ? ORDER BY CASE dc.role WHEN 'brought' THEN 0 WHEN 'cobroker' THEN 1 WHEN 'ioi' THEN 2 WHEN 'interested' THEN 3 WHEN 'sent' THEN 4 ELSE 5 END, dc.date DESC`).bind(id).all()).results;
  let access = [], looking = [];
  if (deal.company) {
    const like = `%${deal.company.replace(/[%_]/g, "")}%`;
    const { results } = await db.prepare(`SELECT id, name, firm, types, directAccess, lookingFor FROM contacts WHERE archivedAt IS NULL AND (directAccess LIKE ?1 OR lookingFor LIKE ?1)`).bind(like).all();
    access = results.filter((c) => hasTag(c.directAccess, deal.company));
    looking = results.filter((c) => hasTag(c.lookingFor, deal.company));
  }
  return { deal, links, access, looking };
}

export async function upsertLink(db, f = {}) {
  const dealId = clip(f.dealId, 80), contactId = clip(f.contactId, 80);
  const role = ROLES.includes(f.role) ? f.role : "sent";
  const names = await db.prepare("SELECT (SELECT company FROM deals WHERE id = ?1) AS company, (SELECT name FROM contacts WHERE id = ?2) AS name").bind(dealId, contactId).first();
  if (names?.company == null) throw new Error("Deal not found.");
  if (names.name == null) throw new Error("Contact not found.");
  await db.batch([
    db.prepare(`INSERT INTO deal_contacts (dealId, contactId, role, ioi, note, date, createdAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT(dealId, contactId) DO UPDATE SET role = ?3, ioi = ?4, note = ?5, date = ?6`).bind(dealId, contactId, role, clip(f.ioi, 100), clip(f.note, 500), nyDate(), now()),
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

const MONTH = (mmdd) => (mmdd ? `${MONTHS[+mmdd.slice(0, 2) - 1]} ${+mmdd.slice(3)}` : "");
export async function contactsCsv(db) {
  const { results } = await db.prepare(`${SELECT.replace("FROM contacts c", ", (SELECT GROUP_CONCAT(d.company || ' (' || dc.role || ')', '; ') FROM deal_contacts dc JOIN deals d ON d.id = dc.dealId WHERE dc.contactId = c.id) AS deals FROM contacts c")} ORDER BY c.archivedAt IS NOT NULL, c.name COLLATE NOCASE`).all();
  const cols = ["name", "firm", "types", "email", "phone", "directAccess", "lookingFor", "notes", "personalNotes", "birthday", "access", "weekly", "accredited", "deals", "source", "archivedAt", "createdAt", "id"];
  const cell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...results.map((r) => cols.map((c) => cell(c === "birthday" ? MONTH(r[c]) : r[c])).join(","))].join("\r\n");
}

// ---------- website access requests ----------
export const REQUEST_ROLES = { "Fund": "Fund", "Syndicate": "SPV", "Family office": "FO", "Investor": "Buy side", "Shareholder": "Sell side", "Broker": "Broker", "Something else": "" };
export const ACCREDITED_REQUIRED = ["Fund", "Syndicate", "Family office", "Investor"];

// Creates or updates a contact from the public request form. Never downgrades an approved contact.
export async function upsertFromRequest(db, r) {
  const t = now(), today = nyDate();
  const email = clip(r.email, 200).toLowerCase();
  const typeTag = REQUEST_ROLES[r.role] || "";
  const line = `${today} · website (${r.origin}): ${r.role ? r.role.toLowerCase() + ". " : ""}${clip(r.message, 2000).replace(/\s*\n\s*/g, " ")}`.trim();
  const existing = await db.prepare(`${SELECT} WHERE lower(c.email) = ? ORDER BY c.archivedAt IS NOT NULL LIMIT 1`).bind(email).first();
  if (existing) {
    const types = normTypes([...String(existing.types || "").split(","), typeTag]);
    const access = existing.access === "approved" ? "approved" : "requested";
    await db.batch([
      db.prepare(`UPDATE contacts SET name = CASE WHEN name = '' THEN ?1 ELSE name END, firm = CASE WHEN COALESCE(firm,'') = '' THEN ?2 ELSE firm END, types = ?3, access = ?4,
        weekly = CASE WHEN ?5 = '1' THEN '1' ELSE COALESCE(weekly,'') END, accredited = CASE WHEN ?6 != '' THEN ?6 ELSE COALESCE(accredited,'') END,
        notes = CASE WHEN COALESCE(notes,'') = '' THEN ?7 ELSE ?7 || char(10) || notes END, archivedAt = NULL, updatedAt = ?8 WHERE id = ?9`)
        .bind(clip(r.name, 200), clip(r.firm, 200), types, access, r.weekly ? "1" : "", r.accredited ? today : "", line, t, existing.id),
      log(db, "website request", `${existing.name || email} (${r.origin})`),
    ]);
    return { id: existing.id, isNew: false, alreadyApproved: existing.access === "approved" };
  }
  const name = clip(r.name, 200);
  const id = `c-${(name || email.split("@")[0]).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "contact"}-${crypto.randomUUID().slice(0, 6)}`;
  await db.batch([
    db.prepare(`INSERT INTO contacts (id, name, firm, types, email, notes, source, access, weekly, accredited, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?)`)
      .bind(id, name, clip(r.firm, 200), normTypes([typeTag]), email, line, `website (${r.origin})`, r.weekly ? "1" : "", r.accredited ? today : "", t, t),
    log(db, "website request", `${name || email}${r.firm ? ", " + clip(r.firm, 200) : ""} (${r.origin})`),
  ]);
  return { id, isNew: true, alreadyApproved: false };
}

export async function setAccess(db, id, access) {
  if (!ACCESS.includes(access)) throw new Error("Unknown access status.");
  const c = await db.prepare(`${SELECT} WHERE c.id = ?`).bind(id).first();
  if (!c) throw new Error("Contact not found.");
  await db.batch([
    db.prepare("UPDATE contacts SET access = ?, updatedAt = ? WHERE id = ?").bind(access, now(), id),
    log(db, `access ${access}`, c.name || c.email),
  ]);
  return { ...c, access };
}
