'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { WalletConnectPanel } from '@/lib/wallets/WalletConnectPanel'
import type { ConnectedWallet } from '@/lib/wallets/types'
import { shortenAddress } from '@/lib/wallets/types'
import { UserImageCircle } from '@/lib/components/UserImageCircle'
import { LwWalletPanel } from '@/lib/components/LwWalletPanel'
import { logAuth, logProfile } from '@/lib/audit'

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [savedWallets, setSavedWallets] = useState<ConnectedWallet[]>([])
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarIsVideo, setAvatarIsVideo] = useState(false)
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaEnrolling, setMfaEnrolling] = useState(false)
  const [mfaQrCode, setMfaQrCode] = useState<string | null>(null)
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [showBackupCodes, setShowBackupCodes] = useState(false)
  const [avatarOuterColor, setAvatarOuterColor] = useState('#000000')
  const [avatarInnerColor, setAvatarInnerColor] = useState('#000000')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatApiKey, setChatApiKey] = useState('')
  const [chatAppName, setChatAppName] = useState('')
  const [chatSideImg, setChatSideImg] = useState('')
  const [sidebarTop, setSidebarTop] = useState(0)
  const router = useRouter()
  const supabase = createClient()
  const STORAGE_BASE = 'https://wemmrhypldubdplaohli.supabase.co/storage/v1/object/public'

  // Convert hex to HSL for Kinet.ink
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

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)
      setUsername(user.user_metadata?.username || '')
      setDisplayName(user.user_metadata?.display_name || '')
      // Check role and avatar
      const { data: profile } = await supabase.from('profiles').select('role, avatar_url, avatar_outer_color, avatar_inner_color').eq('id', user.id).single()
      if (profile?.role === 'superadmin') setIsSuperadmin(true)
      if (profile?.avatar_url) {
        let avatarPath = profile.avatar_url
        // If the DB has a full URL instead of just a path, extract the path
        if (avatarPath.includes('supabase.co/')) {
          const match = avatarPath.match(/user_avatars\/(.+?)(\?|$)/)
          if (match) {
            avatarPath = match[1]
            // Fix the DB to store just the path
            await supabase.from('profiles').update({ avatar_url: avatarPath }).eq('id', user.id)
          }
        }
        setAvatarIsVideo(avatarPath.endsWith('.mp4'))
        const { data: signedData } = await supabase.storage.from('user_avatars').createSignedUrl(avatarPath, 604800)
        if (signedData?.signedUrl) {
          setAvatarUrl(signedData.signedUrl)
        }
      } else {
        // Fallback to social login avatar: Google > Discord > X
        const identities = user.identities || []
        const google = identities.find(i => i.provider === 'google')
        const discord = identities.find(i => i.provider === 'discord')
        const twitter = identities.find(i => i.provider === 'twitter')
        const socialAvatar =
          google?.identity_data?.avatar_url ||
          discord?.identity_data?.avatar_url ||
          twitter?.identity_data?.avatar_url ||
          user.user_metadata?.avatar_url ||
          null
        if (socialAvatar) {
          setAvatarUrl(socialAvatar)
          setAvatarIsVideo(false)
        }
      }
      if (profile?.avatar_outer_color) setAvatarOuterColor(profile.avatar_outer_color)
      if (profile?.avatar_inner_color) setAvatarInnerColor(profile.avatar_inner_color)
      // Check MFA status
      const { data: factors } = await supabase.auth.mfa.listFactors()
      if (factors?.totp && factors.totp.length > 0) {
        const verified = factors.totp.find(f => f.status === 'verified')
        if (verified) setMfaEnabled(true)
      }
      // Load saved wallets
      loadWallets(user.id)
      // Load first app with chat enabled
      const { data: chatApp } = await supabase.from('apps').select('name, chat_api_key, app_side_img').not('chat_api_key', 'is', null).limit(1).single()
      if (chatApp) {
        if (chatApp.chat_api_key) setChatApiKey(chatApp.chat_api_key)
        if (chatApp.name) setChatAppName(chatApp.name)
        if (chatApp.app_side_img) setChatSideImg(`${STORAGE_BASE}/app_side_image/${chatApp.app_side_img}`)
      }
      setLoading(false)
    }
    getUser()
  }, [])

  // Build user identity message for Kinet.ink chat iframe
  const buildUserIdentityMsg = useCallback(() => ({
    type: 'setUserIdentity',
    userId: user?.id || '',
    avatar: avatarUrl || '',
    user_avatar: avatarUrl || '',
    name: displayName || username || '',
    userName: displayName || username || '',
    email: user?.email || '',
    borderColor: avatarOuterColor !== '#000000' ? hexToHsl(avatarOuterColor) : '',
    userBorderColor: avatarOuterColor !== '#000000' ? hexToHsl(avatarOuterColor) : '',
    innerColor: avatarInnerColor !== '#000000' ? hexToHsl(avatarInnerColor) : '',
    userInnerColor: avatarInnerColor !== '#000000' ? hexToHsl(avatarInnerColor) : '',
    userColor: avatarOuterColor !== '#000000' ? hexToHsl(avatarOuterColor) : '',
  }), [user, avatarUrl, displayName, username, avatarOuterColor, avatarInnerColor])

  // Listen for ALL messages from the chat iframe and respond with user identity
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Log all iframe messages for debugging
      if (event.origin.includes('lovable.app') || event.origin.includes('kinet.ink')) {
        console.log('[SSO] Message from embed:', event.data)
        // Respond to ANY message from the embed with user identity
        const iframe = document.querySelector('iframe[title="Character Chat"]') as HTMLIFrameElement
        if (iframe?.contentWindow) {
          const msg = buildUserIdentityMsg()
          console.log('[SSO] Sending identity response:', { type: msg.type, hasAvatar: !!msg.avatar, name: msg.name, borderColor: msg.borderColor })
          iframe.contentWindow.postMessage(msg, '*')
        }
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [buildUserIdentityMsg])

  // Measure My Games section position for character sidebar alignment
  useEffect(() => {
    if (loading) return
    const measure = () => {
      const el = document.getElementById('my-games-section')
      const container = document.querySelector('.lw-account-container')
      if (el && container) {
        const elRect = el.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        setSidebarTop(elRect.top - containerRect.top)
      }
    }
    // Small delay to let layout settle
    const timer = setTimeout(measure, 100)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(timer); window.removeEventListener('resize', measure) }
  }, [loading])

  const loadWallets = useCallback(async (userId: string) => {
    const { data } = await supabase.from('connected_wallets').select('*').eq('user_id', userId)
    if (data) {
      setSavedWallets(data.map(w => ({
        chain: w.chain_type as ConnectedWallet['chain'],
        provider: w.wallet_provider,
        address: w.wallet_address,
        displayAddress: shortenAddress(w.wallet_address),
        chainName: w.chain_type === 'evm' ? 'EVM' : w.chain_type === 'solana' ? 'Solana' : 'WAX',
      })))
    }
  }, [supabase])

  const handleLogout = async () => {
    await logAuth(supabase, 'auth.logout', {
      user_id: user?.id,
      email: user?.email,
      username: user?.user_metadata?.username,
      description: 'User signed out',
    })
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleUpdateProfile = async () => {
    setSaving(true)
    setMessage('')
    const { error } = await supabase.auth.updateUser({
      data: {
        username: username.toLowerCase(),
        display_name: displayName,
      },
    })
    if (error) {
      setMessage('Error: ' + error.message)
    } else {
      setMessage('Profile updated!')
      await logProfile(supabase, 'profile.update', {
        user_id: user?.id,
        email: user?.email,
        username: username.toLowerCase(),
        description: `Updated username and display name`,
        metadata: { fields: ['username', 'display_name'], username: username.toLowerCase(), display_name: displayName },
      })
    }
    setSaving(false)
  }

  const handleChangePassword = async () => {
    const newPassword = prompt('Enter new password (8+ characters):')
    if (!newPassword || newPassword.length < 8) {
      alert('Password must be at least 8 characters.')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      alert('Error: ' + error.message)
    } else {
      await logAuth(supabase, 'auth.password.change', {
        user_id: user?.id,
        email: user?.email,
        username: user?.user_metadata?.username,
        description: 'Password changed',
      })
      alert('Password updated!')
    }
  }

  const connectProvider = async (provider: 'google' | 'discord' | 'apple' | 'twitter') => {
    await logAuth(supabase, 'auth.identity.link', {
      user_id: user?.id,
      email: user?.email,
      username: user?.user_metadata?.username,
      description: `Linked ${provider} login`,
      metadata: { provider },
    })
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/account`,
      },
    })
    if (error) alert('Error: ' + error.message)
  }

  if (loading) {
    return (
      <div className="lw-page">
        <p style={{ color: 'var(--lw-text-secondary)' }}>Loading...</p>
      </div>
    )
  }

  // Generate random backup codes
  const generateBackupCodes = (): string[] => {
    const codes: string[] = []
    for (let i = 0; i < 10; i++) {
      const arr = new Uint8Array(5)
      crypto.getRandomValues(arr)
      const code = Array.from(arr).map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 8).toUpperCase()
      codes.push(code.slice(0, 4) + '-' + code.slice(4))
    }
    return codes
  }

  // Hash a backup code with SHA-256
  const hashCode = async (code: string): Promise<string> => {
    const normalized = code.replace(/-/g, '').toUpperCase()
    const encoded = new TextEncoder().encode(normalized) as Uint8Array<ArrayBuffer>
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // Store hashed backup codes in DB
  const storeBackupCodes = async (codes: string[]) => {
    if (!user?.id) return
    const hashed = await Promise.all(codes.map(c => hashCode(c)))
    await supabase.from('profiles').update({ backup_codes: hashed }).eq('id', user.id)
  }

  // Regenerate backup codes
  const handleRegenerateBackupCodes = async () => {
    if (!confirm('This will invalidate all existing backup codes. Continue?')) return
    const codes = generateBackupCodes()
    await storeBackupCodes(codes)
    await logAuth(supabase, 'auth.mfa.backup.generate', {
      user_id: user?.id,
      email: user?.email,
      username: user?.user_metadata?.username,
      description: 'Regenerated backup codes',
      metadata: { count: 10 },
    })
    setBackupCodes(codes)
    setShowBackupCodes(true)
  }

  const identities = user?.identities || []
  const connectedProviders = identities.map(i => i.provider)

  return (
    <div className="lw-account-page">
      <div className="lw-account-page-inner">
        <div className="lw-account-container">

        <div className="lw-account-header">
          <h1 className="lw-heading-xl">My Account</h1>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {isSuperadmin && (
              <a href="/admin" className="lw-btn lw-btn-primary" style={{ width: 'auto', textDecoration: 'none', padding: '0.5rem 1.5rem' }}>
                Admin
              </a>
            )}
            <button onClick={handleLogout} className="lw-btn lw-btn-secondary" style={{ width: 'auto' }}>
              Sign Out
            </button>
          </div>
        </div>

        {/* Profile */}
        <div className="lw-section">
          <h2 className="lw-section-title">Profile</h2>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
            {/* Left — form fields */}
            <div className="lw-form" style={{ flex: 6 }}>
              <div>
                <label className="lw-row-label" style={{ display: 'block', marginBottom: '0.25rem' }}>Email</label>
                <p style={{ color: 'var(--lw-text-white)' }}>{user?.email}</p>
              </div>
              <div>
                <label className="lw-row-label" style={{ display: 'block', marginBottom: '0.25rem' }}>Username</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="lw-input" />
              </div>
              <div>
                <label className="lw-row-label" style={{ display: 'block', marginBottom: '0.25rem' }}>Display Name</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="lw-input" />
              </div>
              {message && <p className={message.startsWith('Error') ? 'lw-error' : 'lw-success'}>{message}</p>}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={handleUpdateProfile} disabled={saving} className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={handleChangePassword} className="lw-btn lw-btn-secondary">
                  Change Password
                </button>
              </div>
            </div>

            {/* Right — avatar circle */}
            <div style={{ flex: 4, display: 'flex', justifyContent: 'center' }}>
              <UserImageCircle
                diameter={180}
                initialImageUrl={avatarUrl}
                initialIsVideo={avatarIsVideo}
                initialOuterColor={avatarOuterColor}
                initialInnerColor={avatarInnerColor}
                onSave={async ({ file, outerColor, innerColor, panX, panY, zoom }) => {
                  let newAvatarUrl = avatarUrl
                  // Upload image if new file
                  if (file && user?.id) {
                    // Delete all old avatars for this user first
                    const { data: existingFiles } = await supabase.storage.from('user_avatars').list(user.id)
                    if (existingFiles && existingFiles.length > 0) {
                      const filesToDelete = existingFiles.map(f => `${user.id}/${f.name}`)
                      await supabase.storage.from('user_avatars').remove(filesToDelete)
                    }
                    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
                    const path = `${user.id}/avatar.${ext}`
                    const { error: upErr } = await supabase.storage.from('user_avatars').upload(path, file, { upsert: true, contentType: file.type })
                    if (upErr) {
                      console.error('Avatar upload error:', upErr)
                    } else {
                      await logProfile(supabase, 'profile.avatar.upload', {
                        user_id: user?.id,
                        email: user?.email,
                        username: user?.user_metadata?.username,
                        description: 'Uploaded new avatar image',
                        metadata: { file_type: file.type, file_ext: ext },
                      })
                      // Store just the path — we'll generate signed URLs on load
                      newAvatarUrl = path
                      // Also get a signed URL for immediate display
                      const { data: signedData } = await supabase.storage.from('user_avatars').createSignedUrl(path, 3600)
                      if (signedData?.signedUrl) {
                        setAvatarUrl(signedData.signedUrl)
                      }
                    }
                  }
                  // Save to profile
                  if (user?.id) {
                    const { error: profileErr } = await supabase.from('profiles').update({
                      avatar_url: newAvatarUrl,
                      avatar_outer_color: outerColor,
                      avatar_inner_color: innerColor,
                      avatar_pan_x: panX,
                      avatar_pan_y: panY,
                      avatar_zoom: zoom,
                    }).eq('id', user.id)
                    if (profileErr) {
                      console.error('Profile update error:', profileErr)
                      alert('Profile save failed: ' + profileErr.message)
                    } else {
                      console.log('Profile saved with avatar:', newAvatarUrl)
                      await logProfile(supabase, 'profile.avatar.save', {
                        user_id: user?.id,
                        email: user?.email,
                        username: user?.user_metadata?.username,
                        description: 'Saved avatar settings',
                        metadata: { outerColor, innerColor, panX, panY, zoom },
                      })
                    }
                    setAvatarUrl(newAvatarUrl)
                    setAvatarOuterColor(outerColor)
                    setAvatarInnerColor(innerColor)
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Connected Logins */}
        <div className="lw-section">
          <h2 className="lw-section-title">Connected Logins</h2>
          {[
            { id: 'google', name: 'Google', enabled: true, icon: (
              <svg width="24" height="24" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            )},
            { id: 'discord', name: 'Discord', enabled: true, icon: (
              <svg width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#5865F2"/><path d="M16.94 8.33a13.89 13.89 0 00-3.43-1.06.05.05 0 00-.06.03c-.15.26-.31.61-.43.88a12.84 12.84 0 00-3.86 0 8.87 8.87 0 00-.44-.88.05.05 0 00-.05-.03A13.84 13.84 0 005.24 8.33a.05.05 0 00-.02.02C3.34 11.15 2.8 13.89 3.07 16.6a.06.06 0 00.02.04 14 14 0 004.22 2.13.05.05 0 00.06-.02c.33-.44.62-.91.87-1.4a.05.05 0 00-.03-.07 9.21 9.21 0 01-1.32-.63.05.05 0 01-.01-.09c.09-.07.18-.14.26-.21a.05.05 0 01.05-.01c2.77 1.26 5.76 1.26 8.5 0a.05.05 0 01.06.01c.08.07.17.14.26.21a.05.05 0 010 .09c-.42.25-.86.46-1.32.63a.05.05 0 00-.03.07c.26.49.55.96.87 1.4a.05.05 0 00.06.02 13.95 13.95 0 004.22-2.13.05.05 0 00.02-.04c.32-3.34-.54-6.05-2.28-8.55a.04.04 0 00-.02-.02zM9.68 14.78c-.74 0-1.35-.68-1.35-1.52s.6-1.52 1.35-1.52c.76 0 1.36.69 1.35 1.52 0 .84-.6 1.52-1.35 1.52zm4.99 0c-.74 0-1.35-.68-1.35-1.52s.6-1.52 1.35-1.52c.76 0 1.36.69 1.35 1.52 0 .84-.59 1.52-1.35 1.52z" fill="white"/></svg>
            )},
            { id: 'apple', name: 'Apple', enabled: false, icon: (
              <svg width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#000"/><path d="M16.37 15.71c-.38.84-.56 1.22-.94 1.97-.53 1.05-1.27 2.36-2.19 2.37-.82.01-1.03-.53-2.14-.53-1.11 0-1.34.52-2.12.55-.89.03-1.56-1.27-2.09-2.32-1.49-2.93-1.64-6.37-.72-8.2.65-1.28 1.67-2.03 2.62-2.03 1 0 1.62.53 2.44.53.8 0 1.28-.53 2.43-.53.84 0 1.74.46 2.39 1.24-2.1 1.15-1.76 4.15.32 4.95zM13.43 5.77c.4-.51.71-1.24.6-1.97-.66.05-1.44.46-1.89 1-.41.47-.75 1.21-.62 1.92.72.02 1.47-.4 1.91-.95z" fill="white"/></svg>
            )},
            { id: 'twitter', name: 'X / Twitter', enabled: true, icon: (
              <svg width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#000"/><path d="M15.72 5.5h2.07l-4.52 5.16L18.5 18.5h-4.16l-3.27-4.27L7.47 18.5H5.4l4.83-5.52L5.16 5.5h4.27l2.95 3.9L15.72 5.5zm-.73 11.67h1.15L8.72 6.68H7.49l7.5 10.49z" fill="white"/></svg>
            )},
          ].map(({ id, name, enabled, icon }) => (
            <div key={id} className="lw-row" style={{ backgroundColor: 'var(--lw-wallet-row-bg)', borderRadius: 'var(--lw-radius-sm)', padding: '0.75rem', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {icon}
                <span className="lw-row-value">{name}</span>
              </div>
              {connectedProviders.includes(id) ? (
                <button className="lw-btn" style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem', backgroundColor: 'rgb(62, 45, 107)', color: '#ccc', cursor: 'default', minWidth: '100px' }}>
                  Linked
                </button>
              ) : !enabled ? (
                <button className="lw-btn" style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem', backgroundColor: '#3a3938', color: '#666', cursor: 'not-allowed', minWidth: '100px', opacity: 0.5 }}>
                  Disabled
                </button>
              ) : (
                <button onClick={() => connectProvider(id as 'google' | 'discord' | 'apple' | 'twitter')} className="lw-btn lw-btn-connect" style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem', minWidth: '100px' }}>
                  Connect
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Connected Wallets */}
        <div className="lw-section">
          <h2 className="lw-section-title">Connected Wallets</h2>
          <WalletConnectPanel
            userId={user?.id || ''}
            savedWallets={savedWallets}
            onWalletSaved={() => user?.id && loadWallets(user.id)}
          />
        </div>


        {/* My Games */}
        <div className="lw-section" id="my-games-section">
          <h2 className="lw-section-title">My Games</h2>
          <div style={{ backgroundColor: 'var(--lw-wallet-row-bg)', borderRadius: 'var(--lw-radius-sm)', padding: '0.75rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <img src="/siege_worlds_game_logo_800px.webp" alt="Siege Worlds" style={{ height: '32px' }} />
              <div>
                <p className="lw-game-title">Siege Worlds</p>
                <p className="lw-game-subtitle">Horde Shooter</p>
              </div>
            </div>
            <a href="https://www.siegeworlds.com" target="_blank" className="lw-link" style={{ fontSize: '0.875rem' }}>
              Play →
            </a>
          </div>
          <div style={{ backgroundColor: 'var(--lw-wallet-row-bg)', borderRadius: 'var(--lw-radius-sm)', padding: '0.75rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <img src="/starblind_game_logo_800px.webp" alt="Starblind" style={{ height: '32px' }} />
              <div>
                <p className="lw-game-title">Starblind</p>
                <p className="lw-game-subtitle">Comic Series</p>
              </div>
            </div>
            <a href="https://starblind.io" target="_blank" className="lw-link" style={{ fontSize: '0.875rem' }}>
              View →
            </a>
          </div>
          <div style={{ backgroundColor: 'var(--lw-wallet-row-bg)', borderRadius: 'var(--lw-radius-sm)', padding: '0.75rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a7572', fontSize: '0.7rem' }}>?</div>
              <div>
                <p className="lw-game-title">Dreadroot</p>
                <p className="lw-game-subtitle">Coming Soon</p>
              </div>
            </div>
            <span className="lw-footer-text">Coming Soon</span>
          </div>
        </div>

        {/* LightningWorks Wallet */}
        {savedWallets.length > 0 && (
          <LwWalletPanel walletAddresses={savedWallets.map(w => w.address)} />
        )}

        {/* Security */}
        <div className="lw-section">
          <h2 className="lw-section-title">Security</h2>

          {/* 2FA Status */}
          <div style={{ backgroundColor: 'var(--lw-wallet-row-bg)', borderRadius: 'var(--lw-radius-sm)', padding: '0.75rem', marginBottom: '0.75rem' }}>
            <div className="lw-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill={mfaEnabled ? '#34A853' : '#4285F4'}/><path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm-1.06 14.54L7.4 13l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41-5.64 5.66z" fill="white"/></svg>
                <div>
                  <span className="lw-row-value">Two-Factor Authentication</span>
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: '2px 0 0 0' }}>
                    {mfaEnabled ? 'Enabled — your account is protected' : 'Add extra security with Google Authenticator'}
                  </p>
                </div>
              </div>
              {mfaEnabled ? (
                <button
                  onClick={async () => {
                    if (!confirm('Disable 2FA? Your account will be less secure.')) return
                    const { data: factors } = await supabase.auth.mfa.listFactors()
                    const factor = factors?.totp?.find(f => f.status === 'verified')
                    if (factor) {
                      await supabase.auth.mfa.unenroll({ factorId: factor.id })
                      await logAuth(supabase, 'auth.mfa.disable', {
                        user_id: user?.id,
                        email: user?.email,
                        username: user?.user_metadata?.username,
                        description: 'Disabled two-factor authentication',
                      })
                      setMfaEnabled(false)
                    }
                  }}
                  className="lw-btn lw-btn-connect"
                  style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem' }}
                >
                  Disable
                </button>
              ) : (
                <button
                  onClick={async () => {
                    setMfaError('')
                    setMfaEnrolling(true)
                    const { data, error } = await supabase.auth.mfa.enroll({
                      factorType: 'totp',
                      friendlyName: 'Google Authenticator',
                    })
                    if (error) {
                      setMfaError(error.message)
                      setMfaEnrolling(false)
                    } else if (data) {
                      setMfaQrCode(data.totp.qr_code)
                      setMfaSecret(data.totp.secret)
                      setMfaFactorId(data.id)
                    }
                  }}
                  className="lw-btn lw-btn-connect"
                  style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem' }}
                >
                  Enable 2FA
                </button>
              )}
            </div>

            {/* Backup codes display — shown after enrollment or regeneration */}
            {showBackupCodes && backupCodes && (
              <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(255,136,0,0.08)', borderRadius: 'var(--lw-radius-sm)' }}>
                <p style={{ color: '#ff8800', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Save Your Backup Codes
                </p>
                <p style={{ color: 'var(--lw-text-secondary)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                  Each code can only be used once. Store them somewhere safe — you won&apos;t be able to see them again.
                </p>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1.5rem',
                  backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: '4px',
                  fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--lw-text-primary)',
                  marginBottom: '0.75rem'
                }}>
                  {backupCodes.map((code, i) => (
                    <div key={i} style={{ padding: '0.15rem 0' }}>{code}</div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(backupCodes.join('\n'))
                    }}
                    className="lw-btn lw-btn-connect"
                    style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.8rem' }}
                  >
                    Copy All
                  </button>
                  <button
                    onClick={() => {
                      const text = `LightningWorks SSO - 2FA Backup Codes\nGenerated: ${new Date().toISOString()}\n\n${backupCodes.join('\n')}\n\nEach code can only be used once.`
                      const blob = new Blob([text], { type: 'text/plain' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'lw-backup-codes.txt'
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                    className="lw-btn lw-btn-connect"
                    style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.8rem' }}
                  >
                    Download
                  </button>
                  <button
                    onClick={() => setShowBackupCodes(false)}
                    className="lw-btn lw-btn-connect"
                    style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.8rem' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* Regenerate backup codes button — only when 2FA is enabled and codes are not showing */}
            {mfaEnabled && !mfaEnrolling && !showBackupCodes && (
              <div style={{ marginTop: '0.5rem' }}>
                <button
                  onClick={handleRegenerateBackupCodes}
                  className="lw-btn lw-btn-connect"
                  style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.8rem' }}
                >
                  Regenerate Backup Codes
                </button>
              </div>
            )}

            {/* Enrollment flow */}
            {mfaEnrolling && mfaQrCode && (
              <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(106,36,250,0.1)', borderRadius: 'var(--lw-radius-sm)' }}>
                <p style={{ color: 'var(--lw-text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  Scan this QR code with Google Authenticator, Authy, or any TOTP app:
                </p>

                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {/* QR Code */}
                  <div style={{ backgroundColor: '#fff', padding: '8px', borderRadius: '8px', flexShrink: 0 }}>
                    <img src={mfaQrCode} alt="2FA QR Code" width="180" height="180" />
                  </div>

                  <div style={{ flex: 1, minWidth: '200px' }}>
                    {/* Secret key */}
                    <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                      Can&apos;t scan? Enter this key manually:
                    </p>
                    <code style={{
                      display: 'block', backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem',
                      borderRadius: '4px', color: 'var(--lw-text-primary)', fontSize: '0.8rem',
                      wordBreak: 'break-all', marginBottom: '1rem', fontFamily: 'monospace',
                      userSelect: 'all', cursor: 'text'
                    }}>
                      {mfaSecret}
                    </code>

                    {/* Verification code input */}
                    <p style={{ color: 'var(--lw-text-secondary)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                      Enter the 6-digit code from your authenticator app:
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        value={mfaCode}
                        onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                        className="lw-input"
                        style={{
                          backgroundColor: 'rgb(26,17,46)', color: '#bab1a8',
                          width: '120px', textAlign: 'center', fontSize: '1.2rem',
                          letterSpacing: '0.3rem', fontFamily: 'monospace'
                        }}
                      />
                      <button
                        onClick={async () => {
                          setMfaError('')
                          if (mfaCode.length !== 6 || !mfaFactorId) return

                          const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId })
                          if (challengeErr) { setMfaError(challengeErr.message); return }

                          const { error: verifyErr } = await supabase.auth.mfa.verify({
                            factorId: mfaFactorId,
                            challengeId: challenge.id,
                            code: mfaCode,
                          })
                          if (verifyErr) {
                            setMfaError('Invalid code. Try again.')
                          } else {
                            // Generate and store backup codes
                            const codes = generateBackupCodes()
                            await storeBackupCodes(codes)
                            await logAuth(supabase, 'auth.mfa.enable', {
                              user_id: user?.id,
                              email: user?.email,
                              username: user?.user_metadata?.username,
                              description: 'Enabled two-factor authentication',
                            })
                            await logAuth(supabase, 'auth.mfa.backup.generate', {
                              user_id: user?.id,
                              email: user?.email,
                              username: user?.user_metadata?.username,
                              description: 'Generated 10 backup codes during 2FA setup',
                              metadata: { count: 10 },
                            })
                            setBackupCodes(codes)
                            setShowBackupCodes(true)
                            setMfaEnabled(true)
                            setMfaEnrolling(false)
                            setMfaQrCode(null)
                            setMfaSecret(null)
                            setMfaCode('')
                          }
                        }}
                        className="lw-btn lw-btn-primary"
                        style={{ width: 'auto', padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                      >
                        Verify
                      </button>
                    </div>
                    {mfaError && <p style={{ color: 'var(--lw-error)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{mfaError}</p>}

                    {/* Save secret key notice */}
                    <div style={{ marginTop: '1rem', padding: '0.5rem', backgroundColor: 'rgba(255,136,0,0.1)', borderRadius: '4px' }}>
                      <p style={{ color: '#ff8800', fontSize: '0.75rem', margin: 0 }}>
                        Save your secret key above. After verification, you&apos;ll also receive 10 one-time backup codes.
                      </p>
                    </div>

                    {/* Cancel */}
                    <button
                      onClick={() => {
                        setMfaEnrolling(false)
                        setMfaQrCode(null)
                        setMfaSecret(null)
                        setMfaCode('')
                        setMfaError('')
                        // Unenroll the pending factor
                        if (mfaFactorId) supabase.auth.mfa.unenroll({ factorId: mfaFactorId })
                      }}
                      className="lw-btn lw-btn-connect"
                      style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.8rem', marginTop: '0.75rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lw-row">
            <span className="lw-row-label">Account Created</span>
            <span className="lw-row-value">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</span>
          </div>
          <div className="lw-row">
            <span className="lw-row-label">Last Sign In</span>
            <span className="lw-row-value">{user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown'}</span>
          </div>
        </div>

        <div className="lw-footer-links" style={{ paddingBottom: '2rem' }}>
          <p className="lw-footer-text">
            <a href="/terms" className="lw-link">Terms of Service</a>
            {' · '}
            <a href="/privacy" className="lw-link">Privacy Policy</a>
            {' · '}
            LightningWorks © {new Date().getFullYear()}
          </p>
        </div>

      </div>

      {/* Character sidebar — right side, aligned with My Games */}
      {chatSideImg && chatApiKey && (
        <div className="lw-account-character-sidebar" style={{ paddingTop: sidebarTop ? `${sidebarTop}px` : '620px' }}>
          <div style={{ position: 'sticky', top: '2rem' }}>
            {/* Chat bubble above character */}
            {!chatOpen && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', position: 'relative', marginLeft: '-25px' }}>
                <button
                  onClick={() => {
                    console.log('Chat user data:', { avatarUrl: avatarUrl?.slice(0, 100), displayName, username, outerColor: avatarOuterColor, innerColor: avatarInnerColor })
                    setChatOpen(true)
                  }}
                  className="lw-btn lw-btn-primary"
                  style={{
                    width: 'auto',
                    padding: '0.5rem 1.25rem',
                    fontSize: '0.85rem',
                    lineHeight: '1.4',
                    textAlign: 'center',
                  }}
                >
                  Chat with me<br />about<br />{chatAppName || 'this game'}
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
              </div>
            )}
            {/* Character image */}
            <img
              src={chatSideImg}
              alt="Character"
              style={{ maxHeight: 'var(--lw-character-max-height)', objectFit: 'contain', display: 'block', marginLeft: '-55px' }}
            />
          </div>
        </div>
      )}

      {/* Chat panel overlay */}
      {chatOpen && chatApiKey && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
        }}
          onClick={(e) => { if (e.target === e.currentTarget) setChatOpen(false) }}
        >
          <div className="lw-panel" style={{
            padding: 0, overflow: 'hidden', position: 'relative',
            width: '420px', maxWidth: '95vw',
          }}>
            <button
              onClick={() => setChatOpen(false)}
              style={{
                position: 'absolute', top: '8px', right: '8px', zIndex: 10,
                background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff',
                width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem', lineHeight: 1,
              }}
            >
              ✕
            </button>
            <iframe
              src={`https://fairytime.lovable.app/embed/chat?key=${chatApiKey}&bg=1a112e&accent=6a24fa&header=false${user?.id ? `&user_id=${encodeURIComponent(user.id)}` : ''}${displayName || username ? `&userName=${encodeURIComponent(displayName || username)}` : ''}`}
              style={{ width: '100%', height: '650px', border: 'none', display: 'block' }}
              allow="clipboard-write"
              title="Character Chat"
              onLoad={(e) => {
                const iframe = e.target as HTMLIFrameElement
                const msg = buildUserIdentityMsg()
                // Send immediately and retry a few times in case embed isn't ready
                const send = () => {
                  console.log('[SSO] Sending identity on load/retry:', { type: msg.type, hasAvatar: !!msg.avatar, name: msg.name })
                  iframe.contentWindow?.postMessage(msg, '*')
                }
                send()
                setTimeout(send, 500)
                setTimeout(send, 1500)
                setTimeout(send, 3000)
              }}
            />
          </div>
        </div>
      )}
    </div>
    </div>
  )
}
