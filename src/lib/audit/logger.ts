/**
 * Audit Logger Module
 * Records all user events for compliance and admin review.
 *
 * Event categories:
 *   auth     — login, logout, signup, password change, 2FA
 *   wallet   — connect, disconnect, balance check
 *   tx       — deposit, withdrawal, transfer, commission
 *   profile  — name change, email change, avatar
 *   admin    — ban, unban, role change, company/app edits
 *   system   — errors, rate limits, sanctions screening
 *
 * GDPR compliance:
 *   - Logs auto-delete after 2 years (DB cron)
 *   - PII (email, IP) stored only for compliance necessity
 *   - Users can request data export via admin
 *   - No passwords or secrets ever logged
 */

import { SupabaseClient } from '@supabase/supabase-js'

export type EventCategory = 'auth' | 'wallet' | 'tx' | 'profile' | 'admin' | 'system'

export interface AuditEvent {
  user_id?: string
  username?: string
  email?: string
  event_type: string
  event_category: EventCategory
  description?: string
  metadata?: Record<string, unknown>
  ip_address?: string
  user_agent?: string
}

export async function logEvent(supabase: SupabaseClient, event: AuditEvent): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      user_id: event.user_id || null,
      username: event.username || null,
      email: event.email || null,
      event_type: event.event_type,
      event_category: event.event_category,
      description: event.description || null,
      metadata: event.metadata || {},
      ip_address: event.ip_address || null,
      user_agent: event.user_agent || null,
    })
  } catch (e) {
    console.error('Audit log error:', e)
  }
}

// Convenience helpers
export const logAuth = (supabase: SupabaseClient, type: string, opts: Partial<AuditEvent> = {}) =>
  logEvent(supabase, { event_type: type, event_category: 'auth', ...opts })

export const logWallet = (supabase: SupabaseClient, type: string, opts: Partial<AuditEvent> = {}) =>
  logEvent(supabase, { event_type: type, event_category: 'wallet', ...opts })

export const logTx = (supabase: SupabaseClient, type: string, opts: Partial<AuditEvent> = {}) =>
  logEvent(supabase, { event_type: type, event_category: 'tx', ...opts })

export const logProfile = (supabase: SupabaseClient, type: string, opts: Partial<AuditEvent> = {}) =>
  logEvent(supabase, { event_type: type, event_category: 'profile', ...opts })

export const logAdmin = (supabase: SupabaseClient, type: string, opts: Partial<AuditEvent> = {}) =>
  logEvent(supabase, { event_type: type, event_category: 'admin', ...opts })

export const logSystem = (supabase: SupabaseClient, type: string, opts: Partial<AuditEvent> = {}) =>
  logEvent(supabase, { event_type: type, event_category: 'system', ...opts })
