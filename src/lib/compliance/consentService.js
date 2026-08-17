// Consent service — records consent, reads current consent, and exposes the
// RUNTIME collection gate every app calls before capturing optional data. The
// underlying store is injected (so this is testable and not tied to Supabase);
// each consent change is written as a NEW immutable record (audit trail), and the
// "current" state is the latest record for that user.
//
// Injected `store`:
//   saveConsent(record)      -> persist an immutable consent record
//   getLatestConsent(userId) -> the most recent record, or null

const { buildConsentRecord, canCollect } = require('./consentEngine')

/** Record a fresh consent decision (first run, or a change). Returns the stored record. */
async function recordConsent(store, { userId, regionId, choices, ip, userAgent, now }) {
  const record = buildConsentRecord({ userId, regionId, choices, ip, userAgent, now })
  await store.saveConsent(record)
  return record
}

/** Current consent state for a user, or null if they have never consented. */
async function getConsentState(store, userId) {
  const rec = await store.getLatestConsent(userId)
  if (!rec) return null
  return { regionId: rec.regionId, choices: rec.choices || {}, noticeVersion: rec.noticeVersion, at: rec.at }
}

/**
 * THE RUNTIME GATE. May we collect `categoryId` for this user right now? Essential
 * categories are always allowed. Optional ones follow the user's saved consent in
 * their region. With NO consent on file we fall back to the strict DEFAULT region,
 * so nothing optional is ever captured before the user has decided.
 */
async function mayCollect(store, userId, categoryId) {
  const st = await getConsentState(store, userId)
  if (!st) return canCollect(categoryId, {}, 'DEFAULT')
  return canCollect(categoryId, st.choices, st.regionId)
}

/** Filter a list of category ids down to the ones we may collect for this user. */
async function collectableCategories(store, userId, categoryIds) {
  const out = []
  for (const id of categoryIds) if (await mayCollect(store, userId, id)) out.push(id)
  return out
}

/**
 * Update/withdraw consent: merges `changes` onto the current choices and writes a
 * NEW record (the old one stays as history). Region is preserved from the latest
 * record (or DEFAULT if none). Withdrawing = pass { category:false }.
 */
async function updateConsent(store, userId, changes, meta = {}) {
  const st = await getConsentState(store, userId)
  const regionId = st ? st.regionId : (meta.regionId || 'DEFAULT')
  const choices = { ...(st ? st.choices : {}), ...changes }
  return recordConsent(store, { userId, regionId, choices, ip: meta.ip, userAgent: meta.userAgent, now: meta.now })
}

module.exports = { recordConsent, getConsentState, mayCollect, collectableCategories, updateConsent }
