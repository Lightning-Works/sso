'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const STORAGE_BASE = 'https://wemmrhypldubdplaohli.supabase.co/storage/v1/object/public'

function LoginContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [companyLogo, setCompanyLogo] = useState('/lightningworks_logo_fordark_800px.webp')
  const [appLogo, setAppLogo] = useState('')
  const [sideImg, setSideImg] = useState('/shiyang_pointing_1800px.webp')
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const appSlug = searchParams.get('app')
    const companySlug = searchParams.get('company')

    if (appSlug) {
      // Load app-specific branding
      supabase
        .from('apps')
        .select('*, companies(name, slug, logo_url)')
        .eq('slug', appSlug)
        .single()
        .then(({ data }) => {
          if (data) {
            if (data.app_header_img) setAppLogo(`${STORAGE_BASE}/app_logo/${data.app_header_img}`)
            if (data.app_side_img) setSideImg(`${STORAGE_BASE}/app_side_image/${data.app_side_img}`)
            if (data.companies?.logo_url) setCompanyLogo(`${STORAGE_BASE}/company-logos/${data.companies.logo_url}`)
          }
        })
    } else if (companySlug) {
      // Load company branding only
      supabase
        .from('companies')
        .select('*')
        .eq('slug', companySlug)
        .single()
        .then(({ data }) => {
          if (data) {
            if (data.logo_url) setCompanyLogo(`${STORAGE_BASE}/company-logos/${data.logo_url}`)
            if (data.app_side_img) setSideImg(`${STORAGE_BASE}/app_side_image/${data.app_side_img}`)
          }
        })
    }
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/account')
    }
  }

  const handleOAuth = async (provider: 'google' | 'discord' | 'apple' | 'twitter') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) setError(error.message)
  }

  return (
    <>
    <style>{`
      .lw-input, .lw-input:focus, .lw-input:active,
      input[type="email"].lw-input, input[type="password"].lw-input {
        background-color: rgb(26, 17, 46) !important;
        color: #bab1a8 !important;
        -webkit-text-fill-color: #bab1a8 !important;
      }
      .lw-input::placeholder {
        color: #7a7572 !important;
        -webkit-text-fill-color: #7a7572 !important;
        opacity: 1 !important;
      }
      .lw-input:-webkit-autofill,
      .lw-input:-webkit-autofill:hover,
      .lw-input:-webkit-autofill:focus {
        -webkit-box-shadow: 0 0 0 1000px rgb(26, 17, 46) inset !important;
        -webkit-text-fill-color: #bab1a8 !important;
      }
    `}</style>
    <div className="lw-page">
      <div className="lw-page-inner">
        <div className="lw-panel-content">
          <div className="lw-header">
            <img src={companyLogo} alt="Company Logo" className="lw-logo" />
            <p className="lw-subtitle">Sign in to your account</p>
          </div>

          <div className="lw-panel">
            {appLogo && <img src={appLogo} alt="App Logo" className="lw-app-logo" />}
            {/* OAuth Buttons */}
            <div className="lw-oauth-grid">
              <button onClick={() => handleOAuth('google')} className="lw-btn lw-btn-google">
                <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Google
              </button>

              <button onClick={() => handleOAuth('apple')} className="lw-btn lw-btn-apple">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                Apple
              </button>

              <button onClick={() => handleOAuth('discord')} className="lw-btn lw-btn-discord">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>
                Discord
              </button>

              <button onClick={() => handleOAuth('twitter')} className="lw-btn lw-btn-twitter">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                X
              </button>
            </div>

            {/* Wallet Login */}
            <button
              onClick={() => {
                // WAX Cloud Wallet OAuth flow
                const returnUrl = encodeURIComponent(window.location.origin + '/auth/wax-callback')
                window.location.href = `https://www.mycloudwallet.com/login?returnUrl=${returnUrl}`
              }}
              className="lw-btn lw-btn-wax"
              style={{ width: '100%', marginBottom: '1.5rem' }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
              WAX Cloud Wallet
            </button>

            <div className="lw-divider">
              <div className="lw-divider-line"></div>
              <span className="lw-divider-text">or</span>
              <div className="lw-divider-line"></div>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleLogin} className="lw-form">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="lw-input"
                style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="lw-input"
                style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}}
                required
              />

              {error && <p className="lw-error">{error}</p>}

              <button type="submit" disabled={loading} className="lw-btn lw-btn-primary">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <div className="lw-footer">
              <a href="/forgot-password" className="lw-link" style={{ fontSize: '0.875rem' }}>
                Forgot password?
              </a>
              <p className="lw-footer-text" style={{ marginTop: '0.5rem' }}>
                Don&apos;t have an account?{' '}
                <a href="/signup" className="lw-link">Create one</a>
              </p>
            </div>
          </div>

          <p className="lw-footer-text" style={{ marginTop: '1.5rem' }}>
            By signing in, you agree to our{' '}
            <a href="/terms" className="lw-link">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="lw-link">Privacy Policy</a>
          </p>
        </div>

        <img
          src={sideImg}
          alt="Character"
          className="lw-character"
        />
      </div>
    </div>
    </>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="lw-page"><p className="lw-subtitle">Loading...</p></div>}>
      <LoginContent />
    </Suspense>
  )
}
