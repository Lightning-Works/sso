# LightningWorks SSO Integration for Tauri Game Launcher (Rust)

## Overview

The LightningWorks SSO is a centralized authentication system hosted at `https://sso.lightningworks.io` (currently `http://localhost:3000` during development). It handles user authentication via email/password, Google, Discord, X/Twitter, Apple, and WAX Cloud Wallet. It's built on Supabase Auth and issues JWT tokens.

The Tauri game launcher needs to:
1. Let users log in via the SSO (opens a browser window)
2. Receive the JWT token back from the browser
3. Verify the token server-side to get the user's profile
4. Store the token locally for auto-login on future launches
5. Re-verify the stored token on app startup for auto-login

## Authentication Flow for a Desktop App

Desktop apps can't receive redirect URLs like websites do. The standard approach for Tauri is to use a **deep link** (custom protocol) or a **localhost callback server**. Here are both options:

### Option A: Localhost Callback Server (Recommended for Tauri)

1. On login, Tauri starts a tiny HTTP server on a random localhost port (e.g., `http://localhost:PORT/callback`)
2. Open the SSO login URL in the user's default browser:
   ```
   https://sso.lightningworks.io/login?app=siegeworlds&redirect=http://localhost:PORT/callback
   ```
3. User authenticates in the browser
4. SSO redirects the browser to `http://localhost:PORT/callback#access_token=JWT&refresh_token=TOKEN&token_type=bearer`
5. The localhost server receives the request, extracts tokens from the hash fragment (needs a small HTML page that reads the hash and sends it as a query param or POST)
6. Tauri receives the token, shuts down the localhost server
7. Verify the token with the SSO API
8. Store the token securely (Tauri's `tauri-plugin-store` or the OS keychain)

### Option B: Custom Protocol / Deep Link

1. Register a custom protocol like `siegeworlds://` with the OS
2. Open the SSO login URL:
   ```
   https://sso.lightningworks.io/login?app=siegeworlds&redirect=siegeworlds://auth/callback
   ```
3. User authenticates in the browser
4. SSO redirects to `siegeworlds://auth/callback#access_token=JWT&...`
5. The OS routes this to the Tauri app
6. Tauri extracts and verifies the token

**Note:** The SSO currently redirects with tokens in the URL hash fragment (`#access_token=...`), NOT as query parameters. This is important for how you extract them.

### How the SSO Redirect Works

For **email/password login**, the SSO handles the redirect client-side after successful auth:
```
window.location.href = `${redirectUrl}#access_token=${session.access_token}&refresh_token=${session.refresh_token}&token_type=bearer`
```

For **OAuth login** (Google, Discord, etc.), the SSO passes the redirect through the OAuth callback chain:
```
SSO login → OAuth provider → Supabase callback → SSO /auth/callback → your redirect URL with tokens
```

The final redirect URL format is always:
```
YOUR_REDIRECT_URL#access_token=ACCESS_TOKEN&refresh_token=REFRESH_TOKEN&token_type=bearer
```

## Token Verification API

Once you have the `access_token`, verify it and get the user's profile by calling the SSO's verify endpoint:

```
POST https://sso.lightningworks.io/api/verify
Content-Type: application/json

{
  "token": "eyJ...the_access_token_jwt..."
}
```

### Success Response (200)

```json
{
  "valid": true,
  "user": {
    "id": "0f3eb79d-be6d-41d9-9017-dda3df6bca81",
    "email": "user@example.com",
    "username": "gamertag",
    "display_name": "Cool Gamer",
    "role": "user",
    "avatar_url": "https://wemmrhypldubdplaohli.supabase.co/storage/v1/object/sign/user_avatars/...",
    "avatar_outer_color": "#ff0000",
    "avatar_inner_color": "#8800cc",
    "avatar_pan_x": 0.5,
    "avatar_pan_y": 0.5,
    "avatar_zoom": 1.0,
    "created_at": "2025-01-15T10:30:00Z",
    "last_sign_in": "2026-03-22T14:00:00Z"
  }
}
```

### Error Response (401)

```json
{
  "error": "Invalid token"
}
```

### Rust Example (reqwest)

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
struct VerifyResponse {
    valid: bool,
    user: Option<SSOUser>,
    error: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct SSOUser {
    id: String,
    email: String,
    username: String,
    display_name: String,
    role: String,
    avatar_url: Option<String>,
    avatar_outer_color: String,
    avatar_inner_color: String,
    avatar_pan_x: f64,
    avatar_pan_y: f64,
    avatar_zoom: f64,
    created_at: String,
    last_sign_in: Option<String>,
}

async fn verify_token(token: &str) -> Result<SSOUser, String> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://sso.lightningworks.io/api/verify")
        .json(&serde_json::json!({ "token": token }))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if res.status() == 401 {
        return Err("Invalid or expired token".to_string());
    }

    let body: VerifyResponse = res
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    if body.valid {
        body.user.ok_or_else(|| "No user data".to_string())
    } else {
        Err(body.error.unwrap_or_else(|| "Verification failed".to_string()))
    }
}
```

## Auto-Login Flow

On app startup:

```
1. Check local storage for saved access_token
   └─ No token → show "Sign In" button
   └─ Has token → call /api/verify with stored token
       └─ 200 + valid → user is logged in, use the returned profile
       └─ 401 → token expired, clear storage, show "Sign In" button
```

### Token Storage

Store the tokens securely. Options in Tauri:
- **`tauri-plugin-store`** — encrypted JSON store, simple key-value
- **OS Keychain** — via `tauri-plugin-os` or `keyring` crate, most secure
- **File on disk** — least secure, but works. Use the Tauri app data directory.

Store both `access_token` and `refresh_token`. The access token is a JWT that expires (typically 1 hour with Supabase). The refresh token can be used to get a new access token without re-authentication, but that requires calling Supabase directly which adds complexity. For simplicity, just re-verify on startup and re-authenticate when it expires.

## Localhost Callback Server Implementation (Rust)

Here's a sketch for the localhost callback approach in Tauri:

```rust
use std::net::TcpListener;
use std::io::{Read, Write};

/// Start a temporary localhost server, return the port
fn start_auth_server() -> (u16, tokio::sync::oneshot::Receiver<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let (tx, rx) = tokio::sync::oneshot::channel();

    std::thread::spawn(move || {
        // Accept one connection
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 4096];
            let n = stream.read(&mut buf).unwrap_or(0);
            let request = String::from_utf8_lossy(&buf[..n]);

            // Check if it has a token query param (sent by the HTML page below)
            if let Some(token_start) = request.find("token=") {
                let token = &request[token_start + 6..];
                let token = token.split_whitespace().next().unwrap_or("");
                let token = token.split('&').next().unwrap_or(token);
                let _ = tx.send(urlencoding::decode(token).unwrap_or_default().to_string());
            }

            // Respond with a success page
            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n\
                <html><body style='background:#1a112e;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>\
                <div style='text-align:center'><h2>Signed in!</h2><p>You can close this tab and return to the launcher.</p></div>\
                </body></html>";
            let _ = stream.write_all(response.as_bytes());
        }
    });

    (port, rx)
}
```

But there's a catch — the SSO redirects with tokens in the **hash fragment** (`#access_token=...`), which is NOT sent to the server in an HTTP request. The browser keeps the hash client-side. So the localhost server needs to serve an HTML page first that reads the hash and forwards it:

The SSO redirect will hit: `http://localhost:PORT/callback#access_token=XXX&refresh_token=YYY`

The localhost server should respond with this HTML for ANY request to `/callback`:

```html
<!DOCTYPE html>
<html>
<head><title>Signing in...</title></head>
<body style="background:#1a112e;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center"><h2>Signing in...</h2></div>
<script>
  var hash = window.location.hash.substring(1);
  var params = new URLSearchParams(hash);
  var token = params.get('access_token');
  if (token) {
    // Send the token back to our localhost server as a query param
    fetch('/receive-token?token=' + encodeURIComponent(token) + '&refresh=' + encodeURIComponent(params.get('refresh_token') || ''))
      .then(function() {
        document.querySelector('div').innerHTML = '<h2>Signed in!</h2><p>You can close this tab and return to the launcher.</p>';
      });
  } else {
    document.querySelector('div').innerHTML = '<h2>Login failed</h2><p>No token received.</p>';
  }
</script>
</body>
</html>
```

So the flow is:
1. Browser hits `http://localhost:PORT/callback#access_token=XXX`
2. Server responds with the HTML above
3. JavaScript in the browser reads the hash, sends token to `http://localhost:PORT/receive-token?token=XXX`
4. Server receives the token on the `/receive-token` endpoint
5. Server sends it to the Tauri app via the oneshot channel
6. Server shuts down

## User Profile Fields

| Field | Type | Description |
|---|---|---|
| `id` | UUID string | Unique user ID from Supabase Auth |
| `email` | string | User's email |
| `username` | string | Gamertag / handle |
| `display_name` | string | Display name (falls back to OAuth provider name) |
| `role` | string | `user`, `admin`, or `superadmin` |
| `avatar_url` | string or null | URL to avatar image (signed URL valid 7 days, or OAuth provider URL) |
| `avatar_outer_color` | hex string | Outer ring color for the CIC (Character Identity Circle), e.g. `#ff0000` |
| `avatar_inner_color` | hex string | Inner ring color, e.g. `#8800cc` |
| `avatar_pan_x` | float | Avatar horizontal pan (0.0–1.0, 0.5 = centered) |
| `avatar_pan_y` | float | Avatar vertical pan (0.0–1.0, 0.5 = centered) |
| `avatar_zoom` | float | Avatar zoom level (0.5–4.0, 1.0 = default) |
| `created_at` | ISO string | Account creation timestamp |
| `last_sign_in` | ISO string or null | Last sign-in timestamp |

## Rendering the User Avatar (CIC)

The avatar is displayed as a circle with two decorative colored rings:

```
┌─────────────────┐
│  outer ring      │  ← avatar_outer_color
│ ┌─────────────┐ │
│ │  gap (black) │ │
│ │ ┌─────────┐ │ │
│ │ │inner ring│ │ │  ← avatar_inner_color
│ │ │ ┌─────┐ │ │ │
│ │ │ │image │ │ │ │  ← avatar_url with pan/zoom
│ │ │ └─────┘ │ │ │
│ │ └─────────┘ │ │
│ └─────────────┘ │
└─────────────────┘
```

Ring thickness: `max(2, round(diameter * 0.03))`
Gap thickness: `max(1, round(diameter * 0.01))`
Image transform: `scale(zoom) translate((panX-0.5)*-100%, (panY-0.5)*-100%)`

## Important Notes

- **Development URL:** `http://localhost:3000` — change to `https://sso.lightningworks.io` for production
- **The verify endpoint has CORS `*`** so it accepts requests from any origin including desktop apps
- **Avatar signed URLs expire after 7 days.** Re-verify the token to get a fresh URL if needed.
- **Tokens in hash fragment, not query params.** The `#access_token=...` format means you need client-side JavaScript to extract them — a pure server can't read hash fragments from HTTP requests.
- **The `app=siegeworlds` slug** tells the SSO to show Siege Worlds branding on the login page. This is already configured in the SSO admin panel.
- **Do NOT decode or validate the JWT locally.** Always verify via the `/api/verify` endpoint. The SSO handles all token validation server-side.
- **The refresh_token** can technically be used to get a new access_token via Supabase's token refresh endpoint, but for a launcher the simpler approach is: if the access_token is expired (verify returns 401), just ask the user to sign in again.
