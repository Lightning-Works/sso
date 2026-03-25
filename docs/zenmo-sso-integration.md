# Zenmo Yoga Website — LightningWorks SSO Integration Guide

## Overview

Zenmo uses the LightningWorks SSO portal for user authentication. This is a clean, auth-only integration — no game characters, no wallets, no NFTs, no chat widgets. Users sign in via the SSO and get redirected back to Zenmo with a JWT token.

**SSO Portal URL:** `https://sso.lightningworks.io` (currently `http://localhost:3000` during development)

## Step 1: Register Zenmo in the SSO Admin Panel

In the SSO admin panel (`/admin`):

1. Go to the **Companies** tab and either use the existing company or create a new one for Zenmo
2. Go to the **Apps** tab and click **+ Add App**:
   - **App Name:** `Zenmo`
   - **Slug:** `zenmo` (this is what goes in the login URL)
   - **Company:** Select the company
   - **App Logo:** Upload the Zenmo logo (will appear in the login panel)
   - **Do NOT upload a Side Image** — this is what keeps the character/chat from appearing
   - **Leave both API keys empty** — no chat widget needed
3. Save

The SSO login page at `/login?app=zenmo` will now show:
- The company logo at the top
- The Zenmo app logo inside the panel
- All login methods (email/password, Google, Discord, X, Apple, WAX)
- **No character on the side** (because no side image was configured)
- **No chat bubble** (because no chat API key was configured)

## Step 2: Authentication Flow

### How it works:

```
User clicks "Sign In" on zenmo.com
        │
        ▼
Redirect to: https://sso.lightningworks.io/login?app=zenmo&redirect=https://zenmo.com/auth/callback
        │
        ▼
User authenticates (any method — email, Google, Discord, etc.)
        │
        ▼
SSO redirects to: https://zenmo.com/auth/callback#access_token=JWT&refresh_token=TOKEN&token_type=bearer
        │
        ▼
Zenmo extracts the access_token from the URL hash
        │
        ▼
Zenmo calls POST https://sso.lightningworks.io/api/verify with the token
        │
        ▼
SSO returns the user profile
        │
        ▼
Zenmo creates a session for the user
```

### URL Parameters for the Login Redirect:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `app` | Yes | App slug — `zenmo` |
| `redirect` | Yes | Full URL where the SSO sends the user after login |
| `company` | No | Alternative to `app` — loads company branding only, no app-specific branding |

### Login URL Example:

```
https://sso.lightningworks.io/login?app=zenmo&redirect=https://zenmo.com/auth/callback
```

For development:
```
http://localhost:3000/login?app=zenmo&redirect=http://localhost:ZENMO_PORT/auth/callback
```

## Step 3: Callback Page

The SSO redirects back with tokens in the **URL hash fragment** (`#access_token=...`), NOT query parameters. Hash fragments are only accessible in JavaScript, not server-side. You need a callback page that:

1. Reads the hash fragment with JavaScript
2. Sends the token to your server
3. Your server verifies it with the SSO API
4. Creates a session

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
        window.location.href = '/dashboard';  // or wherever logged-in users go
      } else {
        window.location.href = '/login?error=auth_failed';
      }
    });
  } else {
    window.location.href = '/login?error=no_token';
  }
</script>
```

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
    "last_sign_in": "2026-03-24T14:00:00Z"
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

| Field | Description |
|-------|-------------|
| `id` | Unique UUID — use as primary key for local user data |
| `email` | User's email address |
| `username` | Handle/gamertag (may be empty if not set) |
| `display_name` | Display name (falls back to OAuth provider name) |
| `role` | `user`, `admin`, or `superadmin` — use for access control |
| `avatar_url` | Profile image URL (signed URL valid 7 days, or OAuth provider avatar) |
| `avatar_outer_color` | Hex color for avatar outer ring (for CIC display) |
| `avatar_inner_color` | Hex color for avatar inner ring |

### Fields You Can Ignore for Zenmo:

- `avatar_pan_x`, `avatar_pan_y`, `avatar_zoom` — these are for the gaming avatar circle rendering, probably not needed for a yoga site
- `avatar_outer_color`, `avatar_inner_color` — same, unless you want to display the dual-ring avatar

## Step 5: Sign In / Sign Out Implementation

### Sign In Button:

```html
<a href="https://sso.lightningworks.io/login?app=zenmo&redirect=https://zenmo.com/auth/callback">
  Sign In
</a>
```

### Sign Out:

Just clear the local session. No need to call the SSO — the SSO session is separate.

```javascript
// Clear your local session (cookies, localStorage, etc.)
// Then redirect to your home page or login page
```

### Check if Logged In:

On page load, check if you have a stored token/session. If the session is expired, redirect to sign in again.

## Step 6: Session Management

After verifying the token, store the user data in your preferred session mechanism:
- **Cookie-based session** (traditional)
- **JWT in localStorage** (SPA)
- **Server-side session** (e.g., Express session, Django session)

The SSO access token expires after about 1 hour (Supabase default). For long sessions:
- Store the user profile data locally after verification
- Don't re-verify on every page load — just check your local session
- When the local session expires, redirect to the SSO login again (the user may still have an active SSO session and get auto-logged in without re-entering credentials)

## What Zenmo Users Will See

When redirected to `sso.lightningworks.io/login?app=zenmo`:

1. **Company logo** at the top (LightningWorks or Zenmo's company)
2. **"Sign in to your account"** subtitle
3. **Zenmo app logo** inside the panel (if uploaded)
4. **Email + password** login form
5. **"or" divider**
6. **OAuth buttons:** Google (full width), Apple + Discord (row), X + Cloud Wallet (row)
7. **Forgot password** and **Create account** links
8. **Terms of Service / Privacy Policy** footer
9. **No character, no chat bubble, no wallet** — clean auth-only experience

## Important Notes

- **The SSO URL must be HTTPS in production** — tokens are in the URL, safe over HTTPS
- **CORS:** The `/api/verify` endpoint accepts requests from any origin (`Access-Control-Allow-Origin: *`)
- **Avatar signed URLs expire after 7 days** — re-verify to get a fresh one if needed
- **Do NOT decode the JWT locally** — always verify server-side via `/api/verify`
- **Users who already have SSO accounts** (from Siege Worlds, etc.) can use the same login — SSO is shared across all apps
- **The `app=zenmo` parameter only affects branding** — it doesn't restrict which users can log in. Any SSO user can authenticate via any app's login page.
