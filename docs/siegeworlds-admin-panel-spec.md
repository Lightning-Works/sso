# Siege Worlds Admin Panel — Character Management & AI Training

## Context

The Siege Worlds website (PHP + jQuery) needs an Admin panel accessible from the hamburger menu for users with `admin` or `superadmin` roles. This admin panel manages an AI character (Shi Yang) that can chat with users about the game via a Kinet.ink embed. The admin panel needs to let admins:

1. Upload/manage the character's side image
2. Paste game info text for AI training (RAG)
3. Store two API keys (Chat key + Admin key) for the Kinet.ink service
4. Send the game info to Kinet.ink for training via their ingestion API
5. View training status

This is based on the LightningWorks SSO admin panel which already has this working. Here's exactly how it works there so you can replicate it for the PHP site.

## User Role Check

The Admin link should only appear in the hamburger menu if the logged-in user's role is `admin` or `superadmin`. The user's role comes from the SSO session data stored in `$_SESSION['sso_role']`.

```php
<!-- In the hamburger menu -->
<?php if (isset($_SESSION['sso_role']) && in_array($_SESSION['sso_role'], ['admin', 'superadmin'])): ?>
  <a href="/admin.php">Admin Panel</a>
<?php endif; ?>
```

## Database Storage

The Siege Worlds site needs a table (or config file) to store the character settings. Since this is a single-game site with one character, a simple `site_config` table or even a JSON file works:

```sql
CREATE TABLE IF NOT EXISTS site_config (
  config_key VARCHAR(100) PRIMARY KEY,
  config_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

Keys to store:
- `character_side_img` — filename/path of the character side image
- `character_info` — the game info text for training (can be very large, up to 500,000 characters)
- `chat_api_key` — Kinet.ink Chat API key (public, used in iframe embed)
- `admin_api_key` — Kinet.ink Admin API key (private, used for training)

Alternatively, since you're already using MongoDB via the Heroku API, you could store this in a MongoDB collection. Or even a simple PHP file with an array. Whatever fits the existing architecture.

## Admin Page Layout

The admin page (`/admin.php`) should have a "Character" section with:

### Left side: Character Image
- Shows the current side image (the character that appears next to the login/chat panel)
- "Upload Image" / "Replace Image" button
- Image preview with dimensions display
- Accepts image files (JPEG, PNG, WebP, GIF)

### Right side: Game Info
- Label: "Game Info"
- Description text: "Paste all information you want the character AI to know about this game. This will be sent to Kinet.ink for RAG training."
- Large textarea (min-height 300px, resizable vertically)
- Max length: 500,000 characters
- Character counter at bottom right showing `XX,XXX / 500,000`
- Counter turns orange when approaching the limit (> 490,000)

### Below: API Keys (side by side)

**Chat API Key:**
- Input field
- Label: "Chat API Key"
- Helper text: "Embedded in iframe URL — safe to expose client-side"
- This is the key used in the chat widget iframe URL

**Admin API Key:**
- Input field
- Label: "Admin API Key"
- Helper text: "Server-side only — used for RAG training"
- This key is used only when sending training data to Kinet.ink

### Bottom: Buttons (right-aligned)

**Save button:**
- Shows "Save" normally, "Saving..." while saving, "Saved" after successful save (green-ish)
- Disabled when in "Saved" state
- Reverts to "Save" when any field is edited
- Saves all fields (image path, game info text, both API keys) to the database

**Train button:**
- Shows "Train" (orange background), "Training..." (grey) while training, "Trained" (green) on success
- Disabled when game info is empty or when already trained
- Reverts to "Train" when game info text is edited
- On click, sends the game info to the Kinet.ink ingestion API (see below)
- Shows result text to the left of the buttons (e.g., "47 chunks processed" or error messages)

## Training API Call

When the Train button is clicked, send the game info to Kinet.ink's knowledge ingestion endpoint:

```
POST https://kabdqrzcewkzbjmeqmxx.supabase.co/functions/v1/public-ingest-knowledge
Content-Type: application/json

{
  "api_key": "<the Admin API Key>",
  "text": "<the full game info text>",
  "source_label": "siegeworlds-game-info"
}
```

The `source_label` is a fixed string that identifies this batch of training data. When you re-send with the same label, the old data is replaced — so admins can update the game info and re-train without accumulating stale data.

**This should be done server-side** (PHP cURL) to keep the Admin API key hidden from the browser. Create an endpoint like `/api/train.php` that the admin page calls via AJAX:

```php
<?php
// api/train.php — called by admin page AJAX
session_start();
header('Content-Type: application/json');

// Check admin role
if (!isset($_SESSION['sso_role']) || !in_array($_SESSION['sso_role'], ['admin', 'superadmin'])) {
    echo json_encode(['error' => 'Not authorized']);
    http_response_code(403);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$text = $input['text'] ?? '';
$adminKey = $input['admin_key'] ?? '';

if (!$text || !$adminKey) {
    echo json_encode(['error' => 'Missing text or admin key']);
    http_response_code(400);
    exit;
}

$ch = curl_init('https://kabdqrzcewkzbjmeqmxx.supabase.co/functions/v1/public-ingest-knowledge');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode([
        'api_key' => $adminKey,
        'text' => $text,
        'source_label' => 'siegeworlds-game-info',
    ]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 120, // Training can take a while
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$data = json_decode($response, true);

if ($httpCode === 200 && isset($data['success']) && $data['success']) {
    echo json_encode([
        'success' => true,
        'chunksProcessed' => $data['chunksProcessed'] ?? null,
    ]);
} else {
    echo json_encode([
        'error' => $data['error'] ?? "HTTP $httpCode",
    ]);
    http_response_code(500);
}
```

## Admin Page Save Endpoint

Create `/api/admin-save.php` to save character settings:

```php
<?php
// api/admin-save.php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['sso_role']) || !in_array($_SESSION['sso_role'], ['admin', 'superadmin'])) {
    echo json_encode(['error' => 'Not authorized']);
    http_response_code(403);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

// Save each config value
$db = /* your database connection */;

if (isset($input['character_info'])) {
    // Save to site_config table or however you store config
    saveConfig($db, 'character_info', $input['character_info']);
}
if (isset($input['chat_api_key'])) {
    saveConfig($db, 'chat_api_key', $input['chat_api_key']);
}
if (isset($input['admin_api_key'])) {
    saveConfig($db, 'admin_api_key', $input['admin_api_key']);
}

echo json_encode(['success' => true]);
```

## Image Upload

For the character side image upload, create `/api/admin-upload.php`:

```php
<?php
// api/admin-upload.php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['sso_role']) || !in_array($_SESSION['sso_role'], ['admin', 'superadmin'])) {
    echo json_encode(['error' => 'Not authorized']);
    http_response_code(403);
    exit;
}

if (!isset($_FILES['image'])) {
    echo json_encode(['error' => 'No file uploaded']);
    http_response_code(400);
    exit;
}

$file = $_FILES['image'];
$allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
if (!in_array($file['type'], $allowed)) {
    echo json_encode(['error' => 'Invalid file type']);
    http_response_code(400);
    exit;
}

$ext = pathinfo($file['name'], PATHINFO_EXTENSION);
$filename = 'character_side_img.' . strtolower($ext);
$destPath = __DIR__ . '/../img/' . $filename;

if (move_uploaded_file($file['tmp_name'], $destPath)) {
    saveConfig($db, 'character_side_img', '/img/' . $filename);
    echo json_encode(['success' => true, 'path' => '/img/' . $filename]);
} else {
    echo json_encode(['error' => 'Upload failed']);
    http_response_code(500);
}
```

## Admin Page HTML/JS

The admin page front-end should be a standard PHP page with AJAX calls. Key behaviors:

1. On page load, fetch current config values and populate the form
2. Image upload uses FormData with fetch to `/api/admin-upload.php`, shows preview immediately via `URL.createObjectURL()`
3. Save button POSTs all fields to `/api/admin-save.php`
4. Train button POSTs game info + admin key to `/api/train.php`
5. Both Save and Train buttons have three states: default → working → done
6. Any edit to any field resets both buttons back to their default state
7. Train button is disabled when game info textarea is empty

## Styling

Match the existing Siege Worlds dark theme. The SSO admin uses:
- Background: dark purple/black with comic tiled background
- Input fields: `background: rgb(26,17,46); color: #bab1a8`
- Primary button: purple (`#6a24fa`)
- Train button: orange (`#ff8800`) default, grey (`#3a3938`) while training, green (`#34A853`) when done
- Muted text: `#7a7572`
- Section backgrounds: `rgba(0,0,0,0.8)` with blur

Adapt these to match whatever the Siege Worlds site already uses for its dark theme.

## Chat Widget Integration

The Chat API Key stored here is the same one used by the Kinet.ink chat widget embedded elsewhere on the site. When the admin saves a new Chat API Key here, it should be used by the chat widget on the public pages. The chat widget code (already provided separately) reads this key to construct the iframe URL:

```
https://fairytime.lovable.app/embed/chat?key=CHAT_API_KEY&bg=1a112e&accent=6a24fa&header=false
```

## Security Notes

- The admin page and all API endpoints must check `$_SESSION['sso_role']` for admin/superadmin
- The Admin API Key should NEVER be exposed to the browser — only sent server-side via PHP cURL
- The Chat API Key is safe to expose client-side (it's in the iframe URL anyway)
- All AJAX endpoints should validate CSRF if applicable
- The game info textarea accepts up to 500,000 characters — make sure your database column supports this (TEXT or LONGTEXT in MySQL, TEXT in PostgreSQL)
