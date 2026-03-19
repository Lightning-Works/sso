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
    const { error } = await supabase.storage.from(bucket).upload(filename, file, { upsert: true })
    if (error) { setMessage('Upload error: ' + error.message); return null }
    return filename
  }

  // Reusable image upload component
  const ImageField = ({ label, currentFile, bucketUrl, height, fileRef }: {
    label: string, currentFile: string | null, bucketUrl: string, height: string, fileRef: React.RefObject<HTMLInputElement | null>
  }) => {
    const [selectedName, setSelectedName] = useState<string | null>(null)
    const [dims, setDims] = useState('')

    return (
      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <label style={{ marginBottom: '0.75rem', display: 'block', color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem' }}>{label}</label>
        {currentFile && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', marginBottom: '0.4rem' }}>
            <img
              src={`${bucketUrl}/${currentFile}`}
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
            onChange={(e) => setSelectedName(e.target.files?.[0]?.name || null)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="lw-btn"
            style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.85rem', backgroundColor: '#3a3938', color: '#e4dad1', cursor: 'pointer' }}
          >
            {currentFile ? 'Replace Image' : 'Upload Image'}
          </button>
          {selectedName && (
            <span style={{ color: 'var(--lw-success)', fontSize: '0.8rem', marginLeft: '0.75rem' }}>
              ✓ {selectedName}
            </span>
          )}
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
    const logoRef = useRef<HTMLInputElement>(null)
    const sideRef = useRef<HTMLInputElement>(null)

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
        else { setMessage('Company created!'); setShowNewCompany(false) }
      } else {
        const { error } = await supabase.from('companies').update({
          name, slug: slug.toLowerCase(), logo_url: logoUrl, primary_color: primaryColor, app_side_img: sideImg
        }).eq('id', company!.id)
        if (error) { setMessage('Error: ' + error.message) }
        else { setMessage('Company updated!'); setEditingCompany(null) }
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
            <input className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} value={name} onChange={e => setName(e.target.value)} placeholder="Company Name" />
          </div>
          <div>
            <label style={{ color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>Slug (URL identifier)</label>
            <input className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} value={slug} onChange={e => setSlug(e.target.value)} placeholder="companyname" />
          </div>
          <div>
            <label style={{ color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>Primary Color</label>
            <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} style={{ width: '60px', height: '36px', cursor: 'pointer', marginTop: '0.25rem' }} />
          </div>
          <ImageField label="Company Logo" currentFile={company?.logo_url || null} bucketUrl={`${STORAGE_BASE}/company-logos`} height="60px" fileRef={logoRef} />
          <ImageField label="Default Side Image" currentFile={company?.app_side_img || null} bucketUrl={`${STORAGE_BASE}/app_side_image`} height="200px" fileRef={sideRef} />
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleSave} disabled={saving} className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>
              {saving ? 'Saving...' : isNew ? 'Create Company' : 'Save Changes'}
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
    const [saving, setSaving] = useState(false)
    const headerRef = useRef<HTMLInputElement>(null)
    const sideRef = useRef<HTMLInputElement>(null)

    const handleSave = async () => {
      setSaving(true)
      setMessage('')

      let headerImg = app?.app_header_img || null
      let sideImg = app?.app_side_img || null

      if (headerRef.current?.files?.[0]) {
        headerImg = await uploadFile('app_logo', headerRef.current.files[0])
      }
      if (sideRef.current?.files?.[0]) {
        sideImg = await uploadFile('app_side_image', sideRef.current.files[0])
      }

      if (isNew) {
        const { error } = await supabase.from('apps').insert({
          name, slug: slug.toLowerCase(), company_id: companyId, app_header_img: headerImg, app_side_img: sideImg
        })
        if (error) { setMessage('Error: ' + error.message) }
        else { setMessage('App created!'); setShowNewApp(false) }
      } else {
        const { error } = await supabase.from('apps').update({
          name, slug: slug.toLowerCase(), company_id: companyId, app_header_img: headerImg, app_side_img: sideImg
        }).eq('id', app!.id)
        if (error) { setMessage('Error: ' + error.message) }
        else { setMessage('App updated!'); setEditingApp(null) }
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
            <input className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} value={name} onChange={e => setName(e.target.value)} placeholder="App Name" />
          </div>
          <div>
            <label style={{ color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>Slug (URL identifier)</label>
            <input className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} value={slug} onChange={e => setSlug(e.target.value)} placeholder="appname" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '0.5rem' }}>
            <label style={{ color: 'var(--lw-text-primary)', fontWeight: 'bold', fontSize: '1rem', flexShrink: 0 }}>Company</label>
            <select
              value={companyId}
              onChange={e => setCompanyId(parseInt(e.target.value))}
              className="lw-input"
              style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8', width: 'auto', minWidth: '200px'}}
            >
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <ImageField label="App Logo (shown in login panel)" currentFile={app?.app_header_img || null} bucketUrl={`${STORAGE_BASE}/app_logo`} height="75px" fileRef={headerRef} />
          <ImageField label="Side Character Image" currentFile={app?.app_side_img || null} bucketUrl={`${STORAGE_BASE}/app_side_image`} height="250px" fileRef={sideRef} />
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleSave} disabled={saving} className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>
              {saving ? 'Saving...' : isNew ? 'Create App' : 'Save Changes'}
            </button>
            <button onClick={() => { setEditingApp(null); setShowNewApp(false) }} className="lw-btn lw-btn-secondary" style={{ width: 'auto' }}>
              Cancel
            </button>
          </div>
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
          <a href="/account" className="lw-btn lw-btn-secondary" style={{ width: 'auto', textDecoration: 'none' }}>
            ← Back to Account
          </a>
          <a href="/admin/api-docs" className="lw-btn lw-btn-primary" style={{ width: 'auto', textDecoration: 'none', padding: '0.5rem 1.5rem' }}>
            API Docs
          </a>
        </div>

        {message && (
          <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: 'var(--lw-radius-sm)', background: message.startsWith('Error') ? 'rgba(255,68,68,0.2)' : 'rgba(68,255,68,0.2)', color: message.startsWith('Error') ? 'var(--lw-error)' : 'var(--lw-success)', textAlign: 'center' }}>
            {message}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem' }}>
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
                  <AppForm app={app} isNew={false} />
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
