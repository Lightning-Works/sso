# Starblind Metaverse — embed spec (for the game build)

The Alien Worlds Wallet (AWW, at `https://sso.lightningworks.io/aw`) has an
**"ENTER THE METAVERSE"** button that opens the Starblind Metaverse game in a
**fullscreen iframe overlay**. This doc tells the game side what to implement so
it loads and knows who's playing. It follows the same pattern the SSO already uses
for the character-chat embed and the DreadRoot / Siege Worlds shared-DB model.

## 1. Delivery = your own hosted web app, loaded in an iframe
- Ship the game as a normal web app at a stable HTTPS origin (CF Pages is what
  DreadRoot/SWU use). The AWW loads that origin in an `<iframe>` — you do **not**
  build inside this repo.
- Tell us the exact origin; we set it as `NEXT_PUBLIC_METAVERSE_URL` on the AWW
  (currently a placeholder `https://starblind.io`).

## 2. Allow being framed (critical — or it renders blank)
Your host must permit embedding by the wallet's origin. Send this response header
on the game's HTML document:

```
Content-Security-Policy: frame-ancestors https://sso.lightningworks.io http://localhost:3000
```

- Do **NOT** send `X-Frame-Options: DENY` or `SAMEORIGIN` — either blocks the iframe.
- Include `http://localhost:3000` (and any preview origin) for local dev.

## 3. Identity handshake (postMessage — no data in the URL)
The wallet knows the signed-in user (SSO email) and their linked WAX account. It
passes this over `postMessage`, never in the URL (email is personal data).

**Wallet → game.** On iframe load, and whenever you ask, the wallet posts to your
exact origin:
```js
{ type: 'lw-identity', app: 'alien-worlds-wallet', wax: '<wax_account|null>', email: '<sso_email|null>' }
```

**Game → wallet.** From inside the iframe:
```js
// ask for identity (e.g. if you loaded before the wallet posted it)
parent.postMessage({ type: 'lw-request-identity' }, 'https://sso.lightningworks.io')
// ask the wallet to close the overlay (e.g. an in-game "Exit" button)
parent.postMessage({ type: 'lw-close' }, 'https://sso.lightningworks.io')
```

Security: only trust a message whose `event.origin === 'https://sso.lightningworks.io'`
(exact match, never a substring test). The wallet does the same for your origin.

## 4. Player data — reuse the shared Supabase (DreadRoot/SWU/Pinkland pattern)
DreadRoot, Siege Worlds and Pinkland all share **one** Supabase and distinguish
titles with a `game` column. Starblind should do the same so a player's identity
carries across:
- Key the player by the **SSO user** (the email/SSO id from the handshake), not by
  a per-game login. That's the cross-app anchor.
- Use a `game` value of `'starblind'` on shared tables.
- The WAX account from the handshake lets the game read the player's Alien Worlds
  NFTs (AtomicAssets API) if you want to use their tools/land/crew in-game.

## 5. Sizing & controls
- The iframe is 100% width/height of a fullscreen overlay; the AWW draws its own
  "✕ Close" button (top-right) and also closes on your `lw-close` message.
- The iframe is granted: `fullscreen; gamepad; microphone; autoplay;
  xr-spatial-tracking; clipboard-write`. Pointer Lock (for FPS controls like
  DreadRoot/SWU) works inside the frame after a user click — no extra allow token
  needed, but it requires user activation, so lock on click, not on load.
- Request fullscreen from a user gesture if you want true fullscreen (allowed).

## 6. Checklist for the game agent
1. Host the game at an HTTPS origin; send `frame-ancestors` for
   `https://sso.lightningworks.io` (+ localhost for dev).
2. Listen for `message` events; accept only `origin === https://sso.lightningworks.io`.
3. On load, `postMessage({type:'lw-request-identity'}, 'https://sso.lightningworks.io')`;
   handle the `lw-identity` reply (wax + email).
4. Key player state by the SSO identity in the shared Supabase with `game='starblind'`.
5. Optionally send `{type:'lw-close'}` for an in-game exit button.
6. Give us the final origin so we set `NEXT_PUBLIC_METAVERSE_URL`.

The AWW side of all of this is already implemented in `src/app/aw/AwwApp.tsx`
(the overlay, the `lw-identity` post on load, and the `lw-request-identity` /
`lw-close` listeners).
