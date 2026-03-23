'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { logAuth } from '@/lib/audit'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    if (username.length < 2 || username.length > 15) { setError('Username must be 2-15 characters.'); return }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { setError('Username can only contain letters, numbers, and underscores.'); return }

    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.toLowerCase(), display_name: username } },
    })
    if (error) { setError(error.message); setLoading(false) }
    else {
      await logAuth(supabase, 'auth.signup', {
        email,
        username: username.toLowerCase(),
        description: `New account created for ${email}`,
      })
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="lw-page">
        <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
          <h1 className="lw-heading-xl" style={{ marginBottom: '1rem' }}>Check Your Email</h1>
          <p className="lw-subtitle">
            We&apos;ve sent a confirmation link to <strong style={{ color: 'var(--lw-text-white)' }}>{email}</strong>. Click the link to verify your account.
          </p>
          <a href="/login" className="lw-btn lw-btn-primary" style={{ display: 'inline-block', marginTop: '1.5rem', width: 'auto', padding: '0.75rem 2rem' }}>
            Back to Sign In
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="lw-page">
      <div className="lw-panel-content">
        <div className="lw-header">
          <img src="/lightningworks_logo_fordark_800px.webp" alt="LightningWorks" className="lw-logo" />
          <p className="lw-subtitle">Create your account</p>
        </div>

        <div className="lw-panel">
          <form onSubmit={handleSignup} className="lw-form">
            <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} required />
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} required />
            <input type="password" placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} required />
            <input type="password" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} required />
            {error && <p className="lw-error">{error}</p>}
            <button type="submit" disabled={loading} className="lw-btn lw-btn-primary">
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
          <p className="lw-footer-text" style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            Already have an account?{' '}<a href="/login" className="lw-link">Sign in</a>
          </p>
        </div>

        <p className="lw-footer-text" style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          By creating an account, you agree to our{' '}
          <a href="/terms" className="lw-link">Terms of Service</a>{' '}and{' '}
          <a href="/privacy" className="lw-link">Privacy Policy</a>
        </p>
      </div>
    </div>
  )
}
