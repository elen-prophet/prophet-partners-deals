// Deal-desk agent bridge.
// The scheduled agent (Claude, reading Gmail + Granola) only INSERTs rows into agent_inbox and agent_runs.
// This file applies those rows through the same rules as the admin:
//   contact / note / link     -> applied automatically, marked "agent"
//   new_deal                  -> added HIDDEN, waits in the Inbox for publish / dismiss
//                                (same company + identical terms = merged into the existing deal, sources listed)
//   deal_update / archive_suggest / match -> wait in the Inbox for accept / reject
import * as data from "./db.js";
import * as crm from "./crm.js";

export const AGENT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS agent_inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), runId TEXT DEFAULT '', kind TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}', summary TEXT DEFAULT '', sourceLink TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'new', dealId TEXT DEFAULT '', result TEXT DEFAULT '', doneAt TEXT)`,
  `CREATE INDEX IF NOT EXISTS inbox_status ON agent_inbox(status, id)`,
  `CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY, t TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), brief TEXT DEFAULT '', stats TEXT DEFAULT '{}')`,
];

let ready = null;
export function initAgent(db) {
  ready ||= db.batch(AGENT_SCHEMA.map((q) => db.prepare(q))).catch((e) => { ready = null; throw e; });
  return ready;
}

const now = () => new Date().toISOString();
const s = (v, n = 600) => String(v ?? "").trim().slice(0, n);
const norm = (v) => s(v).toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9$€.%/ ]/g, "");
const tagsUnion = (a, b) => crm.normTags([a, b].filter(Boolean).join(", "));

async function findContact(db, p) {
  if (p.contactId) { const c = await db.prepare("SELECT * FROM contacts WHERE id = ?").bind(p.contactId).first(); if (c) return c; }
  const email = s(p.email || p.contactEmail, 200).toLowerCase();
  if (email) { const c = await db.prepare("SELECT * FROM contacts WHERE lower(email) = ? ORDER BY archivedAt IS NOT NULL LIMIT 1").bind(email).first(); if (c) return c; }
  const name = s(p.name || p.contactName, 200);
  if (name) return db.prepare("SELECT * FROM contacts WHERE name = ? COLLATE NOCASE ORDER BY archivedAt IS NOT NULL LIMIT 1").bind(name).first();
  return null;
}

// Create or enrich a contact. Never removes types, never deletes, never overwrites what Elen wrote.
async function upsertContact(db, p) {
  const types = Array.isArray(p.types) ? p.types : s(p.types).split(",");
  const c = await findContact(db, p);
  const t = now(), today = data.nyDate();
  const personal = s(p.personalNote, 1000);
  if (!c) {
    if (!s(p.name) && !s(p.email)) throw new Error("contact needs a name or email");
    const made = await crm.createContact(db, { name: p.name, firm: p.firm, email: p.email || p.contactEmail, phone: p.phone, types, directAccess: p.directAccess, lookingFor: p.lookingFor, personalNotes: personal ? `${today}: ${personal} [agent]` : "", birthday: safeBirthday(p.birthday), source: "agent" });
    return made;
  }
  const merged = {
    name: c.name || s(p.name, 200), firm: c.firm || s(p.firm, 200), phone: c.phone || s(p.phone, 60), email: c.email || s(p.email, 200).toLowerCase(),
    types: crm.normTypes([...String(c.types || "").split(","), ...types]),
    directAccess: tagsUnion(c.directAccess, p.directAccess), lookingFor: tagsUnion(c.lookingFor, p.lookingFor),
    birthday: c.birthday || safeBirthday(p.birthday),
    personalNotes: personal ? `${today}: ${personal} [agent]${c.personalNotes ? "\n" + c.personalNotes : ""}` : c.personalNotes || "",
  };
  await db.prepare("UPDATE contacts SET name=?, firm=?, phone=?, email=?, types=?, directAccess=?, lookingFor=?, birthday=?, personalNotes=?, updatedAt=? WHERE id=?")
    .bind(merged.name, merged.firm, merged.phone, merged.email, merged.types, merged.directAccess, merged.lookingFor, merged.birthday, merged.personalNotes.slice(0, 20000), t, c.id).run();
  return { ...c, ...merged };
}
function safeBirthday(v) { try { return v ? crm.normBirthday(v) : ""; } catch { return ""; } }

async function findDeal(db, p) {
  if (p.dealId) { const d = await db.prepare("SELECT * FROM deals WHERE id = ?").bind(p.dealId).first(); if (d) return d; }
  if (p.company) return db.prepare("SELECT * FROM deals WHERE company = ? COLLATE NOCASE AND archivedAt IS NULL ORDER BY received DESC LIMIT 1").bind(s(p.company, 200)).first();
  return null;
}

const TERMS = ["structure", "size", "price", "fees"];
async function applyNewDeal(db, item, p) {
  if (!s(p.company)) throw new Error("new_deal needs a company");
  const side = p.side === "demand" ? "demand" : "supply";
  const sourceLine = `${data.nyDate()} · ${s(p.source, 300) || "agent"}${item.sourceLink ? ` (${item.sourceLink})` : ""}`;
  // Duplicate rule: same company + same side + identical terms -> one deal, sources listed. Different terms -> separate deal.
  const { results: same } = await db.prepare("SELECT * FROM deals WHERE company = ? COLLATE NOCASE AND side = ? AND archivedAt IS NULL").bind(s(p.company, 200), side).all();
  const dup = same.find((d) => TERMS.every((k) => norm(d[k]) === norm(p[k])));
  if (dup) {
    await db.prepare("UPDATE deals SET internalNotes = ?, received = ?, updatedAt = ? WHERE id = ?")
      .bind(`also from: ${sourceLine}${dup.internalNotes ? "\n" + dup.internalNotes : ""}`.slice(0, 5000), data.nyDate(), now(), dup.id).run();
    await db.prepare("INSERT INTO changes (t, action, dealId, text) VALUES (?, 'agent merged duplicate', ?, ?)").bind(now(), dup.id, `${dup.company}: same terms from ${s(p.source, 120)}`).run();
    return { status: "applied", dealId: dup.id, result: "merged into existing deal (same terms)" };
  }
  const d = await data.createDeal(db, {
    company: p.company, side, sector: p.sector, structure: p.structure, shareClass: p.shareClass, size: p.size, price: p.price, fees: p.fees,
    minCheck: p.minCheck, notes: p.notes, received: p.received, hidden: 1, source: s(p.source, 300),
    internalNotes: `Added by agent: ${sourceLine}${p.internalNotes ? "\n" + s(p.internalNotes, 2000) : ""}`,
  });
  if (p.contactEmail || p.contactName) {
    try {
      const c = await upsertContact(db, { email: p.contactEmail, name: p.contactName, firm: p.contactFirm, types: p.contactTypes || [] });
      await crm.upsertLink(db, { dealId: d.id, contactId: c.id, role: p.role || "brought" });
    } catch (e) { /* the deal still stands */ }
  }
  return { status: "pending", dealId: d.id, result: same.length ? `new deal (terms differ from ${same.length} live ${p.company} deal${same.length > 1 ? "s" : ""})` : "new deal, hidden until you publish" };
}

async function applyItem(db, item) {
  let p;
  try { p = JSON.parse(item.payload || "{}"); } catch { return { status: "error", result: "payload is not valid JSON" }; }
  switch (item.kind) {
    case "contact": { const c = await upsertContact(db, p); return { status: "applied", result: `contact: ${c.name || c.email}` }; }
    case "note": {
      let c = await findContact(db, p);
      if (!c && (p.name || p.email)) c = await upsertContact(db, { name: p.name, email: p.email, firm: p.firm, types: p.types || [] });
      if (!c) throw new Error("note: contact not found");
      await crm.appendNote(db, { contactId: c.id, text: p.text, channel: p.channel, company: p.company, link: p.link || item.sourceLink, date: p.date, source: "agent", field: p.personal ? "personalNotes" : "notes" });
      return { status: "applied", result: `note on ${c.name || c.email}` };
    }
    case "link": {
      const c = await findContact(db, p) || (p.name || p.email ? await upsertContact(db, p) : null);
      const d = await findDeal(db, p);
      if (!c || !d) throw new Error("link: contact or deal not found");
      await crm.upsertLink(db, { dealId: d.id, contactId: c.id, role: p.role, ioi: p.ioi });
      return { status: "applied", dealId: d.id, result: `${c.name} · ${p.role || "sent"} · ${d.company}` };
    }
    case "new_deal": return applyNewDeal(db, item, p);
    case "deal_update":
    case "archive_suggest":
    case "match": {
      const d = await findDeal(db, p);
      if (!d) throw new Error(`${item.kind}: deal not found`);
      return { status: "pending", dealId: d.id, result: "" };
    }
    default: return { status: "error", result: `unknown kind "${item.kind}"` };
  }
}

// Applies everything the agent has dropped in since last time. Cheap when there's nothing new.
export async function processInbox(db) {
  const { results } = await db.prepare("SELECT * FROM agent_inbox WHERE status = 'new' ORDER BY id LIMIT 300").all();
  for (const item of results) {
    // Claim the row first so two admin requests at the same moment can't apply it twice.
    const claim = await db.prepare("UPDATE agent_inbox SET status = 'processing' WHERE id = ? AND status = 'new'").bind(item.id).run();
    if (!claim.meta || claim.meta.changes !== 1) continue;
    let r;
    try { r = await applyItem(db, item); } catch (e) { r = { status: "error", result: e.message }; }
    await db.prepare("UPDATE agent_inbox SET status = ?, dealId = COALESCE(NULLIF(?, ''), dealId), result = ?, doneAt = CASE WHEN ? IN ('applied','error') THEN ? ELSE doneAt END WHERE id = ?")
      .bind(r.status, r.dealId || "", s(r.result, 500), r.status, now(), item.id).run();
  }
  return results.length;
}

export async function inboxView(db) {
  await processInbox(db);
  const pending = (await db.prepare(`SELECT i.*, d.company, d.structure, d.size, d.price, d.fees, d.hidden, d.archivedAt AS dealArchived, d.received
    FROM agent_inbox i LEFT JOIN deals d ON d.id = i.dealId WHERE i.status = 'pending' ORDER BY i.kind, i.id DESC LIMIT 300`).all()).results;
  const recent = (await db.prepare("SELECT id, t, kind, summary, status, result, sourceLink FROM agent_inbox WHERE status IN ('applied','error','dismissed') ORDER BY id DESC LIMIT 60").all()).results;
  const run = await db.prepare("SELECT * FROM agent_runs ORDER BY t DESC LIMIT 1").first();
  const requests = (await db.prepare("SELECT COUNT(*) AS n FROM contacts WHERE access = 'requested' AND archivedAt IS NULL").first())?.n || 0;
  return { pending, recent, run, requests };
}

const EDITABLE_TERMS = ["structure", "shareClass", "size", "price", "fees", "minCheck", "notes", "sector", "received"];
export async function resolve(db, id, action) {
  const item = await db.prepare("SELECT * FROM agent_inbox WHERE id = ? AND status = 'pending'").bind(id).first();
  if (!item) throw new Error("Already handled.");
  const p = JSON.parse(item.payload || "{}");
  let result = "";
  if (action === "accept") {
    if (item.kind === "new_deal") { await data.updateField(db, item.dealId, "hidden", false); result = "published"; }
    else if (item.kind === "deal_update") {
      for (const [k, v] of Object.entries(p.changes || {})) if (EDITABLE_TERMS.includes(k)) await data.updateField(db, item.dealId, k, v);
      if (p.bumpReceived !== false) await data.updateField(db, item.dealId, "received", data.nyDate());
      result = "terms updated";
    } else if (item.kind === "archive_suggest") { await data.bulk(db, [item.dealId], "archive"); result = "archived"; }
    else if (item.kind === "match") {
      const c = await findContact(db, p);
      if (c) await crm.upsertLink(db, { dealId: item.dealId, contactId: c.id, role: "sent" });
      result = c ? `linked ${c.name} as "sent it to"` : "noted";
    }
  } else if (action === "dismiss") {
    if (item.kind === "new_deal") { await data.bulk(db, [item.dealId], "archive"); result = "dismissed (deal archived)"; }
    else result = "dismissed";
  } else throw new Error("Unknown action.");
  await db.prepare("UPDATE agent_inbox SET status = ?, result = ?, doneAt = ? WHERE id = ?").bind(action === "accept" ? "applied" : "dismissed", result, now(), id).run();
  await db.prepare("INSERT INTO changes (t, action, dealId, text) VALUES (?, ?, ?, ?)").bind(now(), `inbox ${action}`, item.dealId || "", `${item.kind}: ${s(item.summary, 120)} → ${result}`).run();
  return { ok: true, result };
}
