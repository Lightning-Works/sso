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
const SKYLIE_STYLE: CharStyle = {
  avatarUrl: `${STORAGE_BASE.replace('wemmrhypldubdplaohli', 'matteqdhinpiwfnvxaef')}/character-images/f8447706-e49d-46be-95f1-29e5d6695a36/character_snapshot_skylie.webp`,
  imagePanX: 0.425, imagePanY: 0.615, imageZoom: 1.8,
  bubbleBackgroundColor: '#553C9A', bubbleBorderColor: '#6B46C1', bubbleInnerLineColor: '#9F7AEA',
  bubbleTextColor: '#ffffff', bubbleFontFamily: 'Arial, sans-serif', bubbleFontSize: 14,
}

export const CHARACTERS: CharDef[] = [
  { id: 'skylie', name: 'Skylie', apiKey: 'kinet_sHDSunxqq48ym0tVFiS61DotKZSfaitYWHL9xkAefWOJWG12', sideImg: `${STORAGE_BASE}/app_side_image/skylie_side_img_1800px.webp`, ready: true, style: SKYLIE_STYLE },
  // Ash — full-body art known; awaiting his public-chat key on this deployment.
  { id: 'ash', name: 'Ash', apiKey: '', sideImg: `${STORAGE_BASE}/app_side_image/ash_side_img_1800px.webp`, ready: false, style: {} },
]

export async function askCharacter(apiKey: string, message: string): Promise<{ reply: string; name: string; style: CharStyle }> {
  const r = await fetch(CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey, message }) })
  const d = await r.json().catch(() => ({}))
  if (!d?.success) throw new Error(d?.error || 'The assistant is unavailable right now')
  return { reply: String(d.response || ''), name: String(d.characterName || 'Assistant'), style: (d.characterStyle || {}) as CharStyle }
}
