// Tests for the consent + DSAR services (plain node; injected in-memory stores).
const cs = require('../consentService')
const dsar = require('../dsarService')

let pass = 0, fail = 0
const chk = (n, cond) => { if (cond) { pass++; console.log('  ✅ ' + n) } else { fail++; console.log('  ❌ ' + n) } }

const makeStore = () => {
  const recs = []
  return {
    recs,
    saveConsent: async (r) => { recs.push({ ...r }) },
    getLatestConsent: async (u) => { for (let i = recs.length - 1; i >= 0; i--) if (recs[i].userId === u) return recs[i]; return null }
  }
}

;(async () => {
  // ---- consent service ----
  const store = makeStore()

  // no consent yet -> strict: essential collectable, optional not.
  chk('no consent: essential (wallet_tx) collectable', (await cs.mayCollect(store, 'u1', 'wallet_tx')) === true)
  chk('no consent: optional (analytics) NOT collectable', (await cs.mayCollect(store, 'u1', 'analytics')) === false)

  // EU user opts into analytics only.
  await cs.recordConsent(store, { userId: 'u1', regionId: 'EU-GDPR', choices: { analytics: true }, ip: '203.0.113.5', userAgent: 'UA', now: 1000 })
  const st = await cs.getConsentState(store, 'u1')
  chk('state: region EU, analytics true, device false', st.regionId === 'EU-GDPR' && st.choices.analytics === true && st.choices.device_info === false)
  chk('gate: analytics now collectable', (await cs.mayCollect(store, 'u1', 'analytics')) === true)
  chk('gate: device still NOT collectable', (await cs.mayCollect(store, 'u1', 'device_info')) === false)

  const okList = await cs.collectableCategories(store, 'u1', ['wallet_tx', 'analytics', 'device_info', 'marketing'])
  chk('collectable filter = [wallet_tx, analytics]', JSON.stringify(okList) === JSON.stringify(['wallet_tx', 'analytics']))

  // withdraw analytics + enable device via updateConsent -> new immutable record.
  await cs.updateConsent(store, 'u1', { analytics: false, device_info: true }, { now: 2000 })
  chk('audit trail: 2 records kept', store.recs.filter(r => r.userId === 'u1').length === 2)
  chk('after update: analytics off, device on', (await cs.mayCollect(store, 'u1', 'analytics')) === false && (await cs.mayCollect(store, 'u1', 'device_info')) === true)

  // ---- DSAR: export ----
  const calls = { read: [], del: [], anon: [] }
  const adapters = {
    readCategory: async (c) => { calls.read.push(c); return { sample: c } },
    deleteCategory: async (c) => { calls.del.push(c) },
    anonymizeCategory: async (c) => { calls.anon.push(c) }
  }
  const bundle = await dsar.exportUserData(adapters, 'u1', 12345)
  chk('export: reads every category', calls.read.length >= 8)
  chk('export: has map + timestamp + per-category status', !!bundle.map && bundle.generatedAt === 12345 && bundle.categories.wallet_tx.status === 'ok')

  // export with a broken reader on one category -> reported, not fatal
  const flaky = { readCategory: async (c) => { if (c === 'analytics') throw new Error('boom'); return { c } } }
  const b2 = await dsar.exportUserData(flaky, 'u1')
  chk('export: broken category reported as error, others ok', b2.categories.analytics.status === 'error' && b2.categories.wallet_tx.status === 'ok')

  // ---- DSAR: erase ----
  const res = await dsar.eraseUserData(adapters, 'u1', 'EU-GDPR')
  chk('erase: deleted erasable (analytics/device/agent_chat)', ['analytics', 'device_info', 'agent_chat'].every(id => res.deleted.includes(id)))
  chk('erase: retained regulated (wallet_tx/identity/consent_record)', ['wallet_tx', 'identity', 'consent_record'].every(id => res.retained.includes(id)))
  chk('erase: delete adapter called for erasable only', calls.del.includes('analytics') && !calls.del.includes('wallet_tx'))
  chk('erase: anonymize adapter called for retained', calls.anon.includes('wallet_tx') && calls.anon.includes('consent_record'))
  chk('erase: honest receipt has note + no errors', /retained/.test(res.note) && res.errors.length === 0)

  console.log('\n' + (fail === 0 ? 'COMPLIANCE SERVICES: ALL ' + pass + ' PASSED' : pass + ' passed, ' + fail + ' FAILED'))
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('TEST ERROR', e); process.exit(1) })
