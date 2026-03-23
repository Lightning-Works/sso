# Kinet.ink User Memory & Conversation Persistence — Spec for Lovable

## The Problem

Currently, every time a user opens the chat embed, it starts fresh with no memory of previous conversations. Users expect the character to remember them — what they talked about, what they asked, their preferences. This needs to work across every platform where the character appears: web embed, Telegram bot, Discord bot, WhatsApp bot, etc.

## What the SSO Now Sends

The LightningWorks SSO embed now sends a `userId` and `email` in every `setUserIdentity` postMessage:

```javascript
{
  type: 'setUserIdentity',
  userId: '0f3eb79d-be6d-41d9-9017-dda3df6bca81',  // Supabase Auth UUID — stable, unique per user
  email: 'user@example.com',
  userName: 'geoff',
  userAvatar: 'https://...',
  userBorderColor: 'hsl(0,100%,37%)',
  userInnerColor: 'hsl(281,80%,25%)',
}
```

The `userId` is the canonical identifier for this user across all LightningWorks apps. It's a UUID from Supabase Auth and will never change for a given user.

## Architecture: Universal User Identity

The same user can talk to a character from multiple places:

| Platform | How the user is identified |
|---|---|
| Web embed (SSO sites) | `userId` from postMessage (Supabase Auth UUID) |
| Telegram bot | Telegram user ID (numeric) |
| Discord bot | Discord user ID (snowflake) |
| WhatsApp bot | Phone number |
| Direct API call | `userId` passed in request body |

Kinet.ink needs a **unified user identity system** that links these platform-specific IDs to a single canonical user. This way, a conversation started on the web embed continues seamlessly on Telegram.

### Suggested Schema: `character_users` table

```sql
CREATE TABLE character_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_user_id TEXT NOT NULL,        -- primary identity (SSO userId if linked, else auto-generated)
  character_id UUID NOT NULL REFERENCES characters(id),
  display_name TEXT,
  avatar_url TEXT,
  border_color TEXT,
  inner_color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(canonical_user_id, character_id)
);

-- Platform identity links
CREATE TABLE user_platform_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_user_id UUID NOT NULL REFERENCES character_users(id),
  platform TEXT NOT NULL,                  -- 'sso', 'telegram', 'discord', 'whatsapp', 'api'
  platform_user_id TEXT NOT NULL,          -- the platform-specific ID
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, platform_user_id, character_user_id)
);
```

**How linking works:**

1. User chats via web embed → SSO sends `userId: "abc-123"` → Kinet.ink creates a `character_user` with `canonical_user_id = "sso:abc-123"`, links it as `platform=sso, platform_user_id=abc-123`
2. Same user later chats via Telegram → Telegram bot sees `telegram_id: 12345` → creates a separate `character_user` with `canonical_user_id = "telegram:12345"`
3. User types `/link` in Telegram → bot gives them a code → user enters code on the SSO account page or web chat → Kinet.ink merges the two `character_user` records, combining their conversation history and memory

Until linked, each platform identity is treated as a separate user. After linking, all history and memory is unified under one canonical user.

## Two Layers of Memory

### Layer 1: Conversation History (Short-term)

Store recent messages so the character can pick up where it left off.

```sql
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_user_id UUID NOT NULL REFERENCES character_users(id),
  role TEXT NOT NULL,           -- 'user' or 'assistant'
  content TEXT NOT NULL,
  platform TEXT,                -- which platform this message came from
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conv_messages_user ON conversation_messages(character_user_id, created_at DESC);
```

**On each chat request:**
1. Look up the `character_user` by platform identity
2. Load the last N messages (e.g., 30) as conversation history
3. Include them in the `history` array sent to the AI
4. After the AI responds, store both the user's message and the AI's response

**Pruning:** Keep the last 100 messages per user per character. Older messages get summarized (see Layer 2) then deleted.

### Layer 2: User Knowledge (Long-term, RAG)

Extract persistent facts about the user from conversations and store them as embeddings, just like game knowledge but per-user.

```sql
CREATE TABLE user_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_user_id UUID NOT NULL REFERENCES character_users(id),
  content TEXT NOT NULL,           -- the extracted fact
  embedding VECTOR(1536),          -- text-embedding-3-small
  source TEXT,                     -- 'conversation', 'profile', 'manual'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**How facts get extracted:**

After every N messages (e.g., every 5 user messages), run a background extraction prompt:

```
System: Extract any new facts about this user from the recent conversation.
Return each fact as a separate line. Only include facts that would be useful
for future conversations (preferences, interests, personal details they shared,
questions they care about, their experience level, etc.).
If no new facts, return "NONE".

Recent messages:
[last 10 messages]

Existing known facts:
[current user knowledge chunks]
```

Embed each new fact and store it. On future conversations, retrieve the top 5-10 most relevant user facts via vector similarity and inject them into the system prompt alongside game knowledge.

**The system prompt assembly becomes:**

```
[Character personality and instructions]
[Game knowledge chunks — shared, from admin training]  ← already exists
[User knowledge chunks — per-user, from past conversations]  ← NEW
[Recent conversation history]  ← NEW
[Current user message]
```

## How Each Platform Passes User Identity

### Web Embed (postMessage)

Already implemented. The SSO sends `userId` in the `setUserIdentity` message. The embed should:

1. On receiving `setUserIdentity` with a `userId`, look up or create a `character_user` with `platform=sso, platform_user_id=userId`
2. Load their conversation history
3. Pre-populate the chat with recent messages (or at least use them as context for the AI)

### Direct Chat API

Add an optional `userId` field to the `/public-chat` endpoint request body:

```json
{
  "api_key": "...",
  "message": "Hey, remember me?",
  "userId": "sso:0f3eb79d-be6d-41d9-9017-dda3df6bca81",
  "platform": "web",
  "history": []   // can be empty — server loads from DB if userId is provided
}
```

When `userId` is provided:
- `history` in the request body is ignored — server loads real history from DB
- Response includes the updated conversation
- If `userId` is not provided, it behaves as today (stateless, uses the `history` array from the request)

### Telegram / Discord / WhatsApp Bots

These bots have their own user IDs from each platform. On each message:

1. Look up `character_user` by `platform=telegram, platform_user_id=<telegram_id>`
2. If not found, create one
3. Load conversation history
4. Generate response with full context
5. Store the exchange

## Account Linking (Cross-Platform)

For a user to unify their identities across platforms:

### Link Flow

1. User types `/link` in Telegram (or Discord, etc.)
2. Bot generates a short code (e.g., `LINK-A7X9`) and stores it with the platform identity, expires in 10 minutes
3. Bot says: "Enter this code on the Kinet.ink website or in the web chat to link your accounts: LINK-A7X9"
4. User enters the code in the web chat (or on an account page)
5. Kinet.ink verifies the code, merges the two `character_user` records:
   - Combine conversation histories (interleave by timestamp)
   - Combine user knowledge (deduplicate similar facts)
   - Add both platform links to the surviving record
   - Delete the orphaned record

### Unlink Flow

User can unlink a platform via the web interface or a `/unlink` command. This removes the platform link but keeps the canonical user and all history.

## Privacy & Data Management

1. **Clear history:** Users should be able to clear their conversation history. API endpoint: `DELETE /api/user/{userId}/history?characterId=X`
2. **Clear memory:** Users should be able to clear what the character knows about them. API endpoint: `DELETE /api/user/{userId}/knowledge?characterId=X`
3. **Delete account:** Remove all data for a user across all characters. API endpoint: `DELETE /api/user/{userId}`
4. **Export data:** Users should be able to download their conversation history and stored facts. API endpoint: `GET /api/user/{userId}/export?characterId=X`

The LightningWorks SSO account page can add buttons for these that call the Kinet.ink API with the user's SSO ID.

## Summary of Required Kinet.ink Changes

1. **Database:** Add `character_users`, `user_platform_links`, `conversation_messages`, and `user_knowledge` tables
2. **Web embed:** Read `userId` from `setUserIdentity` postMessage, look up/create user, load history
3. **Chat API:** Accept optional `userId` and `platform` fields, load server-side history when provided
4. **Chat response:** After each exchange, store messages in `conversation_messages`
5. **Knowledge extraction:** Periodically extract user facts from conversations, embed and store them
6. **System prompt:** Inject user-specific knowledge chunks alongside game knowledge
7. **Linking API:** Generate/verify link codes for cross-platform identity merging
8. **Privacy API:** Endpoints to clear history, clear memory, delete account, export data

## What the SSO Side Provides

- `userId` (Supabase Auth UUID) — sent via postMessage on web embeds, available via `/api/verify` for server-to-server calls
- `email` — for display/identification purposes
- `userName` — display name
- Avatar + CIC colors — for visual identity in chat
- Connected platform identities (Google, Discord, X, wallets) — available via the SSO's profile data, could be used to pre-link accounts if the same Discord ID is found
