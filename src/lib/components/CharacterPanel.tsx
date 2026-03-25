'use client'

import { useState, useRef } from 'react'
import { logAdmin } from '@/lib/audit'
import type { SupabaseClient } from '@supabase/supabase-js'

const STORAGE_BASE = 'https://wemmrhypldubdplaohli.supabase.co/storage/v1/object/public'

export interface CharacterData {
  id: number
  name: string
  slug: string
  company_id: number | null
  app_id: number | null
  side_img: string | null
  character_info: string | null
  chat_api_key: string | null
  admin_api_key: string | null
}

interface CharacterPanelProps {
  character: CharacterData
  supabase: SupabaseClient
  adminUser: { id: string; email?: string; username?: string } | null
  onSaved?: () => void
  setMessage?: (msg: string) => void
  uploadFile: (bucket: string, file: File) => Promise<string | null>
}

// Image upload component with local preview
function ImageField({ label, currentFile, bucketUrl, height, fileRef, onFileSelected }: {
  label: string, currentFile: string | null, bucketUrl: string, height: string, fileRef: React.RefObject<HTMLInputElement | null>, onFileSelected?: () => void
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dims, setDims] = useState('')
  const displayUrl = previewUrl || (currentFile ? `${bucketUrl}/${currentFile}` : null)

  return (
    <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
      <label style={{ marginBottom: '0.75rem', display: 'block', color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem' }}>{label}</label>
      {displayUrl && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', marginBottom: '0.4rem' }}>
          <img src={displayUrl} alt="" style={{ height, display: 'block' }}
            onLoad={(e) => { const img = e.target as HTMLImageElement; setDims(`${img.naturalWidth}x${img.naturalHeight}px`) }} />
          {dims && <span style={{ color: '#7a7572', fontSize: '0.75rem' }}>{dims}</span>}
        </div>
      )}
      <div>
        <input type="file" ref={fileRef} accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { const file = e.target.files?.[0]; if (file) { setPreviewUrl(URL.createObjectURL(file)); setDims(''); onFileSelected?.() } }} />
        <button onClick={() => fileRef.current?.click()} className="lw-btn"
          style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.85rem', backgroundColor: '#3a3938', color: '#e4dad1', cursor: 'pointer' }}>
          {displayUrl ? 'Replace Image' : 'Upload Image'}
        </button>
      </div>
    </div>
  )
}

export function CharacterPanel({ character, supabase, adminUser, onSaved, setMessage: setParentMessage, uploadFile }: CharacterPanelProps) {
  const [characterInfo, setCharacterInfo] = useState(character.character_info || '')
  const [chatKey, setChatKey] = useState(character.chat_api_key || '')
  const [adminKey, setAdminKey] = useState(character.admin_api_key || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [training, setTraining] = useState(false)
  const [trained, setTrained] = useState(false)
  const [trainResult, setTrainResult] = useState('')
  const [message, setMessage] = useState('')
  const sideRef = useRef<HTMLInputElement>(null)

  const markDirty = () => { setSaved(false); setTrained(false) }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')

    let sideImg = character.side_img || null
    if (sideRef.current?.files?.[0]) {
      sideImg = await uploadFile('app_side_image', sideRef.current.files[0])
    }

    const { error } = await supabase.from('characters').update({
      side_img: sideImg,
      character_info: characterInfo,
      chat_api_key: chatKey || null,
      admin_api_key: adminKey || null,
      updated_at: new Date().toISOString(),
    }).eq('id', character.id)

    if (error) {
      const errMsg = 'Error: ' + error.message
      setMessage(errMsg)
      setParentMessage?.(errMsg)
    } else {
      await logAdmin(supabase, 'admin.character.save', {
        user_id: adminUser?.id,
        email: adminUser?.email,
        username: adminUser?.username,
        description: `Saved character "${character.name}"`,
        metadata: { slug: character.slug, chars: characterInfo.length },
      })
      setSaved(true)
      onSaved?.()
    }

    setSaving(false)
  }

  const handleTrain = async () => {
    if (!characterInfo.trim()) {
      setTrainResult('No game info to train on. Add text first.')
      return
    }
    setTraining(true)
    setTrainResult('')

    if (!adminKey) {
      setTrainResult('No Admin API key configured. Add one below.')
      setTraining(false)
      return
    }

    try {
      const res = await fetch('https://kabdqrzcewkzbjmeqmxx.supabase.co/functions/v1/public-ingest-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: adminKey,
          text: characterInfo,
          source_label: `${character.slug}-game-info`,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setTrainResult(`Training failed: ${err.error || res.statusText}`)
      } else {
        const data = await res.json()
        await logAdmin(supabase, 'admin.character.train', {
          user_id: adminUser?.id,
          email: adminUser?.email,
          username: adminUser?.username,
          description: `Sent character training for "${character.name}"`,
          metadata: { slug: character.slug, chars: characterInfo.length, result: data.chunksProcessed ? `${data.chunksProcessed} chunks` : 'success' },
        })
        setTrained(true)
        setTrainResult(data.chunksProcessed ? `${data.chunksProcessed} chunks processed` : '')
      }
    } catch {
      setTrainResult('Connection failed — check network or API key.')
    }

    setTraining(false)
  }

  return (
    <div className="lw-section" style={{ marginTop: '0.5rem', marginBottom: '1.5rem' }}>
      <h3 className="lw-section-title">Character: {character.name}</h3>

      {message && (
        <div style={{ padding: '0.5rem', marginBottom: '0.75rem', borderRadius: 'var(--lw-radius-sm)', background: 'rgba(255,68,68,0.2)', color: 'var(--lw-error)', fontSize: '0.85rem' }}>
          {message}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        {/* Left — Character image */}
        <div style={{ flexShrink: 0, width: '220px' }}>
          <ImageField
            label="Side Image"
            currentFile={character.side_img || null}
            bucketUrl={`${STORAGE_BASE}/app_side_image`}
            height="250px"
            fileRef={sideRef}
            onFileSelected={markDirty}
          />
        </div>

        {/* Right — Game Info */}
        <div style={{ flex: 1 }}>
          <label style={{ color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem', display: 'block', marginBottom: '0.5rem' }}>
            Game Info
          </label>
          <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', margin: '0 0 0.5rem 0' }}>
            Paste all information you want the character AI to know. This will be sent to Kinet.ink for RAG training.
          </p>
          <textarea
            value={characterInfo}
            maxLength={500000}
            onChange={e => { setCharacterInfo(e.target.value); markDirty() }}
            className="lw-input"
            placeholder="Paste game lore, mechanics, characters, world-building, FAQ, etc..."
            style={{
              backgroundColor: 'rgb(26,17,46)', color: '#bab1a8',
              width: '100%', minHeight: '300px', resize: 'vertical',
              fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: '1.5',
              padding: '0.75rem',
            }}
          />
          <p style={{ color: characterInfo.length > 490000 ? '#ff8800' : 'var(--lw-text-muted)', fontSize: '0.75rem', margin: '0.25rem 0 0 0', textAlign: 'right' }}>
            {characterInfo.length.toLocaleString()} / 500,000
          </p>
        </div>
      </div>

      {/* API Keys */}
      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1.5rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>Chat API Key</label>
          <input className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} value={chatKey} onChange={e => { setChatKey(e.target.value); markDirty() }} placeholder="Chat key (public, used in iframe)" />
          <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: '0.25rem 0 0 0' }}>Embedded in iframe URL — safe to expose client-side</p>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>Admin API Key</label>
          <input className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} value={adminKey} onChange={e => { setAdminKey(e.target.value); markDirty() }} placeholder="Admin key (private, for training)" />
          <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: '0.25rem 0 0 0' }}>Server-side only — used for RAG training</p>
        </div>
      </div>

      {/* Buttons — right-aligned */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem', justifyContent: 'flex-end' }}>
        {trainResult && (
          <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', marginRight: 'auto' }}>{trainResult}</span>
        )}
        <button onClick={handleSave} disabled={saving || saved} className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
        </button>
        <button onClick={handleTrain} disabled={training || trained || !characterInfo.trim()} className="lw-btn" style={{
          width: 'auto', padding: '0.5rem 1.5rem',
          backgroundColor: trained ? '#34A853' : training ? '#3a3938' : '#ff8800', color: '#fff',
          cursor: training || trained || !characterInfo.trim() ? 'not-allowed' : 'pointer',
          opacity: !characterInfo.trim() ? 0.5 : 1,
          fontWeight: 600,
        }}>
          {training ? 'Training...' : trained ? 'Trained' : 'Train'}
        </button>
      </div>
    </div>
  )
}
