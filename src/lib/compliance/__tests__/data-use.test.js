// Tests for the honest data-sale statement, the anonymization release gate, and
// the new opt-in categories.
const { statementPair, enforceEqualProminence } = require('../notices')
const A = require('../anonymize')
const { DATA_CATEGORIES } = require('../dataCategories')
const { buildConsentRequest, canCollect } = require('../consentEngine')

let pass = 0, fail = 0
const chk = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n) } else { fail++; console.log('  ❌ ' + n) } }

// ---- honest statement: both facts, equal prominence ----
const s = statementPair('data_sale')
chk('data_sale: has a non-empty promise AND caveat', !!s.promise.trim() && !!s.caveat.trim())
chk('data_sale: promise = never sell identifying', /never sell/i.test(s.promise) && /identif/i.test(s.promise))
chk('data_sale: caveat discloses anonymized sale at equal prominence', /anonymized/i.test(s.caveat) && /sell/i.test(s.caveat))
chk('unknown statement throws', (() => { try { enforceEqualProminence('nope'); return false } catch { return true } })())

// ---- new opt-in categories exist and are consent-gated ----
chk('anonymized_sale is optional + consent', DATA_CATEGORIES.anonymized_sale && DATA_CATEGORIES.anonymized_sale.essential === false && DATA_CATEGORIES.anonymized_sale.lawfulBasis === 'consent')
chk('EU consent screen: anonymized_sale off by default', (buildConsentRequest('EU-GDPR').optional.find(c => c.id === 'anonymized_sale') || {}).default === false)
chk('EU: cannot sell without opt-in', canCollect('anonymized_sale', {}, 'EU-GDPR') === false)
chk('EU: sell allowed only when opted in', canCollect('anonymized_sale', { anonymized_sale: true }, 'EU-GDPR') === true)

// ---- anonymization gate ----
chk('stripIdentifiers drops id/email/message, keeps country', (() => {
  const o = A.stripIdentifiers({ userId: 'u1', email: 'a@b.c', message: 'hi', country: 'US', amount: 5 })
  return !('userId' in o) && !('email' in o) && !('message' in o) && o.country === 'US' && o.amount === 5
})())

const raw = [
  ...Array.from({ length: 4 }, () => ({ userId: 'x', country: 'US', amount: 10 })),
  ...Array.from({ length: 2 }, () => ({ userId: 'y', country: 'DE', amount: 20 }))
]
const agg = A.aggregate(raw, { groupBy: ['country'], metrics: ['amount'], k: 3 })
chk('aggregate: US cohort (4) kept, DE cohort (2<k) suppressed', agg.length === 1 && agg[0].country === 'US' && agg[0].count === 4)
chk('aggregate: metric summed/averaged', agg[0].amount_sum === 40 && agg[0].amount_avg === 10)
chk('aggregate: refuses to group by an identifier', (() => { try { A.aggregate(raw, { groupBy: ['userId'], k: 3 }); return false } catch { return true } })())
chk('aggregate: refuses to group by free text', (() => { try { A.aggregate(raw, { groupBy: ['message'], k: 3 }); return false } catch { return true } })())

// ---- the release gate ----
chk('release ALLOWS a clean aggregate', A.assertAnonymous(agg, { k: 3 }).ok === true)
chk('release BLOCKS record-level (identifier present)', A.assertAnonymous([{ userId: 'u1', country: 'US' }], { k: 3 }).ok === false)
chk('release BLOCKS small cohort', A.assertAnonymous([{ country: 'US', count: 1 }], { k: 3 }).ok === false)
chk('release BLOCKS free-text leakage', A.assertAnonymous([{ country: 'US', count: 9, message: 'oops' }], { k: 3 }).ok === false)
chk('release BLOCKS a non-aggregate (no count)', A.assertAnonymous([{ country: 'US' }], { k: 3 }).ok === false)

// end-to-end: raw personal -> aggregate -> gate passes; name-strip alone -> gate fails
const strippedOnly = raw.map(A.stripIdentifiers) // pseudonymized, NOT anonymized
chk('name-stripping alone FAILS the gate (still record-level)', A.assertAnonymous(strippedOnly, { k: 3 }).ok === false)

console.log('\n' + (fail === 0 ? 'DATA-USE: ALL ' + pass + ' PASSED' : pass + ' passed, ' + fail + ' FAILED'))
process.exit(fail === 0 ? 0 : 1)
