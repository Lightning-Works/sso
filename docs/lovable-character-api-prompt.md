# Kinet.ink Character AI Training API — Prompt for Lovable

## Overview

The Kinet.ink app has AI characters that represent games. Each character needs to be trained with game-specific knowledge (lore, mechanics, FAQ, etc.) so it can have informed conversations with users. Game administrators manage this training data from an external admin panel (the LightningWorks SSO portal), which sends it to the Kinet.ink app via a secure API.

This document describes the API endpoints that Kinet.ink must expose to receive character training data, and how to authenticate requests using the LightningWorks SSO JWT system.

## Architecture

```
┌─────────────────────┐         ┌─────────────────────┐         ┌──────────────────┐
│  LW SSO Admin Panel │──POST──▶│   Kinet.ink API     │──POST──▶│  RAG / Vector DB │
│  (Train button)     │         │   /api/characters/  │         │  (embeddings)    │
└─────────────────────┘         │   train             │         └──────────────────┘
         │                      └────────┬────────────┘
         │                               │ verify JWT
         │                      ┌────────▼────────────┐
         └──────────────────────│  LW SSO /api/verify  │
                                └─────────────────────┘
```

## Authentication

All training API requests are authenticated using JWT tokens from the LightningWorks SSO system. The token is sent in the `Authorization` header as a Bearer token.

**To verify a request:**

1. Extract the Bearer token from the `Authorization` header
2. Call the SSO verify endpoint to validate the token and get the user's profile
3. Check that the user's `role` is `superadmin` — only superadmins can submit training data

```typescript
// Middleware / helper to verify SSO JWT
async function verifySSOToken(authHeader: string | null): Promise<{ valid: boolean; user?: SSOUser; error?: string }> {
  if (!authHeader?.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing or invalid Authorization header' }
  }

  const token = authHeader.slice(7)

  const response = await fetch('https://sso.lightningworks.io/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })

  if (!response.ok) {
    return { valid: false, error: 'Invalid or expired token' }
  }

  const data = await response.json()

  if (!data.valid || !data.user) {
    return { valid: false, error: 'Token verification failed' }
  }

  return { valid: true, user: data.user }
}

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

## API Endpoints

### 1. Submit Training Data

Receives game information text from the SSO admin panel and processes it for RAG training.

```
POST /api/characters/train
Authorization: Bearer <SSO JWT token>
Content-Type: application/json
```

**Request body:**
```json
{
  "appSlug": "siegeworlds",
  "appName": "Siege Worlds",
  "content": "Siege Worlds is a horde shooter game where players defend against waves of enemies...\n\n[full game info text, up to 500,000 characters]",
  "companySlug": "lightningworks"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `appSlug` | string | Unique identifier for the app/game (matches the SSO app slug) |
| `appName` | string | Display name of the app/game |
| `content` | string | The full training text (game lore, mechanics, FAQ, etc.). Max 500,000 characters. |
| `companySlug` | string | The company that owns this app |

**Success response (200):**
```json
{
  "success": true,
  "appSlug": "siegeworlds",
  "chunksProcessed": 47,
  "totalCharacters": 24224,
  "message": "Training data processed successfully"
}
```

**Error responses:**

```json
// 401 - Not authenticated
{ "error": "Missing or invalid Authorization header" }

// 403 - Not authorized (user is not superadmin)
{ "error": "Superadmin access required" }

// 400 - Bad request
{ "error": "appSlug and content are required" }

// 413 - Content too large
{ "error": "Content exceeds maximum length of 500,000 characters" }

// 500 - Processing error
{ "error": "Failed to process training data" }
```

**Implementation guide:**

```typescript
// Example route handler (Next.js / Express style)
export async function POST(request: Request) {
  // 1. Authenticate
  const auth = await verifySSOToken(request.headers.get('Authorization'))
  if (!auth.valid) {
    return Response.json({ error: auth.error }, { status: 401 })
  }

  // 2. Authorize — superadmin only
  if (auth.user!.role !== 'superadmin') {
    return Response.json({ error: 'Superadmin access required' }, { status: 403 })
  }

  // 3. Parse and validate body
  const { appSlug, appName, content, companySlug } = await request.json()

  if (!appSlug || !content) {
    return Response.json({ error: 'appSlug and content are required' }, { status: 400 })
  }

  if (content.length > 500000) {
    return Response.json({ error: 'Content exceeds maximum length of 500,000 characters' }, { status: 413 })
  }

  // 4. Process for RAG
  //    - Split content into chunks (e.g., ~1000 characters each with overlap)
  //    - Generate embeddings for each chunk
  //    - Store in vector database, keyed by appSlug
  //    - Replace any existing training data for this appSlug
  const chunks = splitIntoChunks(content, 1000, 200) // chunkSize, overlap
  // ... embed and store chunks ...

  // 5. Log the training event
  console.log(`Training data submitted by ${auth.user!.email} for ${appSlug}: ${content.length} chars, ${chunks.length} chunks`)

  return Response.json({
    success: true,
    appSlug,
    chunksProcessed: chunks.length,
    totalCharacters: content.length,
    message: 'Training data processed successfully',
  })
}
```

### 2. Get Training Status (optional)

Returns the current training data status for a given app. Used by the SSO admin panel to show whether training data exists and when it was last updated.

```
GET /api/characters/train?appSlug=siegeworlds
Authorization: Bearer <SSO JWT token>
```

**Success response (200):**
```json
{
  "appSlug": "siegeworlds",
  "trained": true,
  "lastUpdated": "2026-03-21T14:30:00Z",
  "totalChunks": 47,
  "totalCharacters": 24224
}
```

**Not trained response (200):**
```json
{
  "appSlug": "siegeworlds",
  "trained": false
}
```

### 3. Delete Training Data (optional)

Removes all training data for a given app.

```
DELETE /api/characters/train?appSlug=siegeworlds
Authorization: Bearer <SSO JWT token>
```

**Success response (200):**
```json
{
  "success": true,
  "appSlug": "siegeworlds",
  "message": "Training data removed"
}
```

## How the SSO Admin Panel Calls These Endpoints

When an admin clicks the **Train** button in the SSO admin panel, the SSO app will make this request:

```typescript
// This is what the SSO admin panel sends — you just need to receive it
const response = await fetch('https://app.kinet.ink/api/characters/train', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseAccessToken}`,
  },
  body: JSON.stringify({
    appSlug: app.slug,        // e.g., "siegeworlds"
    appName: app.name,        // e.g., "Siege Worlds"
    content: characterInfo,   // The full text from the Game Info textarea
    companySlug: company.slug // e.g., "lightningworks"
  }),
})
```

## Character Chat Integration

When a user chats with a character in the Kinet.ink app, the character's responses should be informed by the training data. The typical flow:

1. User sends a message to the character
2. The app searches the vector database for chunks relevant to the user's message, filtered by the character's `appSlug`
3. The relevant chunks are included in the AI prompt as context
4. The AI generates a response using both its general knowledge and the specific game training data

The user's SSO identity (from their JWT token) can be used to personalize responses — for example, addressing them by their `display_name` or `username`.

## CORS Configuration

The Kinet.ink API must accept requests from the SSO admin panel's domain:

```
Access-Control-Allow-Origin: https://sso.lightningworks.io
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

During development, also allow `http://localhost:3000`.

## Security Checklist

- [ ] All training endpoints require a valid SSO JWT in the Authorization header
- [ ] JWT is verified by calling `https://sso.lightningworks.io/api/verify` (do NOT decode the JWT locally — always verify server-side via the SSO endpoint)
- [ ] Only users with `role: "superadmin"` can submit, view, or delete training data
- [ ] Content length is validated (max 500,000 characters)
- [ ] CORS is configured to only allow requests from the SSO domain
- [ ] Training events are logged with the admin's email and timestamp
- [ ] Old training data for an appSlug is fully replaced when new data is submitted (not appended)
