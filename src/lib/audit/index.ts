/**
 * Audit Module
 *
 * Usage:
 *   import { logAuth, logWallet, logTx } from '@/lib/audit'
 *   await logAuth(supabase, 'login', { user_id: '...', email: '...' })
 *   await logWallet(supabase, 'wallet_connected', { user_id: '...', metadata: { chain: 'solana', address: '...' } })
 *   await logTx(supabase, 'withdrawal', { user_id: '...', metadata: { amount: 50, token: 'USDC', chain: 'solana' } })
 */

export { logEvent, logAuth, logWallet, logTx, logProfile, logAdmin, logSystem } from './logger'
export type { AuditEvent, EventCategory } from './logger'
