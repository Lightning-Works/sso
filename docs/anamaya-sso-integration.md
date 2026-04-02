# AnamayaOS — LightningWorks SSO Integration Guide

## Overview

AnamayaOS uses the LightningWorks SSO portal for user authentication. This is a clean, auth-only integration — no game characters, no wallets, no NFTs, no chat widgets. Users sign in via the SSO and get redirected back to AnamayaOS with a JWT token.

AnamayaOS is for the Anamaya yoga retreat center in Costa Rica (anamaya.com) and is **not related** to LightningWorks comics/games.

**SSO Portal URL:** `https://sso.lightningworks.io` (or `http://localhost:3000` during development)

---

## Step 1: Register AnamayaOS in the SSO Admin Panel

In the SSO admin panel (`/admin`):

1. Go to the **Companies** tab and create a new company:
   - **Name:** `Anamaya`
   - **Logo:** Upload the Anamaya logo
2. Go to the **Apps** tab and click **+ Add App**:
   - **App Name:** `AnamayaOS`
   - **Slug:** `anamaya` (this is what goes in the login URL)
   - **Company:** Select `Anamaya`
   - **App Logo:** Upload the Anamaya logo (will appear in the login panel)
   - **Do NOT upload a Side Image** — keeps the panel clean (no game character)
   - **Leave both API keys empty** — no chat widget needed
3. Save

The SSO login page at `/login?app=anamaya` will now show:
- The Anamaya company logo at the top
- The Anamaya app logo inside the panel
- All login methods (email/password, Google, Discord, Apple, etc.)
- **No character on the side** (because no side image was configured)
- **No chat bubble** (because no chat API key was configured)

---

## Step 2: Authentication Flow

### How it works:

```
User clicks "Sign In" on AnamayaOS
        |
        v
Redirect to: https://sso.lightningworks.io/login?app=anamaya&redirect=https://app.anamaya.com/auth/callback
        |
        v
User authenticates (any method - email, Google, Discord, etc.)
        |
        v
SSO redirects to: https://app.anamaya.com/auth/callback#access_token=JWT&refresh_token=TOKEN&token_type=bearer
        |
        v
AnamayaOS extracts the access_token from the URL hash
        |
        v
AnamayaOS calls POST https://sso.lightningworks.io/api/verify with the token
        |
        v
SSO returns the user profile
        |
        v
AnamayaOS creates a session for the user
```

### URL Parameters for the Login Redirect:

| Parameter  | Required | Description                                                      |
|------------|----------|------------------------------------------------------------------|
| `app`      | Yes      | App slug — `anamaya`                                             |
| `redirect` | Yes      | Full URL where the SSO sends the user after login                |
| `company`  | No       | Alternative to `app` — loads company branding only               |

### Login URL Examples:

**Production:**
```
https://sso.lightningworks.io/login?app=anamaya&redirect=https://app.anamaya.com/auth/callback
```

**Development:**
```
http://localhost:3000/login?app=anamaya&redirect=http://localhost:YOUR_PORT/auth/callback
```

---

## Step 3: Callback Page

The SSO redirects back with tokens in the **URL hash fragment** (`#access_token=...`), NOT query parameters. Hash fragments are only accessible in JavaScript, not server-side.

### Callback Page (HTML/JS):

```html
<!-- /auth/callback page -->
<script>
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (accessToken) {
    // Send to your server for verification
    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        window.location.href = '/dashboard';
      } else {
        window.location.href = '/login?error=auth_failed';
      }
    });
  } else {
    window.location.href = '/login?error=no_token';
  }
</script>
```

---

## Step 4: Token Verification

Your server verifies the token by calling the SSO's verify endpoint:

```
POST https://sso.lightningworks.io/api/verify
Content-Type: application/json

{
  "token": "eyJ...the_access_token..."
}
```

### Success Response (200):

```json
{
  "valid": true,
  "user": {
    "id": "0f3eb79d-be6d-41d9-9017-dda3df6bca81",
    "email": "user@example.com",
    "username": "yogi_jane",
    "display_name": "Jane Smith",
    "role": "user",
    "avatar_url": "https://...signed-url-to-avatar...",
    "avatar_outer_color": "#ff6600",
    "avatar_inner_color": "#3366ff",
    "avatar_pan_x": 0.5,
    "avatar_pan_y": 0.5,
    "avatar_zoom": 1.0,
    "created_at": "2025-01-15T10:30:00Z",
    "last_sign_in": "2026-04-01T14:00:00Z"
  }
}
```

### Error Response (401):

```json
{
  "error": "Invalid token"
}
```

### User Fields You'll Want:

| Field          | Description                                                      |
|----------------|------------------------------------------------------------------|
| `id`           | Unique UUID — use as primary key for local user data             |
| `email`        | User's email address                                             |
| `username`     | Handle (may be empty if not set)                                 |
| `display_name` | Display name (falls back to OAuth provider name)                 |
| `role`         | `user`, `admin`, or `superadmin` — use for access control        |
| `avatar_url`   | Profile image URL (signed URL valid 7 days)                      |

### Fields You Can Ignore for AnamayaOS:

- `avatar_pan_x`, `avatar_pan_y`, `avatar_zoom` — these are for gaming avatar circle rendering, not needed for a retreat center app
- `avatar_outer_color`, `avatar_inner_color` — same, unless you want the dual-ring avatar display

---

## Step 5: Sign In / Sign Out

### Sign In Button:

```html
<a href="https://sso.lightningworks.io/login?app=anamaya&redirect=https://app.anamaya.com/auth/callback"
   class="anamaya-btn">
  Sign In
</a>
```

### Sign Out:

Just clear the local session. No need to call the SSO — the SSO session is separate.

```javascript
// Clear your local session (cookies, localStorage, etc.)
// Then redirect to your home page or login page
```

---

## Step 6: Session Management

After verifying the token, store the user data in your preferred session mechanism:
- **Cookie-based session** (traditional)
- **JWT in localStorage** (SPA)
- **Server-side session**

The SSO access token expires after about 1 hour (Supabase default). For long sessions:
- Store the user profile data locally after verification
- Don't re-verify on every page load — just check your local session
- When the local session expires, redirect to the SSO login again (the user may still have an active SSO session and get auto-logged in)

---

## Step 7: Setting Up the Claude Code Instance

When setting up AnamayaOS in its own Claude Code project, include these instructions in the project's `CLAUDE.md`:

```markdown
# AnamayaOS

## Authentication
This app uses the LightningWorks SSO for authentication.
- SSO Portal: https://sso.lightningworks.io
- SSO Verify API: https://sso.lightningworks.io/api/verify
- App slug: `anamaya`
- Users do NOT create accounts within this app — all auth is handled externally.
- Do NOT build login/signup forms. Auth redirects to the SSO portal.

## Login Flow
1. Redirect to: `https://sso.lightningworks.io/login?app=anamaya&redirect={CALLBACK_URL}`
2. Handle callback: extract `access_token` from URL hash fragment
3. Verify token: POST to `https://sso.lightningworks.io/api/verify`
4. Create local session from verified user profile

## TypeScript Interface
\`\`\`typescript
interface SSOUser {
  id: string
  email: string
  username: string
  display_name: string
  role: 'user' | 'admin' | 'superadmin'
  avatar_url: string | null
  created_at: string
  last_sign_in: string
}
\`\`\`
```

---

## Anamaya Color Palette & Theming

The SSO login page uses its own dark theme by default. The AnamayaOS app itself should use Anamaya's brand colors. Here are the HSB values converted to CSS:

### Color Reference (HSB to Hex/RGB)

| Role                     | HSB              | Hex       | RGB                | CSS Variable Suggestion        |
|--------------------------|------------------|-----------|--------------------|--------------------------------|
| Background               | 0, 0%, 100%     | `#FFFFFF` | `rgb(255,255,255)` | `--ana-bg`                     |
| Buttons (Terra Cotta)    | 9, 52%, 64%     | `#A35B4E` | `rgb(163,91,78)`   | `--ana-btn`                    |
| Button Hover             | 9, 52%, 54%     | `#8A4D42` | `rgb(138,77,66)`   | `--ana-btn-hover`              |
| Dividers (Turquoise)     | 171, 14%, 71%   | `#9CB5B1` | `rgb(156,181,177)` | `--ana-divider`                |
| Dividers (Grey)          | 0, 0%, 50%      | `#808080` | `rgb(128,128,128)` | `--ana-divider-grey`           |
| Headlines (Green)        | 77, 57%, 75%    | `#A0BF52` | `rgb(160,191,82)`  | `--ana-highlight`              |
| Mandala BG (Off-White)   | 72, 4%, 97%     | `#F5F7ED` | `rgb(245,247,237)` | `--ana-bg-subtle`              |

### Suggested CSS Variables for AnamayaOS:

```css
:root {
  /* Anamaya Brand Colors */
  --ana-bg: #FFFFFF;
  --ana-bg-subtle: #F5F7ED;        /* Mandala off-white — use for card/section backgrounds */
  --ana-btn: #A35B4E;              /* Terra Cotta — primary buttons, CTAs */
  --ana-btn-hover: #8A4D42;        /* Darker terra cotta — button hover state */
  --ana-btn-text: #FFFFFF;         /* White text on buttons */
  --ana-highlight: #A0BF52;        /* Green — headline accents, success states, tags */
  --ana-divider: #9CB5B1;          /* Turquoise — dividers, borders, secondary accents */
  --ana-divider-grey: #808080;     /* Grey — secondary dividers, muted borders */
  --ana-text-primary: #333333;     /* Dark text on white backgrounds */
  --ana-text-secondary: #666666;   /* Muted text */
  --ana-text-muted: #808080;       /* Subtle text / labels */

  /* Layout */
  --ana-radius: 5px;               /* Anamaya uses 5px rounded corners */
}
```

### Where to Use Each Color:

| Element                           | Color                         |
|-----------------------------------|-------------------------------|
| Page background                   | `--ana-bg` (white)            |
| Card/section backgrounds          | `--ana-bg-subtle` (off-white) |
| Primary buttons (Book, Sign In)   | `--ana-btn` (terra cotta)     |
| Button hover states               | `--ana-btn-hover`             |
| Section dividers, light borders   | `--ana-divider` (turquoise)   |
| Secondary dividers                | `--ana-divider-grey`          |
| Headline accents, badges, tags    | `--ana-highlight` (green)     |
| Body text                         | `--ana-text-primary`          |
| Labels, captions                  | `--ana-text-secondary`        |
| All border-radius                 | `5px` (not 8px like the SSO)  |

### Example Button Styles:

```css
.anamaya-btn {
  background-color: var(--ana-btn);
  color: var(--ana-btn-text);
  border: none;
  border-radius: var(--ana-radius);
  padding: 0.75rem 1.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.anamaya-btn:hover {
  background-color: var(--ana-btn-hover);
}

.anamaya-divider {
  height: 1px;
  background-color: var(--ana-divider);
}

.anamaya-card {
  background-color: var(--ana-bg-subtle);
  border-radius: var(--ana-radius);
  border: 1px solid var(--ana-divider);
  padding: 1.5rem;
}

.anamaya-headline-accent {
  color: var(--ana-highlight);
  font-weight: 700;
}
```

---

## Important Notes

- **The SSO URL must be HTTPS in production** — tokens are in the URL, safe over HTTPS
- **CORS:** The `/api/verify` endpoint accepts requests from any origin (`Access-Control-Allow-Origin: *`)
- **Avatar signed URLs expire after 7 days** — re-verify to get a fresh one
- **Do NOT decode the JWT locally** — always verify server-side via `/api/verify`
- **Users who already have SSO accounts** (from Siege Worlds, etc.) can use the same login — SSO is shared across all apps
- **The `app=anamaya` parameter only affects branding** — it doesn't restrict which users can log in
- **AnamayaOS is a light-themed app** — the SSO login panel is dark-themed. This contrast is fine since the user leaves AnamayaOS briefly to authenticate, then returns.

---

## Quick Checklist for the Claude Code Instance

1. [ ] Add `CLAUDE.md` with SSO integration instructions (see Step 7 above)
2. [ ] Create `/auth/callback` page to handle the redirect
3. [ ] Implement token verification on your server (call SSO `/api/verify`)
4. [ ] Add session management (store user profile after verification)
5. [ ] Add "Sign In" button that redirects to SSO with `?app=anamaya&redirect=...`
6. [ ] Add "Sign Out" that clears local session
7. [ ] Apply Anamaya color palette CSS variables
8. [ ] Register the `anamaya` app in the SSO admin panel
9. [ ] Test the full flow: Sign In -> SSO -> Authenticate -> Callback -> Dashboard
