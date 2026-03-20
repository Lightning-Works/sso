'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { WalletConnectPanel } from '@/lib/wallets/WalletConnectPanel'
import type { ConnectedWallet } from '@/lib/wallets/types'
import { shortenAddress } from '@/lib/wallets/types'
import { UserImageCircle } from '@/lib/components/UserImageCircle'

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
  const [avatarOuterColor, setAvatarOuterColor] = useState('#000000')
  const [avatarInnerColor, setAvatarInnerColor] = useState('#000000')
  const router = useRouter()
  const supabase = createClient()

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
      if (profile?.avatar_url) setAvatarUrl(profile.avatar_url)
      if (profile?.avatar_outer_color) setAvatarOuterColor(profile.avatar_outer_color)
      if (profile?.avatar_inner_color) setAvatarInnerColor(profile.avatar_inner_color)
      // Load saved wallets
      loadWallets(user.id)
      setLoading(false)
    }
    getUser()
  }, [])

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
      alert('Password updated!')
    }
  }

  const connectProvider = async (provider: 'google' | 'discord' | 'apple' | 'twitter') => {
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

  const identities = user?.identities || []
  const connectedProviders = identities.map(i => i.provider)

  return (
    <div className="lw-account-page">
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
            <div className="lw-form" style={{ flex: 1 }}>
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
            <div style={{ flexShrink: 0 }}>
              <UserImageCircle
                diameter={180}
                initialImageUrl={avatarUrl}
                initialOuterColor={avatarOuterColor}
                initialInnerColor={avatarInnerColor}
                onSave={async ({ file, outerColor, innerColor, panX, panY, zoom }) => {
                  let newAvatarUrl = avatarUrl
                  // Upload image if new file
                  if (file && user?.id) {
                    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
                    const path = `${user.id}/avatar.${ext}`
                    const { error: upErr } = await supabase.storage.from('user-avatars').upload(path, file, { upsert: true })
                    if (!upErr) {
                      newAvatarUrl = `https://wemmrhypldubdplaohli.supabase.co/storage/v1/object/public/user-avatars/${path}`
                    }
                  }
                  // Save to profile
                  if (user?.id) {
                    await supabase.from('profiles').update({
                      avatar_url: newAvatarUrl,
                      avatar_outer_color: outerColor,
                      avatar_inner_color: innerColor,
                      avatar_pan_x: panX,
                      avatar_pan_y: panY,
                      avatar_zoom: zoom,
                    }).eq('id', user.id)
                    setAvatarUrl(newAvatarUrl)
                    setAvatarOuterColor(outerColor)
                    setAvatarInnerColor(innerColor)
                    setMessage('Avatar saved!')
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
            { id: 'google', name: 'Google', icon: (
              <svg width="24" height="24" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            )},
            { id: 'discord', name: 'Discord', icon: (
              <svg width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#5865F2"/><path d="M16.94 8.33a13.89 13.89 0 00-3.43-1.06.05.05 0 00-.06.03c-.15.26-.31.61-.43.88a12.84 12.84 0 00-3.86 0 8.87 8.87 0 00-.44-.88.05.05 0 00-.05-.03A13.84 13.84 0 005.24 8.33a.05.05 0 00-.02.02C3.34 11.15 2.8 13.89 3.07 16.6a.06.06 0 00.02.04 14 14 0 004.22 2.13.05.05 0 00.06-.02c.33-.44.62-.91.87-1.4a.05.05 0 00-.03-.07 9.21 9.21 0 01-1.32-.63.05.05 0 01-.01-.09c.09-.07.18-.14.26-.21a.05.05 0 01.05-.01c2.77 1.26 5.76 1.26 8.5 0a.05.05 0 01.06.01c.08.07.17.14.26.21a.05.05 0 010 .09c-.42.25-.86.46-1.32.63a.05.05 0 00-.03.07c.26.49.55.96.87 1.4a.05.05 0 00.06.02 13.95 13.95 0 004.22-2.13.05.05 0 00.02-.04c.32-3.34-.54-6.05-2.28-8.55a.04.04 0 00-.02-.02zM9.68 14.78c-.74 0-1.35-.68-1.35-1.52s.6-1.52 1.35-1.52c.76 0 1.36.69 1.35 1.52 0 .84-.6 1.52-1.35 1.52zm4.99 0c-.74 0-1.35-.68-1.35-1.52s.6-1.52 1.35-1.52c.76 0 1.36.69 1.35 1.52 0 .84-.59 1.52-1.35 1.52z" fill="white"/></svg>
            )},
            { id: 'apple', name: 'Apple', icon: (
              <svg width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#000"/><path d="M16.37 15.71c-.38.84-.56 1.22-.94 1.97-.53 1.05-1.27 2.36-2.19 2.37-.82.01-1.03-.53-2.14-.53-1.11 0-1.34.52-2.12.55-.89.03-1.56-1.27-2.09-2.32-1.49-2.93-1.64-6.37-.72-8.2.65-1.28 1.67-2.03 2.62-2.03 1 0 1.62.53 2.44.53.8 0 1.28-.53 2.43-.53.84 0 1.74.46 2.39 1.24-2.1 1.15-1.76 4.15.32 4.95zM13.43 5.77c.4-.51.71-1.24.6-1.97-.66.05-1.44.46-1.89 1-.41.47-.75 1.21-.62 1.92.72.02 1.47-.4 1.91-.95z" fill="white"/></svg>
            )},
            { id: 'twitter', name: 'X / Twitter', icon: (
              <svg width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#000"/><path d="M15.72 5.5h2.07l-4.52 5.16L18.5 18.5h-4.16l-3.27-4.27L7.47 18.5H5.4l4.83-5.52L5.16 5.5h4.27l2.95 3.9L15.72 5.5zm-.73 11.67h1.15L8.72 6.68H7.49l7.5 10.49z" fill="white"/></svg>
            )},
          ].map(({ id, name, icon }) => (
            <div key={id} className="lw-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {icon}
                <span className="lw-row-value">{name}</span>
              </div>
              {connectedProviders.includes(id) ? (
                <span className="lw-connected">✓ Connected</span>
              ) : (
                <button onClick={() => connectProvider(id as 'google' | 'discord' | 'apple' | 'twitter')} className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem' }}>
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
        <div className="lw-section">
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

        {/* Security */}
        <div className="lw-section">
          <h2 className="lw-section-title">Security</h2>
          <div className="lw-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#4285F4"/><path d="M12 6a6 6 0 100 12 6 6 0 000-12zm0 10.5a4.5 4.5 0 110-9 4.5 4.5 0 010 9zm2.25-4.5H12.75V9.75h-1.5V12H9.75v1.5h1.5v2.25h1.5V13.5h1.5V12z" fill="white"/></svg>
              <span className="lw-row-label">Two-Factor Authentication (Google Authenticator)</span>
            </div>
            <button
              onClick={() => {
                // TODO: Implement TOTP enrollment via Supabase
                // supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Google Authenticator' })
                alert('2FA setup will be available soon. This will use Google Authenticator.')
              }}
              className="lw-btn"
              style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem', backgroundColor: '#3a3938', color: '#e4dad1', cursor: 'pointer' }}
            >
              Enable 2FA
            </button>
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
    </div>
  )
}
