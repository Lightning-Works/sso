'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ApiDocsPage() {
  const [loading, setLoading] = useState(true)
  const [baseUrl, setBaseUrl] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!profile || profile.role !== 'superadmin') { router.push('/account'); return }
      setBaseUrl(window.location.origin)
      setLoading(false)
    }
    check()
  }, [])

  if (loading) return <div className="lw-page"><p className="lw-subtitle">Loading...</p></div>

  const endpoints = [
    {
      method: 'POST',
      path: '/api/verify',
      title: 'Verify User Token',
      description: 'Validates a JWT token from the SSO login and returns the user\'s profile. This is the primary endpoint games use to verify authentication.',
      request: `{
  "token": "eyJhbGciOi..."
}`,
      response: `{
  "valid": true,
  "user": {
    "id": "uuid",
    "email": "player@email.com",
    "username": "gandalfskywalker",
    "display_name": "GandalfSkywalker",
    "role": "user",
    "avatar_url": null,
    "created_at": "2026-03-19T...",
    "last_sign_in": "2026-03-19T..."
  }
}`,
      errors: '401 — Invalid or expired token',
    },
    {
      method: 'GET',
      path: '/api/user/profile?username=xxx',
      title: 'Get User Profile',
      description: 'Returns public profile information for a user. Can look up by username or user ID.',
      request: 'Query params: username=xxx or id=uuid',
      response: `{
  "user": {
    "id": "uuid",
    "username": "gandalfskywalker",
    "display_name": "GandalfSkywalker",
    "avatar_url": null,
    "created_at": "2026-03-19T..."
  }
}`,
      errors: '404 — User not found',
    },
    {
      method: 'GET',
      path: '/api/user/wallets?username=xxx',
      title: 'Get User Wallets',
      description: 'Returns all connected wallet addresses for a user across all chains (EVM, Solana, WAX).',
      request: 'Query params: username=xxx or id=uuid',
      response: `{
  "user_id": "uuid",
  "count": 3,
  "wallets": [
    {
      "chain_type": "evm",
      "wallet_provider": "metamask",
      "wallet_address": "0x1a2b...3c4d",
      "connected_at": "2026-03-19T..."
    },
    {
      "chain_type": "solana",
      "wallet_provider": "phantom",
      "wallet_address": "7Xf2...9kL",
      "connected_at": "2026-03-19T..."
    }
  ]
}`,
      errors: '403 — Not authorized to view this user\'s wallets\n404 — User not found',
    },
    {
      method: 'GET',
      path: '/api/user/balances?username=xxx',
      title: 'Get User Balances',
      description: 'Returns live token balances across all connected wallets. Fetches from Helius (Solana), Alchemy (EVM), and WAX RPC. May take 2-5 seconds for multiple wallets.',
      request: 'Query params: username=xxx or id=uuid',
      response: `{
  "user_id": "uuid",
  "wallets": 2,
  "balances": [
    {
      "symbol": "SOL",
      "name": "Solana",
      "balance": "12.5000",
      "chain": "solana",
      "wallet_address": "7Xf2...9kL",
      "token_address": null
    },
    {
      "symbol": "USDC",
      "name": "USD Coin (Ethereum)",
      "balance": "150.00",
      "chain": "evm",
      "wallet_address": "0x1a2b...3c4d",
      "token_address": "0xA0b8..."
    }
  ]
}`,
      errors: '403 — Not authorized\n404 — User not found',
    },
  ]

  return (
    <div className="lw-account-page">
      <div className="lw-account-container" style={{ maxWidth: '56rem' }}>

        <div className="lw-account-header">
          <h1 className="lw-heading-xl">API Documentation</h1>
          <a href="/admin" className="lw-btn lw-btn-connect" style={{ width: 'auto', textDecoration: 'none', padding: '0.5rem 1.5rem' }}>
            ← Back to Admin
          </a>
        </div>

        <div className="lw-section">
          <h2 className="lw-section-title">Overview</h2>
          <p style={{ color: 'var(--lw-text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
            The LightningWorks SSO API allows games and applications to verify user authentication,
            retrieve user profiles, connected wallets, and token balances.
          </p>
          <div style={{ background: 'rgba(26,17,46,0.8)', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', margin: '0 0 0.25rem 0' }}>Base URL</p>
            <code style={{ color: 'var(--lw-purple)', fontSize: '1rem' }}>{baseUrl}</code>
          </div>
          <p style={{ color: 'var(--lw-text-secondary)', fontSize: '0.9rem' }}>
            <strong>Authentication:</strong> Most endpoints use the Supabase JWT token passed in the
            request body or via cookie session. Games should send the JWT obtained during SSO login.
          </p>
        </div>

        <div className="lw-section">
          <h2 className="lw-section-title">Integration Flow</h2>
          <div style={{ color: 'var(--lw-text-secondary)', fontSize: '0.9rem', lineHeight: 1.8 }}>
            <p><strong style={{ color: 'var(--lw-purple)' }}>1.</strong> User clicks &quot;Log In&quot; in your game/app</p>
            <p><strong style={{ color: 'var(--lw-purple)' }}>2.</strong> Open browser to: <code style={{ color: 'var(--lw-text-muted)' }}>{baseUrl}/login?app=your-app-slug</code></p>
            <p><strong style={{ color: 'var(--lw-purple)' }}>3.</strong> User authenticates (email, Google, Discord, etc.)</p>
            <p><strong style={{ color: 'var(--lw-purple)' }}>4.</strong> SSO redirects back with JWT token</p>
            <p><strong style={{ color: 'var(--lw-purple)' }}>5.</strong> Your app calls <code style={{ color: 'var(--lw-text-muted)' }}>POST /api/verify</code> with the token</p>
            <p><strong style={{ color: 'var(--lw-purple)' }}>6.</strong> Use returned user data (id, username, wallets, etc.)</p>
          </div>
        </div>

        {endpoints.map((ep, i) => (
          <div key={i} className="lw-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <span style={{
                background: ep.method === 'GET' ? '#34A853' : '#4285F4',
                color: 'white',
                padding: '0.15rem 0.5rem',
                borderRadius: '3px',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                fontFamily: 'monospace',
              }}>{ep.method}</span>
              <h2 className="lw-section-title" style={{ margin: 0 }}>{ep.title}</h2>
            </div>

            <code style={{ color: 'var(--lw-purple)', display: 'block', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
              {ep.path}
            </code>

            <p style={{ color: 'var(--lw-text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.6 }}>
              {ep.description}
            </p>

            <div style={{ marginBottom: '0.75rem' }}>
              <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                {ep.method === 'POST' ? 'Request Body:' : 'Parameters:'}
              </p>
              <pre style={{ background: 'rgba(26,17,46,0.8)', padding: '0.75rem', borderRadius: '4px', color: 'var(--lw-text-primary)', fontSize: '0.8rem', overflowX: 'auto', margin: 0 }}>
                {ep.request}
              </pre>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Response:</p>
              <pre style={{ background: 'rgba(26,17,46,0.8)', padding: '0.75rem', borderRadius: '4px', color: 'var(--lw-text-primary)', fontSize: '0.8rem', overflowX: 'auto', margin: 0 }}>
                {ep.response}
              </pre>
            </div>

            <div>
              <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Errors:</p>
              <pre style={{ background: 'rgba(100,30,30,0.3)', padding: '0.75rem', borderRadius: '4px', color: '#ff8888', fontSize: '0.8rem', overflowX: 'auto', margin: 0 }}>
                {ep.errors}
              </pre>
            </div>
          </div>
        ))}

        <div className="lw-section">
          <h2 className="lw-section-title">Example: Unity C# Integration</h2>
          <pre style={{ background: 'rgba(26,17,46,0.8)', padding: '1rem', borderRadius: '4px', color: 'var(--lw-text-primary)', fontSize: '0.8rem', overflowX: 'auto', margin: 0 }}>
{`// After user logs in via browser SSO, verify the token:
var request = new UnityWebRequest("${baseUrl}/api/verify", "POST");
var body = JsonUtility.ToJson(new { token = jwtToken });
request.uploadHandler = new UploadHandlerRaw(
    System.Text.Encoding.UTF8.GetBytes(body));
request.downloadHandler = new DownloadHandlerBuffer();
request.SetRequestHeader("Content-Type", "application/json");
yield return request.SendWebRequest();

var response = JsonUtility.FromJson<VerifyResponse>(
    request.downloadHandler.text);
if (response.valid) {
    Debug.Log("User: " + response.user.username);
}`}
          </pre>
        </div>

        <div className="lw-footer-links" style={{ paddingBottom: '2rem', paddingTop: '2rem' }}>
          <p className="lw-footer-text">LightningWorks SSO API v1.0</p>
        </div>

      </div>
    </div>
  )
}
