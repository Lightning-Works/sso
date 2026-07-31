'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Reads the logged-in SSO user's linked WAX account. /aw runs inside the same
 * SSO app/origin, so the Supabase session cookie is already present — no extra
 * login. Returns their email + WAX account (from connected_wallets, chain 'wax').
 */
export type SessionWax = { email: string | null; wax: string | null; loading: boolean }

type WalletRow = { address: string | null; chain: string | null; provider: string | null }

export function useSessionWax(): SessionWax {
  const [state, setState] = useState<SessionWax>({ email: null, wax: null, loading: true })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { if (!cancelled) setState({ email: null, wax: null, loading: false }); return }
        const { data } = await supabase
          .from('connected_wallets')
          .select('address, chain, provider')
          .eq('user_id', user.id)
        const rows = (data || []) as WalletRow[]
        const wax = rows.find(w => w.chain === 'wax' || w.provider === 'wax')?.address ?? null
        if (!cancelled) setState({ email: user.email ?? null, wax, loading: false })
      } catch {
        if (!cancelled) setState({ email: null, wax: null, loading: false })
      }
    })()
    return () => { cancelled = true }
  }, [])

  return state
}
