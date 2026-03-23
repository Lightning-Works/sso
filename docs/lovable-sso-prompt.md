# LightningWorks SSO Integration — Prompt for Lovable

## Overview

This app (Kinet.ink) uses an external SSO system for authentication. Users do NOT create accounts within this app — they authenticate via the LightningWorks SSO portal, which redirects back to this app with a JWT token. The app then uses that token to identify the user and load their profile.

**SSO Portal URL:** `https://sso.lightningworks.io`
**SSO Verify API:** `https://sso.lightningworks.io/api/verify`

## Authentication Flow

### 1. Login Redirect

When a user clicks "Sign In" in the Kinet.ink app, redirect them to the SSO portal with a `redirect` query parameter pointing back to this app:

```
https://sso.lightningworks.io/login?app=kinetink&redirect=https://app.kinet.ink/auth/callback
```

- `app=kinetink` — tells the SSO portal to show Kinet.ink branding (logo, side character)
- `redirect=<url>` — where the SSO portal sends the user after successful login

### 2. Callback Handling

After the user authenticates, the SSO portal redirects back to the app's callback URL with a token in the URL hash fragment:

```
https://app.kinet.ink/auth/callback#access_token=<JWT>&refresh_token=<TOKEN>&...
```

The callback page should:
1. Extract the `access_token` from the URL hash
2. Store it in localStorage (key: `lw_sso_token`)
3. Call the verify API to get user profile data
4. Store the user profile in app state
5. Redirect to the main app page

### 3. Token Verification

To verify a token and get user data, POST to the SSO verify endpoint:

```
POST https://sso.lightningworks.io/api/verify
Content-Type: application/json

{
  "token": "<the JWT access_token>"
}
```

**Success response (200):**
```json
{
  "valid": true,
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "username": "gamertag",
    "display_name": "Cool Gamer",
    "role": "user",
    "avatar_url": "https://...signed-url-to-avatar-image...",
    "avatar_outer_color": "#ff6600",
    "avatar_inner_color": "#3366ff",
    "avatar_pan_x": 0.5,
    "avatar_pan_y": 0.5,
    "avatar_zoom": 1.0,
    "created_at": "2025-01-15T10:30:00Z",
    "last_sign_in": "2026-03-21T14:00:00Z"
  }
}
```

**Error response (401):**
```json
{
  "error": "Invalid token"
}
```

## User Profile Mapping

Map these SSO fields to the local user display:

| SSO Field | Usage |
|-----------|-------|
| `id` | Unique user identifier (UUID). Use as the primary key for any local user data. |
| `username` | The user's handle/gamertag. Display as `@username`. |
| `display_name` | The user's chosen display name. Show this as their visible name. |
| `email` | User's email. Typically not displayed publicly. |
| `role` | One of: `user`, `admin`, `superadmin`. Can be used for feature gating. |
| `avatar_url` | URL to the user's avatar image (can be JPEG, PNG, WebP, GIF, or MP4 video). Signed URL valid for 7 days. |
| `avatar_outer_color` | Hex color for the outer ring around the avatar circle. |
| `avatar_inner_color` | Hex color for the inner ring around the avatar circle. |
| `avatar_pan_x` | Horizontal pan offset (0.0 to 1.0, default 0.5 = centered). |
| `avatar_pan_y` | Vertical pan offset (0.0 to 1.0, default 0.5 = centered). |
| `avatar_zoom` | Zoom level (0.5 to 4.0, default 1.0). |

## Rendering the User Avatar

The avatar is displayed as a circle with two decorative rings. Here's how to render it:

```tsx
function UserAvatar({ user, size = 48 }: { user: SSOUser; size?: number }) {
  const ringThickness = Math.max(2, Math.round(size * 0.03))
  const gapThickness = Math.max(1, Math.round(size * 0.01))
  const totalInset = ringThickness + gapThickness + ringThickness
  const imageSize = size - totalInset * 2
  const isVideo = user.avatar_url?.endsWith('.mp4')
  const imgTransform = `scale(${user.avatar_zoom}) translate(${(user.avatar_pan_x - 0.5) * -100}%, ${(user.avatar_pan_y - 0.5) * -100}%)`

  return (
    <div style={{ width: size, height: size, borderRadius: '50%', position: 'relative' }}>
      {/* Outer ring */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: user.avatar_outer_color }} />
      {/* Gap */}
      <div style={{ position: 'absolute', top: ringThickness, left: ringThickness, right: ringThickness, bottom: ringThickness, borderRadius: '50%', backgroundColor: '#000' }} />
      {/* Inner ring */}
      <div style={{ position: 'absolute', top: ringThickness + gapThickness, left: ringThickness + gapThickness, right: ringThickness + gapThickness, bottom: ringThickness + gapThickness, borderRadius: '50%', backgroundColor: user.avatar_inner_color }} />
      {/* Image */}
      <div style={{
        position: 'absolute', top: totalInset, left: totalInset,
        width: imageSize, height: imageSize, borderRadius: '50%',
        overflow: 'hidden', backgroundColor: '#1a1a1c',
      }}>
        {user.avatar_url ? (
          isVideo ? (
            <video
              src={user.avatar_url}
              autoPlay loop muted playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: imgTransform, transformOrigin: 'center center', pointerEvents: 'none' }}
            />
          ) : (
            <img
              src={user.avatar_url}
              alt={user.display_name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: imgTransform, transformOrigin: 'center center', pointerEvents: 'none' }}
            />
          )
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a7572', fontSize: size * 0.3 }}>
            {user.display_name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
      </div>
    </div>
  )
}
```

## Session Management

- **On app load:** Check localStorage for `lw_sso_token`. If found, call `/api/verify` to validate it. If valid, the user is logged in. If invalid (401), clear the token and show the login button.
- **On logout:** Clear `lw_sso_token` from localStorage and reset user state. Do NOT redirect to the SSO portal — just return to the app's logged-out state.
- **Token refresh:** Tokens expire after a period. If a verify call returns 401, clear the stored token and prompt the user to sign in again.

## TypeScript Interface

```typescript
interface SSOUser {
  id: string
  email: string
  username: string
  display_name: string
  role: 'user' | 'admin' | 'superadmin'
  avatar_url: string | null
  avatar_outer_color: string
  avatar_inner_color: string
  avatar_pan_x: number
  avatar_pan_y: number
  avatar_zoom: number
  created_at: string
  last_sign_in: string
}
```

## Important Notes

- This app does NOT have its own signup/login forms. All authentication is handled by the external SSO portal.
- Do NOT use Supabase Auth directly in this app. Auth is managed entirely through the SSO portal's verify API.
- The avatar signed URL is valid for 7 days. Cache the user profile but re-verify periodically.
- CORS: The SSO verify API accepts requests from `https://app.kinet.ink`. During development, also from `http://localhost:*`.
