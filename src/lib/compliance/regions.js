// Region registry — the per-jurisdiction rules, as DATA (not code), so adding or
// updating a region when laws change is an edit here, never a code change. GoBanq
// supplies the binding notice text per region; this file only encodes the machine
// rules (which consents, which model, which rights, retention defaults, notice
// version pointer). Add a region by adding an entry + mapping its countries below.
//
// consentModel:
//   'opt-in'  = optional processing is OFF until the user explicitly enables it (GDPR/UK).
//   'opt-out' = optional processing is allowed unless the user turns it off (CCPA-style).
// The strict DEFAULT is used for any location we don't explicitly map, so an
// unknown user always gets the most protective treatment.

/** @typedef {'opt-in'|'opt-out'} ConsentModel */

const REGIONS = {
  'EU-GDPR': {
    id: 'EU-GDPR',
    name: 'European Union (GDPR)',
    law: 'GDPR',
    consentModel: 'opt-in',
    // Data-subject rights offered (ids matched by the rights engine / DSAR flow).
    rights: ['access', 'rectification', 'erasure', 'restriction', 'portability', 'objection', 'withdraw-consent'],
    // Digital-consent age (varies 13-16 across member states; 16 is the safe default).
    minAge: 16,
    // Pointer to the GoBanq-supplied notice text version for this region.
    noticeVersion: '2026-08-16-eu-v1'
  },
  'UK-GDPR': {
    id: 'UK-GDPR',
    name: 'United Kingdom (UK GDPR / DPA 2018)',
    law: 'UK-GDPR',
    consentModel: 'opt-in',
    rights: ['access', 'rectification', 'erasure', 'restriction', 'portability', 'objection', 'withdraw-consent'],
    minAge: 13,
    noticeVersion: '2026-08-16-uk-v1'
  },
  'US-CA-CCPA': {
    id: 'US-CA-CCPA',
    name: 'California (CCPA/CPRA)',
    law: 'CCPA',
    consentModel: 'opt-out', // Californians can opt OUT of sale/sharing; collection isn't consent-gated the same way.
    rights: ['know', 'access', 'delete', 'correct', 'opt-out-sale', 'limit-sensitive', 'non-discrimination'],
    minAge: 13, // under-16 sale requires opt-in; handled as a category rule.
    noticeVersion: '2026-08-16-ca-v1'
  },
  DEFAULT: {
    id: 'DEFAULT',
    name: 'Rest of world (strict default)',
    law: 'DEFAULT-STRICT',
    consentModel: 'opt-in', // treat unknown locations as strictly as GDPR.
    rights: ['access', 'rectification', 'erasure', 'withdraw-consent'],
    minAge: 16,
    noticeVersion: '2026-08-16-default-v1'
  }
}

// EU/EEA member-state ISO-3166 alpha-2 codes -> EU-GDPR.
const EU_EEA = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO' // EEA
]

/**
 * Resolve a region id from a coarse location. Country is ISO alpha-2; usState is
 * a US state code (only needed to catch California). Anything unmapped -> DEFAULT.
 * @param {{country?:string, usState?:string}} loc
 * @returns {string} region id
 */
function resolveRegionId(loc = {}) {
  const country = String(loc.country || '').toUpperCase()
  const state = String(loc.usState || '').toUpperCase()
  if (EU_EEA.includes(country)) return 'EU-GDPR'
  if (country === 'GB' || country === 'UK') return 'UK-GDPR'
  if (country === 'US' && state === 'CA') return 'US-CA-CCPA'
  return 'DEFAULT'
}

/** @param {string} id @returns {object} the region config (falls back to DEFAULT) */
function getRegion(id) {
  return REGIONS[id] || REGIONS.DEFAULT
}

module.exports = { REGIONS, EU_EEA, resolveRegionId, getRegion }
