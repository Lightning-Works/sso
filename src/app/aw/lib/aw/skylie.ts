/**
 * AWW assistant characters — chat via the Kinet.ink public-chat API.
 *
 * IMPORTANT: this Skylie lives on the Kinet.ink deployment at
 * matteqdhinpiwfnvxaef (the api the user provided). The SSO wallet's existing
 * chat EMBED (kinetink.lovable.app) is a DIFFERENT deployment and rejects this
 * key ("Unauthorized"), so we render the chat natively from this API instead —
 * it returns the character name, avatar (+circle crop pan/zoom) and bubble colours.
 *
 * The CHAT key is client-safe (designed to be exposed). The ADMIN key is secret
 * and must never appear in client code.
 */
const CHAT_URL = 'https://matteqdhinpiwfnvxaef.supabase.co/functions/v1/public-chat'
const STORAGE_BASE = 'https://wemmrhypldubdplaohli.supabase.co/storage/v1/object/public'

export type CharStyle = {
  avatarUrl?: string
  imagePanX?: number
  imagePanY?: number
  imageZoom?: number
  bubbleBackgroundColor?: string
  bubbleBorderColor?: string
  bubbleInnerLineColor?: string
  bubbleTextColor?: string
  bubbleFontFamily?: string
  bubbleFontSize?: number
}

export type CharDef = {
  id: string
  name: string
  apiKey: string
  sideImg: string
  ready: boolean
  style: CharStyle
}

/** Skylie's known style (from her public-chat profile) so the circle + colours
 *  render before her first reply; live replies refresh it. */
// First-paint placeholders ONLY — the real colours/fonts arrive from the API via
// fetchCharacterStyle() on mount and every reply. Edit the character in Kinet.ink,
// not here.
const SKYLIE_STYLE: CharStyle = {
  avatarUrl: `${STORAGE_BASE.replace('wemmrhypldubdplaohli', 'matteqdhinpiwfnvxaef')}/character-images/f8447706-e49d-46be-95f1-29e5d6695a36/character_snapshot_skylie.webp`,
  imagePanX: 0.425, imagePanY: 0.615, imageZoom: 1.8,
  bubbleBackgroundColor: '#f6ccff', bubbleBorderColor: '#680085', bubbleInnerLineColor: '#d70fff',
  bubbleTextColor: '#000000', bubbleFontFamily: "'Comic Sans MS', cursive", bubbleFontSize: 14,
}

const ASH_STYLE: CharStyle = {
  avatarUrl: 'https://matteqdhinpiwfnvxaef.supabase.co/storage/v1/object/public/character-images/f8447706-e49d-46be-95f1-29e5d6695a36/character_snapshot_ash_falcone.webp',
  imagePanX: 0.5, imagePanY: 0.5, imageZoom: 1,
  bubbleBackgroundColor: '#240000', bubbleBorderColor: '#25006b', bubbleInnerLineColor: '#b80000',
  bubbleTextColor: '#ffffff', bubbleFontFamily: 'Comic Sans MS', bubbleFontSize: 15,
}

export const CHARACTERS: CharDef[] = [
  { id: 'skylie', name: 'Skylie', apiKey: 'kinet_sHDSunxqq48ym0tVFiS61DotKZSfaitYWHL9xkAefWOJWG12', sideImg: '/aww/skylie_side_anim.webp', ready: true, style: SKYLIE_STYLE },
  { id: 'ash', name: 'Ash', apiKey: 'kinet_7hum8THxYcMgy0PcahdF9QQglNgsYLWIeoSSrovFoOt6W22R', sideImg: `${STORAGE_BASE}/app_side_image/ash_side_img_1800px.webp`, ready: true, style: ASH_STYLE },
]

/** Pull the character's live bubble colours, font and avatar without spending an
 *  AI generation — '__init__' is the API's handshake that returns characterStyle. */
export async function fetchCharacterStyle(apiKey: string): Promise<CharStyle | null> {
  try {
    const r = await fetch(CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey, message: '__init__' }) })
    const d = await r.json().catch(() => ({}))
    if (!d?.success || !d.characterStyle) return null
    return d.characterStyle as CharStyle
  } catch { return null }
}

export async function askCharacter(apiKey: string, message: string): Promise<{ reply: string; name: string; style: CharStyle }> {
  const r = await fetch(CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey, message }) })
  const d = await r.json().catch(() => ({}))
  if (!d?.success) throw new Error(d?.error || 'The assistant is unavailable right now')
  return { reply: String(d.response || ''), name: String(d.characterName || 'Assistant'), style: (d.characterStyle || {}) as CharStyle }
}
