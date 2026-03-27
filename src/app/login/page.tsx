'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { logAuth } from '@/lib/audit'

const STORAGE_BASE = 'https://wemmrhypldubdplaohli.supabase.co/storage/v1/object/public'

function LoginContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [companyLogo, setCompanyLogo] = useState('/lightningworks_logo_fordark_800px.webp')
  const [appLogo, setAppLogo] = useState('')
  const [sideImg, setSideImg] = useState<string | null>('/shiyang_pointing_1800px.webp')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatApiKey, setChatApiKey] = useState('')
  const [appName, setAppName] = useState('')
  const [userAvatarUrl, setUserAvatarUrl] = useState('')
  const [userName, setUserName] = useState('')
  const [userBorderColor, setUserBorderColor] = useState('')
  const [userInnerColor, setUserInnerColor] = useState('')
  const [userId, setUserId] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [authError, setAuthError] = useState<{ show: boolean; reason: string; logs: string }>({ show: false, reason: '', logs: '' })
  const [copied, setCopied] = useState(false)

  // Convert hex (#rrggbb) to HSL string for Kinet.ink
  const hexToHsl = (hex: string): string => {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const l = (max + min) / 2
    if (max === min) return `hsl(0,0%,${Math.round(l * 100)}%)`
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h = 0
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
    return `hsl(${Math.round(h * 360)},${Math.round(s * 100)}%,${Math.round(l * 100)}%)`
  }
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Show error modal if redirected back with auth error
  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam === 'auth_failed') {
      const reason = searchParams.get('reason') || 'Authentication failed. Please try again.'
      const provider = searchParams.get('provider') || 'unknown'
      const appParam = searchParams.get('app') || 'none'
      const now = new Date()

      const logLines = [
        `--- LightningWorks SSO Diagnostic Log ---`,
        `Timestamp: ${now.toISOString()}`,
        `Local time: ${now.toLocaleString()}`,
        `Provider: ${provider}`,
        `Error: ${reason}`,
        `App: ${appParam}`,
        `Page URL: ${window.location.origin}/login`,
        `Browser: ${navigator.userAgent}`,
        `Screen: ${window.screen.width}x${window.screen.height}`,
        `Language: ${navigator.language}`,
        `---`,
      ].join('\n')

      setAuthError({ show: true, reason, logs: logLines })
    }
  }, [searchParams])

  // Check if user is already logged in — load avatar for chat
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      setUserEmail(user.email || '')
      setUserName(user.user_metadata?.display_name || user.user_metadata?.username || '')
      const { data: profile } = await supabase.from('profiles').select('avatar_url, display_name, username, avatar_outer_color, avatar_inner_color').eq('id', user.id).single()
      if (profile?.display_name || profile?.username) setUserName(profile.display_name || profile.username)
      if (profile?.avatar_outer_color) setUserBorderColor(hexToHsl(profile.avatar_outer_color))
      if (profile?.avatar_inner_color) setUserInnerColor(hexToHsl(profile.avatar_inner_color))
      if (profile?.avatar_url) {
        if (profile.avatar_url.startsWith('http')) {
          setUserAvatarUrl(profile.avatar_url)
        } else {
          const { data: signedData } = await supabase.storage.from('user_avatars').createSignedUrl(profile.avatar_url, 604800)
          if (signedData?.signedUrl) setUserAvatarUrl(signedData.signedUrl)
        }
      } else {
        // Fallback to social avatar
        const identities = user.identities || []
        const socialAvatar =
          identities.find(i => i.provider === 'google')?.identity_data?.avatar_url ||
          identities.find(i => i.provider === 'discord')?.identity_data?.avatar_url ||
          identities.find(i => i.provider === 'twitter')?.identity_data?.avatar_url ||
          user.user_metadata?.avatar_url || ''
        if (socialAvatar) setUserAvatarUrl(socialAvatar)
      }
    })
  }, [])

  useEffect(() => {
    const appSlug = searchParams.get('app')
    const companySlug = searchParams.get('company')

    if (appSlug) {
      supabase
        .from('apps')
        .select('*, companies(name, slug, logo_url)')
        .eq('slug', appSlug)
        .single()
        .then(({ data }) => {
          if (data) {
            if (data.app_header_img) setAppLogo(`${STORAGE_BASE}/app_logo/${data.app_header_img}`)
            // Set side image if configured, clear the default if not
            if (data.app_side_img) {
              setSideImg(`${STORAGE_BASE}/app_side_image/${data.app_side_img}`)
            } else {
              setSideImg(null)
            }
            if (data.companies?.logo_url) setCompanyLogo(`${STORAGE_BASE}/company-logos/${data.companies.logo_url}`)
            if (data.chat_api_key) setChatApiKey(data.chat_api_key)
            if (data.name) setAppName(data.name)
          }
        })
    } else if (companySlug) {
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

  // Listen for ALL messages from the chat iframe and respond with user identity
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin.includes('lovable.app') || event.origin.includes('kinet.ink')) {
        console.log('[SSO Login] Message from embed:', event.data)
        const iframe = document.querySelector('iframe[title="Character Chat"]') as HTMLIFrameElement
        if (iframe?.contentWindow) {
          const msg = {
            type: 'setUserIdentity',
            userId: userId || '',
            email: userEmail || '',
            avatar: userAvatarUrl || '',
            user_avatar: userAvatarUrl || '',
            name: userName || '',
            userName: userName || '',
            borderColor: userBorderColor || '',
            userBorderColor: userBorderColor || '',
            innerColor: userInnerColor || '',
            userInnerColor: userInnerColor || '',
            userColor: userBorderColor || '',
          }
          console.log('[SSO Login] Sending identity:', { type: msg.type, hasAvatar: !!msg.avatar, name: msg.name })
          iframe.contentWindow.postMessage(msg, '*')
        }
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [userAvatarUrl, userName, userBorderColor, userInnerColor])

  const externalRedirect = searchParams.get('redirect')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      await logAuth(supabase, 'auth.login.failed', {
        email,
        description: `Failed login attempt for ${email}`,
        metadata: { reason: error.message },
      })
    } else if (externalRedirect) {
      const session = data.session
      await logAuth(supabase, 'auth.login.password', {
        user_id: data.user?.id,
        email: data.user?.email || email,
        username: data.user?.user_metadata?.username,
        description: `Logged in via email/password`,
      })
      const sep = externalRedirect.includes('#') ? '&' : '#'
      window.location.href = `${externalRedirect}${sep}access_token=${session.access_token}&refresh_token=${session.refresh_token}&token_type=bearer`
    } else {
      await logAuth(supabase, 'auth.login.password', {
        user_id: data.user?.id,
        email: data.user?.email || email,
        username: data.user?.user_metadata?.username,
        description: `Logged in via email/password`,
      })
      router.push('/account')
    }
  }

  const handleOAuth = async (provider: 'google' | 'discord' | 'apple' | 'twitter' | 'x') => {
    const params = new URLSearchParams({ provider })
    if (externalRedirect) params.set('external_redirect', externalRedirect)
    const callbackUrl = `${window.location.origin}/auth/callback?${params.toString()}`

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl,
      },
    })
    if (error) setError(error.message)
  }

  return (
    <>
    {/* Auth error modal */}
    {authError.show && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #1a112e 0%, #2a1a4e 100%)',
          border: '1px solid rgba(106, 36, 250, 0.3)',
          borderRadius: '16px', padding: '2rem', maxWidth: '480px', width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          position: 'relative',
        }}>
          {/* Close button */}
          <button
            onClick={() => {
              setAuthError({ show: false, reason: '', logs: '' })
              setCopied(false)
              const url = new URL(window.location.href)
              url.searchParams.delete('error')
              url.searchParams.delete('reason')
              url.searchParams.delete('provider')
              window.history.replaceState({}, '', url.toString())
            }}
            style={{
              position: 'absolute', top: '12px', right: '12px',
              background: 'rgba(255,255,255,0.1)', border: 'none',
              color: '#9a9a9a', width: '32px', height: '32px',
              borderRadius: '50%', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.1rem', lineHeight: 1,
            }}
            aria-label="Close"
          >&#x2715;</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'rgba(255, 68, 68, 0.15)', margin: '0 auto 1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.5rem', color: '#ff4444',
            }}>!</div>
            <h3 style={{ color: '#fff', margin: '0 0 0.75rem', fontSize: '1.25rem' }}>
              Sign-in Failed
            </h3>
            <p style={{ color: '#bab1a8', margin: '0 0 1.25rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {authError.reason}
            </p>
          </div>

          {/* Diagnostic log */}
          <details style={{ marginBottom: '1.25rem' }}>
            <summary style={{
              color: '#7a7572', fontSize: '0.8rem', cursor: 'pointer',
              userSelect: 'none', marginBottom: '0.5rem',
            }}>
              Diagnostic details (click to expand)
            </summary>
            <pre style={{
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', padding: '0.75rem', margin: 0,
              fontSize: '0.75rem', color: '#9a9a9a', lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: '200px', overflowY: 'auto',
            }}>
              {authError.logs}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(authError.logs)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              style={{
                marginTop: '0.5rem', width: '100%', padding: '0.5rem',
                background: 'rgba(106, 36, 250, 0.15)', border: '1px solid rgba(106, 36, 250, 0.3)',
                borderRadius: '8px', color: '#bab1a8', fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              {copied ? 'Copied!' : 'Copy diagnostic log'}
            </button>
          </details>

          <button
            onClick={() => {
              setAuthError({ show: false, reason: '', logs: '' })
              setCopied(false)
              const url = new URL(window.location.href)
              url.searchParams.delete('error')
              url.searchParams.delete('reason')
              url.searchParams.delete('provider')
              window.history.replaceState({}, '', url.toString())
            }}
            className="lw-btn lw-btn-primary"
            style={{ width: '100%' }}
          >
            Try Again
          </button>
        </div>
      </div>
    )}

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

          {/* Panel — shows login OR chat, not both */}
          {chatOpen ? (
            <div className="lw-panel" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
              {/* Close button */}
              <button
                onClick={() => setChatOpen(false)}
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  zIndex: 10,
                  background: 'rgba(0,0,0,0.5)',
                  border: 'none',
                  color: '#fff',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
              {chatApiKey ? (
                <iframe
                  src={`https://fairytime.lovable.app/embed/chat?key=${chatApiKey}&bg=1a112e&accent=6a24fa&header=false${userId ? `&user_id=${encodeURIComponent(userId)}` : ''}${userName ? `&userName=${encodeURIComponent(userName)}` : ''}`}
                  style={{
                    width: '100%',
                    height: '650px',
                    border: 'none',
                    display: 'block',
                  }}
                  allow="clipboard-write"
                  title="Character Chat"
                  onLoad={(e) => {
                    const iframe = e.target as HTMLIFrameElement
                    const msg = {
                      type: 'setUserIdentity',
                      avatar: userAvatarUrl || '',
                      user_avatar: userAvatarUrl || '',
                      name: userName || '',
                      userName: userName || '',
                      borderColor: userBorderColor || '',
                      userBorderColor: userBorderColor || '',
                      innerColor: userInnerColor || '',
                      userInnerColor: userInnerColor || '',
                      userColor: userBorderColor || '',
                    }
                    const send = () => iframe.contentWindow?.postMessage(msg, '*')
                    send()
                    setTimeout(send, 500)
                    setTimeout(send, 1500)
                    setTimeout(send, 3000)
                  }}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '650px', color: 'var(--lw-text-muted)', padding: '2rem', textAlign: 'center' }}>
                  Chat not configured yet. Add a Kinet.ink API key in the Admin panel.
                </div>
              )}
            </div>
          ) : (
            <div className="lw-panel">
              {appLogo && <img src={appLogo} alt="App Logo" className="lw-app-logo" />}

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

              <div className="lw-divider" style={{ margin: '1.5rem 0' }}>
                <div className="lw-divider-line"></div>
                <span className="lw-divider-text">or</span>
                <div className="lw-divider-line"></div>
              </div>

              <button onClick={() => handleOAuth('google')} className="lw-btn lw-btn-google" style={{ width: '100%', marginBottom: '0.75rem' }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Continue with Google
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <button disabled className="lw-btn lw-btn-apple" style={{ opacity: 0.4, cursor: 'not-allowed' }} title="Apple sign-in coming soon">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                  Apple
                </button>
                <button onClick={() => handleOAuth('discord')} className="lw-btn lw-btn-discord">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>
                  Discord
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <button onClick={() => handleOAuth('x')} className="lw-btn lw-btn-twitter">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  X
                </button>
                <button
                  onClick={() => {
                    const returnUrl = encodeURIComponent(window.location.origin + '/auth/wax-callback')
                    window.location.href = `https://www.mycloudwallet.com/login?returnUrl=${returnUrl}`
                  }}
                  className="lw-btn lw-btn-wax"
                >
                  <img src="/wax_cloud_wallet_logo.png" alt="Cloud Wallet" width="20" height="20" style={{ borderRadius: '3px' }} />
                  Cloud Wallet
                </button>
              </div>

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
          )}

          <p className="lw-footer-text" style={{ marginTop: '1.5rem' }}>
            By signing in, you agree to our{' '}
            <a href="/terms" className="lw-link">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="lw-link">Privacy Policy</a>
          </p>
        </div>

        {/* Character with chat bubble — only if side image exists */}
        {sideImg && <div className="lw-character-wrapper">
          {/* Chat bubble — sits above the character */}
          {!chatOpen && (
            <button
              onClick={() => setChatOpen(true)}
              className="lw-btn lw-btn-primary"
              style={{
                position: 'absolute',
                top: '-110px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'auto',
                padding: '0.5rem 1.25rem',
                fontSize: '0.85rem',
                lineHeight: '1.4',
                textAlign: 'center',
                zIndex: 20,
              }}
            >
              Chat with me<br />about<br />{appName || 'this game'}
              {/* Downward-pointing triangle — tall tail */}
              <div style={{
                position: 'absolute',
                bottom: '-16px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '8px solid transparent',
                borderRight: '8px solid transparent',
                borderTop: '16px solid var(--lw-purple)',
              }} />
            </button>
          )}
          <img
            src={sideImg}
            alt="Character"
            className="lw-character"
          />
        </div>}
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
