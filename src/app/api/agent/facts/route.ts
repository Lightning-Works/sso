/**
 * POST /api/agent/facts  — server-to-server, dedicated read credential.
 *
 * Given a platform identity (currently { telegram_id }), resolve the canonical LW-SSO user
 * and report the eligibility FACTS an AI character bot needs to RECOGNISE the user and gate
 * access: linked?, ssoUserId, DIVI balance, Portal-NFT ownership, subscription, age. The bot
 * (divigo-ai-agents/src/agent/walletLink.js -> resolveFacts) calls this with header
 * X-Agent-Secret. Read-only. NOT public. Fails CLOSED (all-false) so any misconfig or lookup
 * error never grants access.
 *
 * This is the reverse of the normal SSO flow: normally a logged-in user proves who they are;
 * here a trusted bot asks "who is this Telegram id, and what do they hold?" It is the piece
 * that turns a bare platform id into a recognised person. See
 * docs/CROSS_APP_RECOGNITION_BUILD_PLAN.md.
 *
 * Auth:   header X-Agent-Secret === env AGENT_FACTS_SECRET (constant-time compare).
 * Body:   { telegram_id: string | number }
 * Return: { linked, ssoUserId, diviBalance, ownsPortalNft, hasActiveSubscription, ageVerified }
 */
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { balance, getNfts, diviGoConfigured, type MsgRoute } from '@/lib/divigo/client'
import { NextResponse } from 'next/server'

const CLOSED = {
  linked: false,
  ssoUserId: null as string | null,
  diviBalance: 0,
  ownsPortalNft: false,
  hasActiveSubscription: false,
  ageVerified: false,
}

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function constEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

/**
 * Resolve a Telegram id to { userId, DiviGo number, DiviGo route }. Tries the generic
 * platform_identities graph first (the future home of all platform links), then falls back to
 * the existing divigo_links table (telegram_id captured during DiviGo wallet linking). Both are
 * attempted defensively so this works before AND after the platform_identities migration runs.
 * Only VERIFIED links count.
 */
async function resolveTelegram(
  db: ReturnType<typeof svc>,
  telegramId: string
): Promise<{ userId: string; number: string | null; route: MsgRoute } | null> {
  // Preferred: the generic identity graph.
  try {
    const { data } = await db
      .from('platform_identities')
      .select('user_id, meta')
      .eq('platform', 'telegram')
      .eq('platform_user_id', telegramId)
      .not('verified_at', 'is', null)
      .maybeSingle()
    if (data?.user_id) {
      const meta = (data.meta || {}) as { divigo_number?: string; divigo_route?: string }
      return { userId: data.user_id, number: meta.divigo_number ?? telegramId, route: (meta.divigo_route as MsgRoute) ?? 'telegram' }
    }
  } catch {
    /* platform_identities may not exist yet — fall through to divigo_links */
  }
  // Fallback: the existing DiviGo link table.
  const { data } = await db
    .from('divigo_links')
    .select('user_id, divigo_number, divigo_route, telegram_id, verified_at')
    .eq('telegram_id', telegramId)
    .not('verified_at', 'is', null)
    .maybeSingle()
  if (data?.user_id) {
    return { userId: data.user_id, number: data.divigo_number ?? telegramId, route: (data.divigo_route as MsgRoute) ?? 'telegram' }
  }
  return null
}

export async function POST(request: Request) {
  const expected = process.env.AGENT_FACTS_SECRET || ''
  const got = request.headers.get('x-agent-secret') || ''
  if (!expected || !got || !constEq(got, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { telegram_id?: string | number }
  const telegramId = body.telegram_id != null ? String(body.telegram_id).trim() : ''
  if (!telegramId) return NextResponse.json({ ...CLOSED })

  const db = svc()
  const who = await resolveTelegram(db, telegramId).catch(() => null)
  if (!who) return NextResponse.json({ ...CLOSED }) // not linked -> anonymous, access closed

  // Holdings via DiviGo (same path partner-holdings uses). Independent so one failing does not
  // sink the other; any failure just leaves that fact false/0 (fail closed).
  let diviBalance = 0
  let ownsPortalNft = false
  if (who.number && diviGoConfigured()) {
    const portalContract = (process.env.AGENT_PORTAL_CONTRACT || '').trim()
    const portalNetwork = (process.env.AGENT_PORTAL_NETWORK || 'eth') as 'eth' | 'poly'
    const [diviRes, portalRes] = await Promise.allSettled([
      balance({ number: who.number, route: who.route, coin: 'divi' }),
      portalContract
        ? getNfts({ number: who.number, route: who.route, network: portalNetwork, contract: portalContract })
        : Promise.resolve([] as unknown[]),
    ])
    const diviRaw = diviRes.status === 'fulfilled' ? diviRes.value : null
    diviBalance = typeof diviRaw === 'number' ? diviRaw : Number(diviRaw) || 0
    ownsPortalNft = portalRes.status === 'fulfilled' ? portalRes.value.length > 0 : false
  }

  // Subscription + age-verification are not modelled in LW-SSO yet -> false for now (Phase 2 of
  // the build plan). Kept in the response so the bot contract stays stable.
  return NextResponse.json({
    linked: true,
    ssoUserId: who.userId,
    diviBalance,
    ownsPortalNft,
    hasActiveSubscription: false,
    ageVerified: false,
  })
}
