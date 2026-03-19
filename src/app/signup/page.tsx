'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

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

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (username.length < 2 || username.length > 15) {
      setError('Username must be 2-15 characters.')
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.toLowerCase(),
          display_name: username,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#0c0b0b] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-4xl font-bold text-white font-['Bebas_Neue'] mb-4">Check Your Email</h1>
          <p className="text-[#bab1a8]">
            We&apos;ve sent a confirmation link to <strong className="text-white">{email}</strong>.
            Click the link to verify your account.
          </p>
          <a href="/login" className="inline-block mt-6 bg-[#6a24fa] text-white py-3 px-8 rounded font-medium hover:bg-[#7f4ae8] transition">
            Back to Sign In
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0c0b0b] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white font-['Bebas_Neue'] tracking-wide">
            LightningWorks
          </h1>
          <p className="text-[#bab1a8] mt-2">Create your account</p>
        </div>

        <div className="bg-[#1a1a1a] rounded-lg p-8 border border-[#4c4946]">
          <form onSubmit={handleSignup} className="space-y-4">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[#2a2928] text-[#e4dad1] border border-[#4c4946] rounded px-4 py-3 focus:border-[#6a24fa] focus:outline-none transition"
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#2a2928] text-[#e4dad1] border border-[#4c4946] rounded px-4 py-3 focus:border-[#6a24fa] focus:outline-none transition"
              required
            />
            <input
              type="password"
              placeholder="Password (8+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#2a2928] text-[#e4dad1] border border-[#4c4946] rounded px-4 py-3 focus:border-[#6a24fa] focus:outline-none transition"
              required
            />
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-[#2a2928] text-[#e4dad1] border border-[#4c4946] rounded px-4 py-3 focus:border-[#6a24fa] focus:outline-none transition"
              required
            />

            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#6a24fa] text-white py-3 px-4 rounded font-medium hover:bg-[#7f4ae8] transition disabled:opacity-50"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-[#7a7572] text-sm mt-6">
            Already have an account?{' '}
            <a href="/login" className="text-[#6a24fa] hover:text-[#7f4ae8]">
              Sign in
            </a>
          </p>
        </div>

        <p className="text-center text-[#7a7572] text-xs mt-6">
          By creating an account, you agree to our{' '}
          <a href="/terms" className="text-[#6a24fa]">Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" className="text-[#6a24fa]">Privacy Policy</a>
        </p>
      </div>
    </div>
  )
}
