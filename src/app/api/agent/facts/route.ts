/**
 * POST /api/agent/facts   (header X-Agent-Secret: <AGENT_FACTS_SECRET>)
 * Body: { telegram_id }
 *
 * Server-to-server. Resolves the eligibility FACTS the AI agent needs for a Telegram
 * user: is their account linked, and do they meet any access method (>=100k DIVI,
 * a LightningWorks Portal NFT, an active subscription, ...). The agent evaluates the
 * OR of methods; this endpoint just reports the raw facts. Flexible: each fact is a
 * provider below, so a new method's data source is one more entry.
 *
 * Returns { linked, diviBalance, ownsPortalNft, hasActiveSubscription, ageVerified }.
 */
import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getDiviBalance } from '@/lib/wallets/balances/divi-balances'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  )
}

const SAFE = { linked: false, ssoUserId: null as string | null, diviBalance: 0, ownsPortalNft: false, hasActiveSubscription: false, ageVerified: false }

export async function POST(request: Request) {
  if ((request.headers.get('x-agent-secret') || '') !== process.env.AGENT_FACTS_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  let telegramId: unknown
  try { telegramId = (await request.json())?.telegram_id } catch { /* ignore */ }
  if (telegramId == null) return NextResponse.json({ error: 'telegram_id required' }, { status: 400 })

  const db = service()

  // Telegram id -> linked SSO user.
  const { data: link } = await db
    .from('divigo_links')
    .select('user_id, verified_at')
    .eq('divigo_number', Number(telegramId))
    .maybeSingle()
  if (!link || !link.user_id) return NextResponse.json({ ...SAFE, linked: false })

  const userId = link.user_id

  // Their on-chain addresses per chain.
  const { data: wallets } = await db
    .from('connected_wallets')
    .select('chain_type, wallet_address')
    .eq('user_id', userId)
  const addrs = (wallets || []) as Array<{ chain_type: string; wallet_address: string }>
  const byChain = (chain: string) => addrs.filter((w) => (w.chain_type || '').toLowerCase() === chain).map((w) => w.wallet_address)

  // ssoUserId is the stable CROSS-APP identity: passed to Kinetink as end_user_id so
  // Shi Yang knows the SAME person across Telegram / Discord / games / SSO.
  const facts = { ...SAFE, linked: true, ssoUserId: userId }

  // --- fact: DIVI balance (sum across the user's DIVI addresses) ---
  try {
    let total = 0
    for (const a of byChain('divi')) total += (await getDiviBalance(a)) || 0
    facts.diviBalance = total
  } catch (e) { /* leave 0 */ }

  // --- fact: owns a LightningWorks Portal NFT (extendable) ---
  // Set PORTAL_NFT_CHAIN + PORTAL_NFT_CONTRACT to enable; until then reports false.
  try {
    const chain = process.env.PORTAL_NFT_CHAIN
    const contract = process.env.PORTAL_NFT_CONTRACT
    if (chain && contract && byChain(chain).length) {
      // NOTE: reuse the gate route's NFT-ownership check here (Alchemy getNFTsForOwner)
      // once shared into a lib; scaffolded false until wired to avoid a wrong answer.
      facts.ownsPortalNft = false
    }
  } catch (e) { /* leave false */ }

  // --- fact: active subscription (wire to the subscriptions source) ---
  // facts.hasActiveSubscription = ... ; false until the source is confirmed.

  // --- fact: age verified (wire to the age-verification flow) ---
  // facts.ageVerified = ... ; false until that flow exists.

  return NextResponse.json(facts)
}
