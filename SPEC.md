# prophet.partners deal sheet: v1 tech spec

**Owner:** Elen Kareva · **Status:** v1, built · **Date:** Nov 13, 2026

## 1. What this is

This is a private web page where Elen's partners, mostly other brokers plus some buyers, browse her current secondary deal flow (roughly 10 to 20 new deals a week) and contact her about anything interesting.

Behind it is a simple spreadsheet-style back office where Elen adds, edits and archives deals.

**Principles**
- **As received:** deals are posted as indicative, the way they come in. Nothing is diligenced.
- **Age, not status:** nobody tells Elen when a deal dies. The page shows how old each deal is, and Elen archives deals by hand.
- **Contact first:** the only call to action is getting in touch with Elen.
- **Simple:** one page, one spreadsheet, one password. No pipeline tracking, matching or per-partner pricing in v1.

## 2. Addresses

| URL | Who | Access |
|---|---|---|
| `deals.prophet.partners` | Partners | One shared password, plus an optional name field |
| `deals.prophet.partners/admin/` | Elen | Separate admin password |
| `deals.prophet.partners/admin/stats` | Elen | Same admin password |

## 3. Deal record

| Field | Visible to partners | Notes |
|---|---|---|
| Company | yes | |
| Side | yes | `supply` (available) or `demand` (buyer looking) |
| Sector | yes | Free text with suggestions (AI, Defense, Space…) |
| Structure | yes | Direct transfer, L1 SPV, L2 SPV, primary, IPO allocation… |
| Share class | yes | Preferred / Common |
| Size, Price, Fees, Min check | yes | Free text, exactly as received |
| Deal note | yes | Context for this specific offer. Never sponsor names. |
| Company description | yes | One line per company (black dot). Belongs to the company, not the deal, so it survives archiving and reappears on the next deal with the same name. |
| Company note | yes | One per company (red dot), e.g. "raising at $28.8B". It also survives archiving. |
| Posted | yes | Date the deal came in (stored as `received`). This drives the age line: black for 0 to 10 days, grey after. |
| Highlight | yes | Pins the deal to the top as a card |
| Hidden | no | The deal is kept in the sheet but not shown to partners |
| Source | **never** | Who sent it: person, firm, thread |
| Internal notes | **never** | Anything private |
| Archived | no | Archived deals disappear from the page. They can be restored. |

Private fields are removed on the server. They are never sent to a partner's browser in any form.

## 4. Partner page (v2, Nov 14)

- **Header:** "deal sheet." on the left, with a **business card** on the right:
  - Elena Kareva, Managing Partner @ prophet.partners, Registered Representative @ Rainmaker Securities
  - email, with a copy button
  - phone
  - a "book a call" meeting link, shown when `BOOKING_URL` is set
- **One page, two sections**, with no tabs:
  1. **Supply** (available allocations): highlighted cards first, then all available deals grouped by company.
  2. **Demand** (buyers looking for): grouped by company.

  Sector filters and search apply to both sections.
- **Highlighted cards:** any number of them, flowing onto more rows as needed. No date shown. The **email** and **call** buttons sit at the bottom of each card.
- **Company header:** name and sector, then the one-line **description** (black dot), then the **company note** (red dot).
- **Each deal row:**
  - structure, size, price, fees, min
  - "posted Xd ago"
  - **email** and **call** buttons
  - the deal note, if there is one

  There are no WhatsApp buttons on the partner page.
- **Age:** a black line for deals posted within the last 10 days and a grey line after that. Age has no red and no warning labels.
- **Footer:** the full disclosure provided by Elen (RMS, the prophet.partners relationship, "illustrative purposes" language).
- **Phones:** the header stacks, cards span the full width, buttons are full width, and the search box is on top.

## 4b. Login page and access requests (Nov 15)

- **Login page:**
  - prophet.partners logo and "deal sheet."
  - "Pre-IPO tech allocations. Confidential."
  - Teaser: "**N** live allocations · top 4 sectors · updated daily". N is counted from live supply deals each time the page loads; no names or terms are shown.
  - Credibility line with a BrokerCheck link.
  - Password-only sign in (no name field, so stats show visits by city only).
  - The request form, and the full disclosure.
- **Request form, shared with the main site's contact section:**
  - Fields: name, email (required), firm, "You are…" (Fund · Syndicate · Family office · Investor · Shareholder · Broker · Something else), message, an accredited checkbox, and a weekly deal sheet checkbox.
  - The accredited checkbox is **required** for Fund, Syndicate, Family office and Investor.
  - Confirmation: "Thanks, we will be in touch."
- **On submit:**
  - The person is created in the CRM, or updated if the email already exists. They are never downgraded if already approved.
  - Types map as follows: Fund → Fund, Syndicate → SPV, Family office → FO, Investor → Buy side, Shareholder → Sell side, Broker → Broker.
  - The message becomes a dated line in Notes.
  - Access is set to **requested**, with weekly and the accredited date saved.
- **Notification:** sent by email through Formspree (form `xdavpopa`) with **Approve** and **Open in CRM** links. Replying to it goes to the requester.
- **Approving:**
  - One tap marks the person approved and opens the welcome email, prefilled with the link and password.
  - Decline is available in the contact card.
  - In the admin: access and weekly columns, filters for requests, approved, declined and the weekly list, and a "contacts (N new)" badge.
- **Public email:** none on the public pages. Only the phone is shown. elen@ appears only behind the password.

## 5. Admin (the spreadsheet)

**Company memory:**
- Company description and note live in a company table, so archiving a deal never loses them.
- When a new deal gets a company name used before, it reuses the existing spelling ("shield ai" becomes "Shield AI") and the last sector.

**Deal card:** click the age › to open a full edit form with:
- every deal field
- the company fields
- private fields
- buttons to archive and to mark posted today
- the people on the deal, and who has access to it or is looking for it

On a phone, deals appear as cards that open this form.


- **Layout:** one grid, one row per deal and one column per field. **Click any cell to edit it.** It saves on its own when you click away, and a small "saved" confirmation appears.
- **Adding:** "+ add deal" puts an empty row at the top. "Received" defaults to today.
- **Checkbox actions** on selected rows:
  - **archive:** removes the deal from the page; it stays restorable
  - **mark received today:** for a deal that has been re-sent, which resets its age
- **Shortcut:** "select 21d+" ticks every deal older than 21 days, so you can archive old deals in two clicks.
- **Filtering:** search covers company, source and notes. Filter by side, or show only hidden deals.
- **Archived tab:** restore a deal, or delete it permanently, for example duplicates.
- **History tab:** every add, edit, archive and restore, with a timestamp.
- **Export CSV:** downloads the full sheet, private columns included, for your records or for Rainmaker.
- **Stats page:**
  - visitors, with name, last seen and visit count
  - clicks per deal (email, WhatsApp, call, book)
  - recent activity

## 5b. CRM (private, admin only), v2 co-designed Nov 14

The CRM is lightweight and lives in the same database as the deals. **Nothing in it is ever sent to the partner page.**

**Main uses:**
- When a deal comes in: **who could buy it?**
- When a buyer asks for something: **who has direct access to it?**

**Who goes in:** only people tied to a deal, or people Elen adds herself. No imports yet; that's a later step.

| Column | Notes |
|---|---|
| Name, Firm | |
| Type | Multiple choice: Fund, SPV, FO, Broker, Introducer, Buy side, Sell side |
| Email, Phone | Phone is also used for the WhatsApp link |
| Direct access to | Company names, comma separated, with suggestions taken from the deal list |
| Looking for | Company names, comma separated. The mirror of "direct access to", so buyers and sellers can be matched. |
| Notes | A dated log from calls and emails, newest first, e.g. `2026-11-14 · call · Lightmatter: wants it under $80 (link)`. The agent adds lines here. |
| Personal notes | Family, interests, where you met. Elen writes these; the agent may add details from small talk. |
| Birthday | Day and month only, typed as "Mar 14", "14 Mar" or "3/14". No reminders. |
| Deals | Number of deals the person is linked to |

Removed in v2: WhatsApp (phone is used instead), follow-up fields (follow-ups move to the agent's morning brief), last contact.

**Screens**
- **Contacts tab:** spreadsheet editing. One search box covers name, firm, type, access, looking for and notes, plus a filter by type.
- **Contact card:** opened with › on desktop, or by tapping on phone. It shows quick call, WhatsApp and email links, every field, a quick "add note" box (dated, with an optional deal and link), personal notes, birthday, and their deals with roles. Tapping a company chip finds everyone else who has it.
- **Deal panel:** opened by clicking a deal's age ›. It shows:
  - who is on the deal and their role (brought it to me, co-broker, sent it to, interested, passed, IOI with an amount)
  - **who has direct access to this company** and **who is looking for it**, each with a one-click add
  - a box to log a note, which goes into that person's Notes, tagged with the company
- **Mobile:** contacts appear as cards, and the contact card opens full screen.

**Agent permissions (phase 2)**
- **May add:** new people from deal emails and calls, lines in Notes, companies in "direct access to" and "looking for", personal details from small talk.
- **Never:** change Type, or delete anything.
- **Follow-ups:** handled in the morning brief, not stored in the CRM.

## 5c. Deal desk agent (v1, Nov 15)

- **What it is:** a scheduled Claude task, every morning around 6:40am New York time, so the brief is ready by 7. It reads Gmail (including the "Rainmaker Deals" label and rrlist) and Granola. The full rules are in `AGENT.md`.
- **How it reaches the back office:** through the **Cloudflare Developer Platform** connector, against `deals-db`. It only reads, and only inserts rows into `agent_inbox` and `agent_runs`. The back office applies those rows the next time the admin is opened:
  - **Contacts, notes and deal links:** applied automatically and marked "agent". Types are only ever added, never removed. Personal notes are added on top, never overwritten.
  - **New deals:** added **hidden**, and you publish, edit or dismiss them in the **Inbox**.
  - **Duplicates:** same company and identical terms are merged into one deal, with every source listed in its private notes. If terms differ, each offer stays a separate deal.
  - **Term changes, archive suggestions and matches:** wait in the Inbox for you to accept or reject.
- **Contact types:** Rainmaker colleagues are **RMS Broker**. Other brokers are **Broker**.
- **The brief:** saved at the top of the **Inbox** tab, and sent as the task's notification email and push. Sections: Must do today, Follow-ups owed, Waiting on others, New deal flow, Possible matches, Today's meetings, Drafts ready, Needs your input.
- **What the agent never does:** send email (drafts only), delete anything, change a contact's type, or publish to partners.
- **Out of v1:** the Friday partner email.

## 6. Getting deals in

| Source | v1 | Later |
|---|---|---|
| Rainmaker list emails, sponsor emails | Elen adds them in the admin | Daily scan of Gmail labelled `Deals`; new deals land in the sheet as **hidden** rows for Elen to review |
| Calls (Granola) | Manual | The daily scan picks up deals mentioned in calls |
| WhatsApp | Manual. Personal WhatsApp can't be connected to anything that reads it. | Forward the message to your own Gmail with the `Deals` label, and the scan picks it up |

The daily scan writes through the same admin functions, so its rows show up in History like any other edit.

## 7. Security

- **Partner sessions:** a signed cookie that lasts 30 days, can't be read by scripts on the page, and only travels over HTTPS. Changing the partner password signs everyone out.
- **Password guessing:** after 10 wrong passwords from one IP within 15 minutes, logins from that IP are blocked for 15 minutes.
- **Admin:** a separate password, using the browser's own sign-in prompt.
- **Forged requests:** any change request that doesn't come from the site's own pages is rejected. This stops another website from editing deals through a signed-in browser.
- **Data sent to partners:** only live, visible deals with their public fields.
- **Headers:** no-index, no-cache, cannot be embedded in other sites, and no referrer sent to sites partners click through to.

## 8. Tech

- **Hosting:** Cloudflare Pages on the free plan (commercial use is allowed). Static HTML plus one server-side handler. No framework and no build step.
- **Storage:** Cloudflare D1, a SQLite database with strong consistency.
  - Tables: `deals`, `events` (visits and clicks), `changes` (history).
  - The database sets itself up and loads the starting deals on first use, so no manual database setup is needed.
- **Free tier:** far beyond what this needs, roughly 5M rows read and 100K rows written per day.
- **Record keeping:** visits and history are kept indefinitely. Export at any time.

## 9. Configuration (Cloudflare Pages > Settings)

| Name | Type | Value |
|---|---|---|
| `DEALS_PASSWORD` | secret | partner password |
| `ADMIN_PASSWORD` | secret | admin password |
| `COOKIE_SECRET` | secret | long random string |
| `CONTACT_EMAIL` | text | default `elen@prophet.partners` |
| `CONTACT_PHONE` | text | default `+19292592077` |
| `CONTACT_WHATSAPP` | text | defaults to the phone number |
| `BOOKING_URL` | text | e.g. a Calendly link. Leave empty to hide "book a call". |
| `DB` | D1 binding | database `deals-db` |

## 10. Out of scope for v1

- Per-partner links and logins, and different fees for brokers and buyers
- Deal pipeline (IOIs, documents, closing). Rainmaker's system stays the record for that.
- Matching buyers to supply, structured buy criteria, and numeric price fields (buy criteria are free-text notes for v1)
- Data room, NDAs, uploads
- The daily email/call scan and the Friday partner email (phase 2, see section 6)

## 11. Open items

1. Exact footer disclosure text from prophet.partners, to replace the draft.
2. Booking link, if you want "book a call".
3. Is the WhatsApp number the same as the phone number (+1 929 259 2077)?
4. Rainmaker sign-off before the link goes out.
