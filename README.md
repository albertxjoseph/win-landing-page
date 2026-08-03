# thewinlist.app — interest-list site

Static site (no build step) + one Vercel serverless function that writes signups to Supabase.

```
index.html        the whole page
styles.css        design tokens + all styling
app.js            multi-step form, validation, reveals
api/join.js       POST /api/join → Supabase   (server-side only)
assets/           wordmark.svg, mark.svg  (from the official brand SVGs)
supabase.sql      run once to create the table
vercel.json       clean URLs, cache + security headers
```

Brand tokens match the app: `#09090A` background, `#F1A10D` gold, `#E8D7C1` cream,
Playfair Display (display) / Raleway (UI) / Bebas Neue (labels).

---

## Where the form answers go

Supabase Postgres, table `interest_signups`. The browser never talks to Supabase —
it posts to `/api/join`, which validates server-side and writes using the
**service-role key** held in a Vercel environment variable.

RLS is enabled with **no policies**, so the public anon key can neither read nor
write the table. Only the serverless function and you (in the dashboard) can.

### Setup — about 5 minutes

**1. Create the project**
[supabase.com](https://supabase.com) → New project. Save the database password
somewhere; you won't need it for this, but you will later.

**2. Create the table**
Supabase → **SQL Editor** → New query → paste all of `supabase.sql` → **Run**.

**3. Copy the two values**
Supabase → **Project Settings → API**:
- Project URL — `https://xxxxxxxx.supabase.co`
- **service_role** key (under Project API keys — click reveal). This one is secret.
  Never put it in `index.html` or any client-side file.

**4. Add them to Vercel**
Vercel → your project → **Settings → Environment Variables**. Add both for
Production, Preview and Development:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://xxxxxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key |

**5. Redeploy**
Vercel → Deployments → ⋯ on the latest → Redeploy. Env vars only apply to builds
made after they were added.

Until steps 3–5 are done the form returns a clear "not connected yet" message
rather than silently losing an answer.

### Reading the responses

- **Supabase → Table Editor → `interest_signups`** — spreadsheet view, sortable.
- **Export CSV** — the "…" menu above the table.
- **Which city to open first** — `select * from signups_by_city;` in the SQL Editor
  (view created by `supabase.sql`).
- **Today's signups** — `select * from interest_signups order by created_at desc limit 50;`

### What gets stored

`role` (builder/mentor) · `full_name` · `email` · `phone` · `city` · `field` ·
`focus` · `link` · `goals[]` · `referral` · `notes` · `consent` · `created_at` ·
`updated_at` · `source` · `user_agent`

A repeat submission with the same email **updates** the existing row instead of
creating a duplicate, so someone can resubmit to fix a typo.

### Spam handling

- Hidden honeypot field (`company`) — filled means bot; the API returns 200 so it
  doesn't retry, and nothing is written.
- Every field is re-validated server-side; the client checks are only for UX.
- Per-instance rate limit of 8 requests/minute per IP.
- Unique index on email prevents duplicate flooding from one address.

---

## Running it locally

Any static server works for the page itself. `/api/join` needs the Vercel CLI:

```bash
npx vercel dev
```

Add the same two env vars to a local `.env` file (never commit it) if you want to
test real writes.

---

## Deploying

The Vercel project already points at this repo, so pushing to `main` deploys to
thewinlist.app. There is no build step — Vercel serves the static files and turns
`api/join.js` into a Node function automatically.

---

## Before you send traffic to it

- [ ] Supabase env vars added in Vercel and redeployed (steps 3–5 above)
- [ ] Submit a real test entry and confirm the row lands in the Table Editor
- [ ] Make sure `support@thewinlist.app` is a mailbox you actually read — it's the
      fallback in the form's error copy (`app.js`)

## Regenerating the link-preview image

`assets/og.png` (1200×630) is rendered from `assets/og.source.html`. To change it,
edit that file and re-render:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --window-size=1200,630 --screenshot=assets/og.png \
  --virtual-time-budget=6000 "file://$PWD/assets/og.source.html"
```
