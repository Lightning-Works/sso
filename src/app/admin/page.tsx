'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const STORAGE_BASE = 'https://wemmrhypldubdplaohli.supabase.co/storage/v1/object/public'

interface Company {
  id: number
  name: string
  slug: string
  logo_url: string | null
  primary_color: string
  app_side_img: string | null
}

interface App {
  id: number
  company_id: number | null
  name: string
  slug: string
  app_header_img: string | null
  app_side_img: string | null
  character_info: string | null
  chat_api_key: string | null
  companies?: Company | null
}

export default function AdminPage() {
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<Company[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [activeTab, setActiveTab] = useState<'companies' | 'apps'>('companies')
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const [editingApp, setEditingApp] = useState<App | null>(null)
  const [showNewCompany, setShowNewCompany] = useState(false)
  const [showNewApp, setShowNewApp] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAccess()
    loadData()
  }, [])

  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'superadmin') {
      router.push('/account')
      return
    }
    setRole(profile.role)
    setLoading(false)
  }

  const loadData = async () => {
    const { data: companiesData } = await supabase.from('companies').select('*').order('id')
    const { data: appsData } = await supabase.from('apps').select('*, companies(name, slug)').order('id')
    if (companiesData) setCompanies(companiesData)
    if (appsData) setApps(appsData)
  }

  const uploadFile = async (bucket: string, file: File): Promise<string | null> => {
    const filename = file.name.toLowerCase().replace(/\s+/g, '_')
    const { error } = await supabase.storage.from(bucket).upload(filename, file, { upsert: true, contentType: file.type })
    if (error) {
      console.error('Upload error:', error)
      setMessage(`Upload error (${bucket}): ${error.message}`)
      return null
    }
    return filename
  }

  // Reusable image upload component with local preview
  const ImageField = ({ label, currentFile, bucketUrl, height, fileRef, onFileSelected }: {
    label: string, currentFile: string | null, bucketUrl: string, height: string, fileRef: React.RefObject<HTMLInputElement | null>, onFileSelected?: () => void
  }) => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [dims, setDims] = useState('')

    const displayUrl = previewUrl || (currentFile ? `${bucketUrl}/${currentFile}` : null)

    return (
      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <label style={{ marginBottom: '0.75rem', display: 'block', color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem' }}>{label}</label>
        {displayUrl && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', marginBottom: '0.4rem' }}>
            <img
              src={displayUrl}
              alt=""
              style={{ height, display: 'block' }}
              onLoad={(e) => {
                const img = e.target as HTMLImageElement
                setDims(`${img.naturalWidth}x${img.naturalHeight}px`)
              }}
            />
            {dims && (
              <span style={{ color: '#7a7572', fontSize: '0.75rem' }}>
                {dims}
              </span>
            )}
          </div>
        )}
        <div>
          <input
            type="file"
            ref={fileRef}
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                const url = URL.createObjectURL(file)
                setPreviewUrl(url)
                setDims('')
                onFileSelected?.()
              }
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="lw-btn"
            style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.85rem', backgroundColor: '#3a3938', color: '#e4dad1', cursor: 'pointer' }}
          >
            {displayUrl ? 'Replace Image' : 'Upload Image'}
          </button>
        </div>
      </div>
    )
  }

  // === COMPANY CRUD ===

  const CompanyForm = ({ company, isNew }: { company: Company | null, isNew: boolean }) => {
    const [name, setName] = useState(company?.name || '')
    const [slug, setSlug] = useState(company?.slug || '')
    const [primaryColor, setPrimaryColor] = useState(company?.primary_color || '#6a24fa')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const logoRef = useRef<HTMLInputElement>(null)
    const sideRef = useRef<HTMLInputElement>(null)

    const markDirty = () => setSaved(false)

    const handleSave = async () => {
      setSaving(true)
      setMessage('')

      let logoUrl = company?.logo_url || null
      let sideImg = company?.app_side_img || null

      if (logoRef.current?.files?.[0]) {
        logoUrl = await uploadFile('company-logos', logoRef.current.files[0])
      }
      if (sideRef.current?.files?.[0]) {
        sideImg = await uploadFile('app_side_image', sideRef.current.files[0])
      }

      if (isNew) {
        const { error } = await supabase.from('companies').insert({
          name, slug: slug.toLowerCase(), logo_url: logoUrl, primary_color: primaryColor, app_side_img: sideImg
        })
        if (error) { setMessage('Error: ' + error.message) }
        else { setShowNewCompany(false) }
      } else {
        const { error } = await supabase.from('companies').update({
          name, slug: slug.toLowerCase(), logo_url: logoUrl, primary_color: primaryColor, app_side_img: sideImg
        }).eq('id', company!.id)
        if (error) { setMessage('Error: ' + error.message) }
        else { setSaved(true) }
      }

      setSaving(false)
      loadData()
    }

    return (
      <div className="lw-section" style={{ marginTop: '1rem' }}>
        <h3 className="lw-section-title">{isNew ? 'New Company' : `Edit: ${company?.name}`}</h3>
        <div className="lw-form">
          <div>
            <label style={{ color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>Company Name</label>
            <input className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} value={name} onChange={e => { setName(e.target.value); markDirty() }} placeholder="Company Name" />
          </div>
          <div>
            <label style={{ color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>Slug (URL identifier)</label>
            <input className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} value={slug} onChange={e => { setSlug(e.target.value); markDirty() }} placeholder="companyname" />
          </div>
          <div>
            <label style={{ color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>Primary Color</label>
            <input type="color" value={primaryColor} onChange={e => { setPrimaryColor(e.target.value); markDirty() }} style={{ width: '60px', height: '36px', cursor: 'pointer', marginTop: '0.25rem' }} />
          </div>
          <ImageField label="Company Logo" currentFile={company?.logo_url || null} bucketUrl={`${STORAGE_BASE}/company-logos`} height="60px" fileRef={logoRef} onFileSelected={markDirty} />
          <ImageField label="Default Side Image" currentFile={company?.app_side_img || null} bucketUrl={`${STORAGE_BASE}/app_side_image`} height="200px" fileRef={sideRef} onFileSelected={markDirty} />
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleSave} disabled={saving || saved} className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>
              {saving ? 'Saving...' : saved ? 'Saved' : isNew ? 'Create Company' : 'Save'}
            </button>
            <button onClick={() => { setEditingCompany(null); setShowNewCompany(false) }} className="lw-btn lw-btn-secondary" style={{ width: 'auto' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // === APP CRUD ===

  const AppForm = ({ app, isNew }: { app: App | null, isNew: boolean }) => {
    const [name, setName] = useState(app?.name || '')
    const [slug, setSlug] = useState(app?.slug || '')
    const [companyId, setCompanyId] = useState(app?.company_id || companies[0]?.id || 0)
    const [apiKey, setApiKey] = useState(app?.chat_api_key || '')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const headerRef = useRef<HTMLInputElement>(null)

    const markDirty = () => setSaved(false)

    const handleSave = async () => {
      setSaving(true)
      setMessage('')

      let headerImg = app?.app_header_img || null

      if (headerRef.current?.files?.[0]) {
        headerImg = await uploadFile('app_logo', headerRef.current.files[0])
      }

      if (isNew) {
        const { error } = await supabase.from('apps').insert({
          name, slug: slug.toLowerCase(), company_id: companyId, app_header_img: headerImg, chat_api_key: apiKey || null
        })
        if (error) { setMessage('Error: ' + error.message) }
        else { setShowNewApp(false) }
      } else {
        const { error } = await supabase.from('apps').update({
          name, slug: slug.toLowerCase(), company_id: companyId, app_header_img: headerImg, chat_api_key: apiKey || null
        }).eq('id', app!.id)
        if (error) { setMessage('Error: ' + error.message) }
        else { setSaved(true) }
      }

      setSaving(false)
      loadData()
    }

    return (
      <div className="lw-section" style={{ marginTop: '1rem' }}>
        <h3 className="lw-section-title">{isNew ? 'New App' : `Edit: ${app?.name}`}</h3>
        <div className="lw-form">
          <div>
            <label style={{ color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>App Name</label>
            <input className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} value={name} onChange={e => { setName(e.target.value); markDirty() }} placeholder="App Name" />
          </div>
          <div>
            <label style={{ color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>Slug (URL identifier)</label>
            <input className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} value={slug} onChange={e => { setSlug(e.target.value); markDirty() }} placeholder="appname" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '0.5rem' }}>
            <label style={{ color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem', flexShrink: 0 }}>Company</label>
            <select
              value={companyId}
              onChange={e => { setCompanyId(parseInt(e.target.value)); markDirty() }}
              className="lw-input"
              style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8', width: 'auto', minWidth: '200px'}}
            >
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>Kinet.ink API Key</label>
            <input className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} value={apiKey} onChange={e => { setApiKey(e.target.value); markDirty() }} placeholder="API key from Kinet.ink" />
            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>Used for character chat and RAG training</p>
          </div>
          <ImageField label="App Logo (shown in login panel)" currentFile={app?.app_header_img || null} bucketUrl={`${STORAGE_BASE}/app_logo`} height="75px" fileRef={headerRef} onFileSelected={markDirty} />
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleSave} disabled={saving || saved} className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>
              {saving ? 'Saving...' : saved ? 'Saved' : isNew ? 'Create App' : 'Save'}
            </button>
            <button onClick={() => { setEditingApp(null); setShowNewApp(false) }} className="lw-btn lw-btn-secondary" style={{ width: 'auto' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // === CHARACTER PANEL ===

  const CharacterPanel = ({ app }: { app: App }) => {
    const [characterInfo, setCharacterInfo] = useState(app.character_info || '')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [training, setTraining] = useState(false)
    const [trained, setTrained] = useState(false)
    const [trainResult, setTrainResult] = useState('')
    const sideRef = useRef<HTMLInputElement>(null)

    const markDirty = () => { setSaved(false); setTrained(false) }

    const handleSaveCharacter = async () => {
      setSaving(true)
      setMessage('')

      let sideImg = app.app_side_img || null
      if (sideRef.current?.files?.[0]) {
        sideImg = await uploadFile('app_side_image', sideRef.current.files[0])
      }

      const { error } = await supabase.from('apps').update({
        app_side_img: sideImg,
        character_info: characterInfo,
      }).eq('id', app.id)

      if (error) { setMessage('Error: ' + error.message) }
      else { setSaved(true) }

      setSaving(false)
      loadData()
    }

    const handleTrain = async () => {
      if (!characterInfo.trim()) {
        setTrainResult('No game info to train on. Add text first.')
        return
      }
      setTraining(true)
      setTrainResult('')

      // Get the app's Kinet.ink API key
      const { data: appData } = await supabase.from('apps').select('chat_api_key').eq('id', app.id).single()
      const apiKey = appData?.chat_api_key
      if (!apiKey) {
        setTrainResult('No Kinet.ink API key configured for this app. Add one in the App settings.')
        setTraining(false)
        return
      }

      try {
        console.log('Training request:', { apiKey: apiKey.slice(0, 8) + '...', textLength: characterInfo.length, label: `${app.slug}-game-info` })
        const res = await fetch('https://kabdqrzcewkzbjmeqmxx.supabase.co/functions/v1/public-ingest-knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            text: characterInfo,
            source_label: `${app.slug}-game-info`,
          }),
        })
        console.log('Training response status:', res.status)

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          setTrainResult(`Training failed: ${err.error || res.statusText}`)
        } else {
          const data = await res.json()
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
        <h3 className="lw-section-title">Character</h3>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
          {/* Left — Character image */}
          <div style={{ flexShrink: 0, width: '220px' }}>
            <ImageField
              label="Side Image"
              currentFile={app.app_side_img || null}
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
              Paste all information you want the character AI to know about this game. This will be sent to Kinet.ink for RAG training.
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

        {/* Buttons — right-aligned */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem', justifyContent: 'flex-end' }}>
          {trainResult && (
            <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', marginRight: 'auto' }}>{trainResult}</span>
          )}
          <button onClick={handleSaveCharacter} disabled={saving || saved} className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>
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

  if (loading) {
    return <div className="lw-page"><p className="lw-subtitle">Loading...</p></div>
  }

  return (
    <div className="lw-account-page">
      <div className="lw-account-container">

        <div className="lw-account-header">
          <h1 className="lw-heading-xl">Admin Panel</h1>
          <a href="/account" className="lw-btn lw-btn-connect" style={{ width: 'auto', textDecoration: 'none', padding: '0.5rem 1.5rem' }}>
            ← Back to Account
          </a>
        </div>

        {message && (
          <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: 'var(--lw-radius-sm)', background: message.startsWith('Error') ? 'rgba(255,68,68,0.2)' : 'rgba(68,255,68,0.2)', color: message.startsWith('Error') ? 'var(--lw-error)' : 'var(--lw-success)', textAlign: 'center' }}>
            {message}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: 0 }}>
            <button
              onClick={() => setActiveTab('companies')}
              className="lw-btn"
              style={{ borderRadius: '4px 0 0 4px', background: activeTab === 'companies' ? 'var(--lw-purple)' : 'var(--lw-bg-input)', color: 'white', width: 'auto', padding: '0.5rem 2rem', fontSize: '1.1rem', fontFamily: 'var(--lw-font-display)' }}
            >
              Companies
            </button>
            <button
              onClick={() => setActiveTab('apps')}
              className="lw-btn"
              style={{ borderRadius: '0 4px 4px 0', background: activeTab === 'apps' ? 'var(--lw-purple)' : 'var(--lw-bg-input)', color: 'white', width: 'auto', padding: '0.5rem 2rem', fontSize: '1.1rem', fontFamily: 'var(--lw-font-display)' }}
            >
              Apps
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '2rem' }}>
            <a href="/admin/api-docs" className="lw-btn lw-btn-connect" style={{ width: 'auto', textDecoration: 'none', padding: '0.5rem 1.5rem', fontSize: '1.1rem', fontFamily: 'var(--lw-font-display)', borderRadius: '4px' }}>
              APIs
            </a>
            <a href="/admin/logs" className="lw-btn lw-btn-connect" style={{ width: 'auto', textDecoration: 'none', padding: '0.5rem 1.5rem', fontSize: '1.1rem', fontFamily: 'var(--lw-font-display)', borderRadius: '4px' }}>
              Logs
            </a>
          </div>
        </div>

        {/* Companies Tab */}
        {activeTab === 'companies' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 className="lw-section-title" style={{ margin: 0 }}>Companies ({companies.length})</h2>
              <button onClick={() => { setShowNewCompany(true); setEditingCompany(null) }} className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>
                + Add Company
              </button>
            </div>

            {showNewCompany && <CompanyForm company={null} isNew={true} />}

            {companies.map(company => (
              <div key={company.id}>
                {editingCompany?.id === company.id ? (
                  <CompanyForm company={company} isNew={false} />
                ) : (
                  <div className="lw-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {company.logo_url && (
                        <img src={`${STORAGE_BASE}/company-logos/${company.logo_url}`} alt={company.name} style={{ height: '35px' }} />
                      )}
                      <div>
                        <p style={{ color: 'var(--lw-text-white)', fontWeight: 500, margin: 0 }}>{company.name}</p>
                        <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', margin: 0 }}>slug: {company.slug} · id: {company.id}</p>
                      </div>
                    </div>
                    <button onClick={() => { setEditingCompany(company); setShowNewCompany(false) }} className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem' }}>
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* Apps Tab */}
        {activeTab === 'apps' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 className="lw-section-title" style={{ margin: 0 }}>Apps ({apps.length})</h2>
              <button onClick={() => { setShowNewApp(true); setEditingApp(null) }} className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>
                + Add App
              </button>
            </div>

            {showNewApp && <AppForm app={null} isNew={true} />}

            {apps.map(app => (
              <div key={app.id}>
                {editingApp?.id === app.id ? (
                  <>
                    <AppForm app={app} isNew={false} />
                    <CharacterPanel app={app} />
                  </>
                ) : (
                  <div className="lw-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {app.app_header_img && (
                        <img src={`${STORAGE_BASE}/app_logo/${app.app_header_img}`} alt={app.name} style={{ height: '35px' }} />
                      )}
                      <div>
                        <p style={{ color: 'var(--lw-text-white)', fontWeight: 500, margin: 0 }}>{app.name}</p>
                        <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', margin: 0 }}>
                          slug: {app.slug} · company: {app.companies?.name || 'None'} · id: {app.id}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <a href={`/login?app=${app.slug}`} target="_blank" className="lw-link" style={{ fontSize: '0.8rem' }}>Preview</a>
                      <button onClick={() => { setEditingApp(app); setShowNewApp(false) }} className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem' }}>
                        Edit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        <div className="lw-footer-links" style={{ paddingBottom: '2rem', paddingTop: '2rem' }}>
          <p className="lw-footer-text">
            LightningWorks SSO Admin · Superadmin access only
          </p>
        </div>

      </div>
    </div>
  )
}
