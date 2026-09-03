/**
 * Skylie — the AWW assistant, powered by the Kinet.ink character-as-a-service.
 *
 * The CHAT key is designed to be embedded in client-side code (per the character
 * service), so it lives here. The ADMIN key (training / usage) is secret and must
 * NEVER appear in client code or the repo — it belongs in a server-side env var
 * when we wire knowledge ingestion.
 *
 * Verified contract: POST { api_key, message } → { success, response,
 * characterName, characterStyle:{ avatarUrl, bubble* colors, ... } }.
 */
const CHAT_KEY = 'kinet_sHDSunxqq48ym0tVFiS61DotKZSfaitYWHL9xkAefWOJWG12'
const CHAT_URL = 'https://matteqdhinpiwfnvxaef.supabase.co/functions/v1/public-chat'

/** Fallback portrait (the service also returns avatarUrl on each reply). */
export const SKYLIE_AVATAR = 'https://matteqdhinpiwfnvxaef.supabase.co/storage/v1/object/public/character-images/f8447706-e49d-46be-95f1-29e5d6695a36/character_snapshot_skylie.webp'

export type SkylieStyle = {
  avatarUrl?: string
  bubbleBackgroundColor?: string
  bubbleBorderColor?: string
  bubbleTextColor?: string
  bubbleFontFamily?: string
}

export async function askSkylie(message: string): Promise<{ reply: string; style?: SkylieStyle }> {
  const r = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: CHAT_KEY, message }),
  })
  const d = await r.json().catch(() => ({}))
  if (!d?.success) throw new Error(d?.error || 'Skylie is unavailable right now')
  return { reply: String(d.response || ''), style: d.characterStyle as SkylieStyle }
}
