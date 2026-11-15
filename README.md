# deals.prophet.partners

A private deal sheet for partners, with a spreadsheet-style admin behind it. See `SPEC.md` for the full spec.

| Address | Who | What |
|---|---|---|
| `deals.prophet.partners` | Partners (shared password) | The deal sheet |
| `deals.prophet.partners/admin/` | You (admin password, any username) | Deals spreadsheet, contacts (CRM), deal and contact panels with timelines, history, CSV exports |
| `deals.prophet.partners/admin/stats` | You | Visitors and contact clicks |

```
public/index.html          partner page
public/admin/index.html    admin spreadsheet (served only after the admin password)
functions/_middleware.js   passwords, security checks, API routes, stats
lib/db.js                  database: deals, events, history, and the filter that keeps private fields from partners
lib/crm.js                 CRM: contacts, deal links, timeline (admin only)
data/seed.json             starting deals, loaded automatically the first time the site runs
SPEC.md                    v1 spec
```

## Deploy (one time, about 15 minutes)

1. **Create a private GitHub repo** called `prophet-partners-deals` and upload these files.
2. **Create the database.** In Cloudflare, go to **Storage & Databases > D1 > Create** and name it `deals-db`. You don't need to run any setup commands: the site creates its tables and loads the starting deals by itself.
3. **Create the site.** Go to **Workers & Pages > Create > Pages > Connect to Git**, pick the repo, leave the build command empty, and set the output directory to `public`.
4. **Connect the database.** In the project, go to **Settings > Bindings > Add > D1 database**. Set the variable name to **`DB`** and pick `deals-db`.
5. **Add your settings.** Go to **Settings > Variables and secrets**:
   - Secrets: `DEALS_PASSWORD`, `ADMIN_PASSWORD`, `COOKIE_SECRET` (any long random string)
   - Optional plain text: `BOOKING_URL` (e.g. your Calendly link), `CONTACT_EMAIL`, `CONTACT_PHONE`. Defaults: elen@prophet.partners and +1 929 259 2077.
   - Request form: `FORMSPREE_ID` (default `xdavpopa`, the main site form) and `PUBLIC_URL` (default: the site's own address, e.g. https://deals.prophet.partners). Both are optional.
   - Optional "are you human" check (Cloudflare Turnstile, free): `TURNSTILE_SITEKEY` (text) and `TURNSTILE_SECRET` (secret). The form works without them, using the honeypot and rate limit.
6. **Redeploy.** Go to Deployments > ... > Retry deployment.
7. **Add the domain.** Go to Custom domains > `deals.prophet.partners`.
8. **Check it:**
   - Open the site, sign in, and check the deals load.
   - Open `/admin/`, edit a cell, and check the change shows on the partner page.

## Everyday use

- **Add a deal:** click **+ add deal** and type into the new row. Each cell saves when you leave it.
- **Old deals:** click **select 21d+**, then **archive**.
- **A deal is re-sent:** select it and click **mark received today**.
- **Keep a deal in the sheet but off the page:** tick **hide**.
- **Change the partner password:** update `DEALS_PASSWORD`. Everyone is signed out.
- **Records:** use **export csv** whenever you need a copy for yourself or Rainmaker.

## Security

- **Logins:** partner sessions are signed and last 30 days. Changing the partner password ends them all. After 10 wrong passwords from one IP, logins from it are blocked for 15 minutes.
- **Forged requests:** changes must come from the site's own pages. Requests from other sites are rejected.
- **Privacy:** partners only ever receive live, visible deals with their public fields. Source and internal notes never leave the server.

## Disclosure

The partner page disclosure is in `public/index.html`, inside `<footer id="disclosure">`. Keep it identical to the prophet.partners footer.

## Local preview

```
npm install
npm run dev     # partner password: test, admin password: adm
```

## Access requests (login page + prophet.partners)

- **The form:** both the login page and the main site's contact form send to `/api/request`.
- **Where requests go:**
  - Each one creates or updates a contact in the CRM with source "website (deal sheet)" or "website (main site)" and access **requested**.
  - The "You are" choice sets the type, and the message is added to Notes.
- **Notification:** Formspree emails you an "Approve" link. It opens `/admin/approve?id=…`, marks the person approved, and opens a ready-to-send welcome email with the link and password.
- **Accredited checkbox:** required for Fund, Syndicate, Family office and Investor, both in the browser and on the server.
- **Spam protection:** a hidden honeypot field, 5 requests per hour per connection, and the optional Turnstile check.
