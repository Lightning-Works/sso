// Compliance core tests (plain node, no framework). Verifies the config-driven
// engine: region resolution, per-region consent screens, the collection gate, the
// consent record shape, and the erasure carve-out for regulated records.
const { resolveRegionId } = require('../regions')
const {
  buildConsentRequest, canCollect, buildConsentRecord, rightsForRegion, erasurePlan, dataMap
} = require('../consentEngine')

let pass = 0, fail = 0
const chk = (n, cond) => { if (cond) { pass++; console.log('  ✅ ' + n) } else { fail++; console.log('  ❌ ' + n) } }

// ---- region resolution ----
chk('Germany -> EU-GDPR', resolveRegionId({ country: 'DE' }) === 'EU-GDPR')
chk('France -> EU-GDPR', resolveRegionId({ country: 'fr' }) === 'EU-GDPR')
chk('UK -> UK-GDPR', resolveRegionId({ country: 'GB' }) === 'UK-GDPR')
chk('US+California -> CCPA', resolveRegionId({ country: 'US', usState: 'CA' }) === 'US-CA-CCPA')
chk('US+Texas -> DEFAULT (not CCPA)', resolveRegionId({ country: 'US', usState: 'TX' }) === 'DEFAULT')
chk('unknown -> DEFAULT (strict)', resolveRegionId({ country: 'ZZ' }) === 'DEFAULT')

// ---- consent screen per model ----
const eu = buildConsentRequest({ country: 'DE' })
chk('EU screen: opt-in model', eu.consentModel === 'opt-in')
chk('EU screen: essential includes wallet_tx + consent_record', eu.essential.some(c => c.id === 'wallet_tx') && eu.essential.some(c => c.id === 'consent_record'))
chk('EU screen: optional all default OFF', eu.optional.every(c => c.default === false))
chk('EU screen: agent_chat flags x.ai cross-border', (eu.optional.find(c => c.id === 'agent_chat') || {}).crossBorderProcessor === 'x.ai (US)')
const ca = buildConsentRequest({ country: 'US', usState: 'CA' })
chk('CCPA screen: opt-out model, optional default ON (refusable)', ca.consentModel === 'opt-out' && ca.optional.every(c => c.default === true))

// ---- THE COLLECTION GATE (core guarantee) ----
chk('essential always collectable (no consent needed)', canCollect('wallet_tx', {}, 'EU-GDPR') === true)
chk('EU: optional device NOT collected without opt-in', canCollect('device_info', {}, 'EU-GDPR') === false)
chk('EU: optional device collected WHEN opted in', canCollect('device_info', { device_info: true }, 'EU-GDPR') === true)
chk('CCPA: optional device collected unless refused', canCollect('device_info', {}, 'US-CA-CCPA') === true)
chk('CCPA: optional device NOT collected when refused', canCollect('device_info', { device_info: false }, 'US-CA-CCPA') === false)
chk('unknown category never collectable', canCollect('nonsense', { nonsense: true }, 'EU-GDPR') === false)

// ---- consent record shape ----
const rec = buildConsentRecord({ regionId: 'EU-GDPR', choices: { analytics: true }, ip: '203.0.113.9', userAgent: 'UA', userId: 'u1', now: 1700000000000 })
chk('record: normalizes chosen analytics=true', rec.choices.analytics === true)
chk('record: unspecified optional defaults false (opt-in)', rec.choices.device_info === false)
chk('record: keeps IP-as-proof + notice version + time', rec.ip === '203.0.113.9' && rec.noticeVersion === '2026-08-16-eu-v1' && rec.at === 1700000000000)

// ---- rights ----
chk('EU rights include erasure + withdraw-consent', rightsForRegion('EU-GDPR').includes('erasure') && rightsForRegion('EU-GDPR').includes('withdraw-consent'))
chk('CCPA rights include opt-out-sale', rightsForRegion('US-CA-CCPA').includes('opt-out-sale'))

// ---- erasure carve-out ----
const plan = erasurePlan('EU-GDPR')
const retainedIds = plan.retain.map(x => x.id)
const deletedIds = plan.delete.map(x => x.id)
chk('erasure: wallet_tx/identity/consent_record RETAINED (legal obligation)', ['wallet_tx', 'identity', 'consent_record'].every(id => retainedIds.includes(id)))
chk('erasure: analytics/device/agent_chat DELETED', ['analytics', 'device_info', 'agent_chat'].every(id => deletedIds.includes(id)))

// ---- data map reaches all stores (for export/delete) ----
const map = dataMap()
chk('data map lists agent_chat with x.ai processor', (map.find(c => c.id === 'agent_chat') || {}).crossBorderProcessor === 'x.ai (US)')
chk('data map covers every category', map.length >= 8)

console.log('\n' + (fail === 0 ? 'COMPLIANCE CORE: ALL ' + pass + ' PASSED' : pass + ' passed, ' + fail + ' FAILED'))
process.exit(fail === 0 ? 0 : 1)
