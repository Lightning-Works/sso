# Adding Lightningworks SSO to Dreadroot — Guide for the Dreadroot Claude

You're being given this by Geoff, who runs the SSO service. Geoff does **not**
remember the integration steps, so part of your job is to **walk him through the
manual step he has to do on the SSO side** (he can't do it from the Dreadroot
codebase — it happens in the SSO admin panel). Do that conversationally as you
go; don't just dump this file at him.

There is a clean split of work:

- **Geoff does (SSO side, manual, all in the admin panel):** register the
  Dreadroot app — which now includes adding Dreadroot's domain to the app's
  **Allowed Redirect Origins** — and upload branding assets / set theme.
- **You do (Dreadroot side, code):** redirect to the login URL, capture the
  returned tokens, verify them.

Start by telling Geoff Step 1 (the admin-panel setup only he can do), then
implement the Dreadroot code, then help him with branding.

---

## How the flow works (so you understand what you're building)

1. Dreadroot sends the user to the SSO login page with `?app=dreadroot&redirect=<dreadroot-url>`.
2. User logs in there (email/password, Google, Discord, or wallet — all handled by SSO).
3. SSO redirects back to your `redirect` URL with tokens in the **URL hash fragment**:
   `https://dreadroot.com/auth/callback#access_token=...&refresh_token=...&token_type=bearer`
4. Dreadroot grabs `access_token` from the fragment and POSTs it to the SSO
   `/api/verify` endpoint to get the verified user profile.
5. Dreadroot creates its own session from that profile.

It's a token-handoff model (not OIDC). No client secret is required — validation
is done by calling `/api/verify`.

---

## STEP 1 — Tell Geoff: register Dreadroot in the SSO admin panel (HE does this)

This is now a **single admin-panel task** — no server env vars, no redeploy.

He logs into the SSO admin panel (superadmin) at the SSO site's `/admin` page →
**Apps** tab → **+ New App**, and fills in:

- **App Name:** `Dreadroot`
- **Slug:** `dreadroot` ← this is the value Dreadroot passes as `?app=dreadroot`.
  Confirm the exact slug with him; everything below assumes `dreadroot`.
- **Company:** pick an existing company or create one.
- **Allowed Redirect Origins:** (this is the important one for login to work)
  one origin per line — the domains the SSO is allowed to hand tokens back to:

  ```
  https://dreadroot.com
  https://*.dreadroot.com
  ```

  Use `https://app.example.com` for an exact site, `https://*.example.com` for
  any subdomain. `http://localhost:<port>` is always allowed automatically, so
  you can develop locally before the production domain is set. Give Geoff the
  exact Dreadroot production **and** any staging domains so he adds them all.
- Optionally upload the App Logo / App Side Image now (or later, in the
  branding step).

Then **Save**. That's it — the moment it's saved, logins for `?app=dreadroot`
will redirect back to those origins. No redeploy, no env editing.

Also ask him to confirm the **SSO base URL** (the domain the admin panel/login
lives on — likely something under `lightningworks.io`). Call it `<SSO_BASE_URL>`
for the rest of this guide. You need the real value to write the Dreadroot code.

> If a login "works" but the user lands back on the SSO login page instead of
> returning to Dreadroot, the redirect domain isn't in that app's **Allowed
> Redirect Origins** — point Geoff back to this step. (Behind the scenes there's
> also a global env fallback list for legacy integrations, but Dreadroot should
> use its own per-app list — it's self-service and needs no redeploy.)

---

## STEP 2 — Implement the Dreadroot code (YOU do this)

### 2a. Send the user to login

When the user clicks "Log in", redirect the browser to:

```
<SSO_BASE_URL>/login?app=dreadroot&redirect=<URL-ENCODED dreadroot callback URL>
```

Example callback target: `https://dreadroot.com/auth/callback`

```js
const SSO_BASE = "<SSO_BASE_URL>";              // confirm with Geoff
const callback = "https://dreadroot.com/auth/callback";
window.location.href =
  `${SSO_BASE}/login?app=dreadroot&redirect=${encodeURIComponent(callback)}`;
```

Notes:
- The `app=dreadroot` param does two things: loads Dreadroot's branding **and**
  selects the Allowed Redirect Origins list the `redirect` is checked against.
  Always send it.
- The `redirect` origin **must** be in that app's Allowed Redirect Origins
  (Step 1). For local dev, `http://localhost:<port>/auth/callback` always works.

### 2b. Capture the tokens on the callback page

SSO returns to `redirect` with tokens in the **hash fragment** (after `#`), not
the query string. Server frameworks don't see the fragment, so read it
client-side:

```js
// On https://dreadroot.com/auth/callback
const params = new URLSearchParams(window.location.hash.slice(1));
const accessToken  = params.get("access_token");
const refreshToken = params.get("refresh_token");   // store if you want refresh support
// Clear the fragment from the URL bar so tokens aren't left in history:
history.replaceState(null, "", window.location.pathname);
```

### 2c. Verify the token and get the user profile

POST the access token to the SSO verify endpoint. Prefer doing this from
Dreadroot's **server** (keeps it out of client trust), though CORS is open so
the browser can call it too.

```
POST <SSO_BASE_URL>/api/verify
Content-Type: application/json

{ "token": "<accessToken>" }
```

- **200** → `{ "valid": true, "user": { ... } }`
- **401** → `{ "error": "Invalid token" }` (reject the login)

The `user` object contains:

| Field | Notes |
|---|---|
| `id` | Stable Supabase user UUID — use this as the Dreadroot account key |
| `email` | |
| `username` | login/handle |
| `display_name` | shown name |
| `role` | `user` / admin role string |
| `avatar_url` | resolved URL (signed, ~7-day expiry) or null |
| `avatar_outer_color`, `avatar_inner_color` | hex, for avatar ring/fallback |
| `avatar_pan_x`, `avatar_pan_y`, `avatar_zoom` | avatar framing values |
| `created_at`, `last_sign_in` | timestamps |

Use `user.id` as the primary key when creating/looking up the Dreadroot account.
Then create Dreadroot's own session (cookie/JWT) — SSO's job ends at verify.

That's the whole integration: redirect out → catch fragment → verify → create
local session.

---

## STEP 3 — Branding / theming customization

Dreadroot's branding shows on the SSO **login page** when `?app=dreadroot` is
present. There are two layers:

### 3a. Images (Geoff uploads these in the admin panel)

In the Apps tab, editing the Dreadroot app:
- **App Logo** — shown in the login panel header (aim ~75px tall).
- **App Side Image** — character/art shown beside the login form (aim ~200px tall).

These are uploads; only Geoff can do them from the admin panel.

### 3b. Theme colors/fonts

Stored as a JSON `theme` on the Dreadroot app record (set in the admin panel's
theme editor). Every field is optional; anything omitted falls back to the SSO
default (dark UI, purple `#6a24fa` accent, Open Sans).

Resolution order, highest priority first:
1. URL query params on the login link (per-request override)
2. The app's saved `theme` (recommended for Dreadroot — set once)
3. The parent company's `theme`
4. Built-in defaults

Customizable fields:

| Field | Purpose |
|---|---|
| `primary_color` | buttons, links, accents |
| `primary_hover_color` | button hover |
| `bg_color` | page background |
| `panel_bg_color` | login panel background (supports rgba) |
| `text_color` | primary text |
| `text_secondary_color` | muted text |
| `input_bg_color` | form input background |
| `input_text_color` | form input text |
| `divider_color` | divider lines |
| `border_radius` | corner radius, e.g. `8px` |
| `font_family` | e.g. `'Cinzel', serif` |
| `font_size` | base size, e.g. `16px` |

**Recommended:** have Geoff set Dreadroot's palette once in the admin theme
editor so the link stays clean.

**Quick override option (no admin needed):** you can also pass theme fields as
URL params on the login link, URL-encoding `#`. Useful for testing a palette:

```
<SSO_BASE_URL>/login?app=dreadroot&redirect=...&primary_color=%23A35B4E&bg_color=%23120d0d
```

---

## What you need from Geoff before coding

Ask him for these up front:

1. **SSO base URL** (e.g. `https://sso.lightningworks.io` — confirm exact).
2. **Confirmation the app is registered** and the exact **slug** (assumed `dreadroot`).
3. **Confirmation Dreadroot's domain(s) are in the app's Allowed Redirect
   Origins** (Step 1) — production and any staging domain.
4. Dreadroot's production + dev **callback URLs** so he adds the right origins.
5. The **branding** he wants (logo, side image, colors) — relay/set per Step 3.

If 2 or 3 aren't done, login will fail in the specific way noted in Step 1
(user bounced back to the SSO login page) — point him back to Step 1.
