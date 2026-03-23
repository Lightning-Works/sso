import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email, code } = await req.json()

  if (!email || !code) {
    return NextResponse.json({ error: 'Email and backup code are required' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  )

  // Find user by email
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const user = users.find(u => u.email === email.toLowerCase())
  if (!user) {
    // Don't reveal whether email exists
    return NextResponse.json({ error: 'Invalid email or backup code' }, { status: 401 })
  }

  // Get stored backup codes from profile
  const { data: profile } = await supabase.from('profiles').select('backup_codes').eq('id', user.id).single()
  if (!profile?.backup_codes || !Array.isArray(profile.backup_codes) || profile.backup_codes.length === 0) {
    return NextResponse.json({ error: 'Invalid email or backup code' }, { status: 401 })
  }

  // Hash the provided code
  const normalized = code.replace(/-/g, '').toUpperCase()
  const encoded = new TextEncoder().encode(normalized) as Uint8Array<ArrayBuffer>
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashedCode = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

  // Check if the code matches any stored hash
  const codeIndex = profile.backup_codes.indexOf(hashedCode)
  if (codeIndex === -1) {
    return NextResponse.json({ error: 'Invalid email or backup code' }, { status: 401 })
  }

  // Remove the used code
  const remaining = [...profile.backup_codes]
  remaining.splice(codeIndex, 1)
  await supabase.from('profiles').update({ backup_codes: remaining }).eq('id', user.id)

  // Unenroll all TOTP factors for this user
  const { data: factors } = await supabase.auth.admin.mfa.listFactors({ userId: user.id })
  if (factors?.factors) {
    for (const factor of factors.factors) {
      if (factor.factor_type === 'totp') {
        await supabase.auth.admin.mfa.deleteFactor({ userId: user.id, id: factor.id })
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: '2FA has been disabled. You can now sign in with your password.',
    remainingCodes: remaining.length
  })
}
