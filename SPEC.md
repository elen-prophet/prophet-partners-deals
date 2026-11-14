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
| Company note | yes | One note per company, shown above all of that company's deals (e.g. "raising at $28.8B"). Written once, applies to every deal for that company. |
| Received | yes | Date the deal came in. This drives the age indicator. |
| Highlight | yes | Pins the deal to the top as a card |
| Hidden | no | The deal is kept in the sheet but not shown to partners |
| Source | **never** | Who sent it: person, firm, thread |
| Internal notes | **never** | Anything private |
| Archived | no | Archived deals disappear from the page. They can be restored. |

Private fields are removed on the server. They are never sent to a partner's browser in any form.

## 4. Partner page

- **Two tabs:** "available" (supply) and "buyers looking for" (demand), plus sector filters and search.
- **Highlighted** deals appear first, as black cards.
- **Deals grouped by company**, so Shield AI's three offers sit together. The company note appears under the company name.
- **Age indicator on every deal**, measured in days since received (New York time):

  | Age | Display |
  |---|---|
  | 0 to 7 days | black marker, "received 3d ago" |
  | 8 to 21 days | red marker, "check availability" |
  | over 21 days | greyed out, "may be inactive" |

  Nothing hides automatically. Archiving is Elen's call.
- **Contact options:**
  - **On every deal:** **email** and **WhatsApp** buttons, each pre-filled with the deal's details.
  - **In the header:** **email**, **call**, **WhatsApp** and **book a call**. "Book a call" only appears once a booking link is set.
  - **Tracking:** every click is logged, so Elen sees which deals draw interest.
- **Footer:** the full Rainmaker / prophet.partners disclosure.
- **Not indexed** by search engines.

## 5. Admin (the spreadsheet)

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

## 5b. CRM (private, admin only)

The CRM is deliberately lightweight. It lives in the same database as the deals, and **nothing in it is ever sent to the partner page**.

**Who goes in:** only people tied to a deal, or people Elen adds herself. The agent will never add everyone from the inbox.

| Record | Fields |
|---|---|
| **Contact** | name, firm, type (buyer, seller, broker, sponsor, other), email, phone, WhatsApp, notes / buy criteria (free text), follow-up date and note, last contact (automatic, from the timeline), number of deals |
| **Deal link** | contact ↔ deal, with a role: brought it to me, co-broker, sent it to, interested, passed, or IOI (with an amount). One role per person per deal, and the role can be changed. |
| **Timeline entry** | date, channel (email, call, meeting, WhatsApp, note), summary, optional deal, link to the source (Gmail thread or Granola note), added by Elen or by the agent |

**Admin screens**
- **Contacts tab:** a spreadsheet of people. Click to edit. Rows are sorted by follow-up date, and due follow-ups show in red. Archive, restore or delete.
- **Deal panel:** click a deal's age (›) to see who is on the deal and in what role. You can add someone already in your contacts, or create a new contact on the spot, and log timeline entries.
- **Contact panel:** click › on a contact to see:
  - quick email, call and WhatsApp links
  - follow-up and notes
  - every deal they're on, with their role
  - their full timeline
- **Exports:** deals CSV and contacts CSV, including each contact's deal list.
- **History:** every CRM change is logged.

**Agent (phase 2):** the agent writes contacts, links and timeline entries through the same functions, marked "agent". New deals it finds arrive hidden, for Elen to review.

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
