'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
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
      setLoading(false)
    }
    getUser()
  }, [])

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
      <div className="min-h-screen bg-[#0c0b0b] flex items-center justify-center">
        <p className="text-[#bab1a8]">Loading...</p>
      </div>
    )
  }

  const identities = user?.identities || []
  const connectedProviders = identities.map(i => i.provider)

  return (
    <div className="min-h-screen bg-[#0c0b0b] p-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 pt-8">
          <h1 className="text-4xl font-bold text-white font-['Bebas_Neue'] tracking-wide">
            My Account
          </h1>
          <button
            onClick={handleLogout}
            className="text-[#7a7572] hover:text-white transition text-sm"
          >
            Sign Out
          </button>
        </div>

        {/* Profile Section */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 border border-[#4c4946] mb-6">
          <h2 className="text-2xl font-bold text-white font-['Bebas_Neue'] mb-4">Profile</h2>

          <div className="space-y-4">
            <div>
              <label className="text-[#bab1a8] text-sm block mb-1">Email</label>
              <p className="text-white">{user?.email}</p>
            </div>

            <div>
              <label className="text-[#bab1a8] text-sm block mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#2a2928] text-[#e4dad1] border border-[#4c4946] rounded px-4 py-2 focus:border-[#6a24fa] focus:outline-none transition"
              />
            </div>

            <div>
              <label className="text-[#bab1a8] text-sm block mb-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-[#2a2928] text-[#e4dad1] border border-[#4c4946] rounded px-4 py-2 focus:border-[#6a24fa] focus:outline-none transition"
              />
            </div>

            {message && (
              <p className={`text-sm ${message.startsWith('Error') ? 'text-red-500' : 'text-green-500'}`}>
                {message}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleUpdateProfile}
                disabled={saving}
                className="bg-[#6a24fa] text-white py-2 px-6 rounded font-medium hover:bg-[#7f4ae8] transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={handleChangePassword}
                className="bg-[#2a2928] text-[#e4dad1] py-2 px-6 rounded font-medium hover:bg-[#3a3938] transition border border-[#4c4946]"
              >
                Change Password
              </button>
            </div>
          </div>
        </div>

        {/* Connected Logins */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 border border-[#4c4946] mb-6">
          <h2 className="text-2xl font-bold text-white font-['Bebas_Neue'] mb-4">Connected Logins</h2>

          <div className="space-y-3">
            {[
              { id: 'google', name: 'Google', color: 'bg-white text-black' },
              { id: 'discord', name: 'Discord', color: 'bg-[#5865F2] text-white' },
              { id: 'apple', name: 'Apple', color: 'bg-black text-white border border-[#4c4946]' },
              { id: 'twitter', name: 'X / Twitter', color: 'bg-[#1a1a1a] text-white border border-[#4c4946]' },
            ].map(({ id, name, color }) => (
              <div key={id} className="flex items-center justify-between">
                <span className="text-[#e4dad1]">{name}</span>
                {connectedProviders.includes(id) ? (
                  <span className="text-green-500 text-sm">✓ Connected</span>
                ) : (
                  <button
                    onClick={() => connectProvider(id as 'google' | 'discord' | 'apple' | 'twitter')}
                    className={`py-1 px-4 rounded text-sm font-medium ${color} hover:opacity-80 transition`}
                  >
                    Connect
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Connected Wallets */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 border border-[#4c4946] mb-6">
          <h2 className="text-2xl font-bold text-white font-['Bebas_Neue'] mb-4">Connected Wallets</h2>

          <div className="space-y-3">
            {[
              { id: 'metamask', name: 'MetaMask (EVM)', chain: 'evm' },
              { id: 'phantom', name: 'Phantom (Solana)', chain: 'solana' },
              { id: 'solflare', name: 'Solflare (Solana)', chain: 'solana' },
              { id: 'divigo', name: 'DiviGo Wallet', chain: 'divi' },
            ].map(({ id, name }) => (
              <div key={id} className="flex items-center justify-between">
                <span className="text-[#e4dad1]">{name}</span>
                <button
                  className="py-1 px-4 rounded text-sm font-medium bg-[#2a2928] text-[#bab1a8] border border-[#4c4946] hover:border-[#6a24fa] hover:text-white transition"
                >
                  Connect
                </button>
              </div>
            ))}
          </div>
          <p className="text-[#7a7572] text-xs mt-4">Wallet connections coming soon.</p>
        </div>

        {/* My Games */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 border border-[#4c4946] mb-6">
          <h2 className="text-2xl font-bold text-white font-['Bebas_Neue'] mb-4">My Games</h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-[#2a2928] rounded">
              <div>
                <p className="text-white font-medium">Siege Worlds</p>
                <p className="text-[#7a7572] text-sm">Horde Shooter</p>
              </div>
              <a href="https://www.siegeworlds.com" target="_blank" className="text-[#6a24fa] text-sm hover:text-[#7f4ae8]">
                Play →
              </a>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#2a2928] rounded opacity-50">
              <div>
                <p className="text-white font-medium">Dreadroot</p>
                <p className="text-[#7a7572] text-sm">Coming Soon</p>
              </div>
              <span className="text-[#7a7572] text-sm">Coming Soon</span>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 border border-[#4c4946] mb-6">
          <h2 className="text-2xl font-bold text-white font-['Bebas_Neue'] mb-4">Security</h2>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[#bab1a8]">Two-Factor Authentication</span>
              <span className="text-[#7a7572]">Coming soon</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#bab1a8]">Account Created</span>
              <span className="text-[#e4dad1]">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#bab1a8]">Last Sign In</span>
              <span className="text-[#e4dad1]">{user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'Unknown'}</span>
            </div>
          </div>
        </div>

        <p className="text-center text-[#7a7572] text-xs pb-8">
          <a href="/terms" className="text-[#6a24fa]">Terms of Service</a>
          {' · '}
          <a href="/privacy" className="text-[#6a24fa]">Privacy Policy</a>
          {' · '}
          LightningWorks © {new Date().getFullYear()}
        </p>

      </div>
    </div>
  )
}
