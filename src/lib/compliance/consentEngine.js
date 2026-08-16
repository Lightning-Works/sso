// Consent engine — the pure decision logic that ties regions + data categories
// together. No I/O, no DB, no framework: fully testable. The SSO route handlers
// call these functions to (a) render the right first-run consent screen for the
// user's region, (b) record consent in the right shape, (c) GATE every collection
// so we only ever capture what the region + the user's choices allow ("capture-
// capable but consent-governed"), and (d) drive the export/delete (DSAR) flows.

const { getRegion, resolveRegionId } = require('./regions')
const { DATA_CATEGORIES, essentialCategories, optionalCategories, getCategory } = require('./dataCategories')

/**
 * What the first-run consent screen should present for a location. Essential
 * categories are shown as "required to use the wallet" (no toggle). Optional ones
 * are shown as toggles whose DEFAULT depends on the region's consent model
 * (opt-in => off; opt-out => on-but-refusable).
 * @param {{country?:string, usState?:string}|string} locOrRegionId
 */
function buildConsentRequest(locOrRegionId) {
  const regionId = typeof locOrRegionId === 'string' ? locOrRegionId : resolveRegionId(locOrRegionId)
  const region = getRegion(regionId)
  const defaultOn = region.consentModel === 'opt-out'
  return {
    regionId: region.id,
    regionName: region.name,
    law: region.law,
    noticeVersion: region.noticeVersion,
    consentModel: region.consentModel,
    rights: region.rights,
    essential: essentialCategories().map((c) => ({
      id: c.id, label: c.label, description: c.description, purpose: c.description
    })),
    optional: optionalCategories().map((c) => ({
      id: c.id,
      label: c.label,
      description: c.description,
      lawfulBasis: c.lawfulBasis,
      default: defaultOn, // opt-in regions => false; opt-out => true (still refusable)
      crossBorderProcessor: c.crossBorderProcessor || null
    }))
  }
}

/**
 * THE COLLECTION GATE. Given a category, the user's recorded consent choices, and
 * their region, may we collect it right now? Essential categories are always
 * allowed (contract). Optional categories follow the region model: opt-in needs an
 * explicit true; opt-out allows unless an explicit false. Unknown category => NO.
 * @param {string} categoryId
 * @param {Record<string,boolean>} consent  the user's saved {categoryId:boolean}
 * @param {string} regionId
 * @returns {boolean}
 */
function canCollect(categoryId, consent, regionId) {
  const cat = getCategory(categoryId)
  if (!cat) return false
  if (cat.essential) return true
  const region = getRegion(regionId)
  const choice = consent ? consent[categoryId] : undefined
  if (region.consentModel === 'opt-out') return choice !== false // allowed unless refused
  return choice === true // opt-in: only if explicitly enabled
}

/**
 * The record to PERSIST when a user consents. The route handler adds ip + userId
 * and stores it (immutably) in consent_records. Optional choices are normalized to
 * booleans for every optional category so the gate is unambiguous.
 * @param {object} args {regionId, choices, ip, userAgent, userId, now}
 */
function buildConsentRecord({ regionId, choices = {}, ip, userAgent, userId, now }) {
  const region = getRegion(regionId)
  const normalized = {}
  for (const c of optionalCategories()) {
    const v = choices[c.id]
    normalized[c.id] = region.consentModel === 'opt-out' ? v !== false : v === true
  }
  return {
    userId: userId || null,
    regionId: region.id,
    noticeVersion: region.noticeVersion,
    consentModel: region.consentModel,
    choices: normalized,
    ip: ip || null, // IP-as-proof of consent (legitimate); NOT ongoing tracking
    userAgent: userAgent ? String(userAgent).slice(0, 512) : null,
    at: now || null // caller stamps time (kept injectable for testing)
  }
}

/** Rights available to a user in a region (drives the DSAR UI). */
function rightsForRegion(regionId) {
  return getRegion(regionId).rights.slice()
}

/**
 * ERASURE PLAN for a "delete all my data" request. Walks every category and sorts
 * it into delete / anonymize / retain, honoring the legal-retention carve-out for
 * financial/AML records. This is what makes "right to be forgotten" correct for a
 * custodial money app: erase what we can, anonymize+retain what the law requires.
 * @param {string} regionId
 */
function erasurePlan(regionId) {
  const del = []
  const retain = []
  for (const cat of Object.values(DATA_CATEGORIES)) {
    if (cat.erasable) del.push({ id: cat.id, stores: cat.stores, action: 'delete' })
    else retain.push({ id: cat.id, stores: cat.stores, action: 'anonymize-or-retain', reason: cat.retentionReason })
  }
  return {
    regionId: getRegion(regionId).id,
    delete: del, // fully removable
    retain, // kept (anonymized where possible) due to legal obligation
    note: 'Financial/identity/consent records are retained (anonymized where possible) to meet AML and consent-proof obligations; everything else is deleted.'
  }
}

/** Full data map for the privacy notice / records-of-processing. */
function dataMap() {
  return Object.values(DATA_CATEGORIES).map((c) => ({
    id: c.id, label: c.label, purpose: c.description, lawfulBasis: c.lawfulBasis,
    essential: c.essential, retentionDays: c.retentionDays, stores: c.stores,
    sensitivity: c.sensitivity, crossBorderProcessor: c.crossBorderProcessor || null
  }))
}

module.exports = {
  buildConsentRequest,
  canCollect,
  buildConsentRecord,
  rightsForRegion,
  erasurePlan,
  dataMap
}
