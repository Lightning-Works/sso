// Data-Subject-Access-Request (DSAR) service — the "way to comply" machinery:
// EXPORT everything we hold on a user, and ERASE it per the erasure plan (delete
// what we can, anonymize+retain what AML/financial/consent-proof law requires).
//
// Store access is injected so this stays testable and works across the several
// systems that hold data (DiviGo Mongo, SSO Supabase, Kinetink). The caller wires
// real readers/deleters per category; every category in the data map is walked, so
// a newly-registered category is automatically included in export + erasure.
//
// Injected `adapters`:
//   readCategory(categoryId, userId)      -> the user's data for that category (any JSON)
//   deleteCategory(categoryId, userId)    -> hard-delete that category's data
//   anonymizeCategory(categoryId, userId) -> strip identifiers, keep the regulated record

const { DATA_CATEGORIES } = require('./dataCategories')
const { erasurePlan, dataMap } = require('./consentEngine')

/**
 * Build a full export bundle (GDPR access/portability). Reads every category; a
 * category with no reader or a read error is reported, never silently dropped.
 * @param {number|string} [now] injectable timestamp (caller stamps the real time)
 */
async function exportUserData(adapters, userId, now) {
  const bundle = { userId, generatedAt: now || null, map: dataMap(), categories: {} }
  for (const cat of Object.values(DATA_CATEGORIES)) {
    if (!adapters || typeof adapters.readCategory !== 'function') {
      bundle.categories[cat.id] = { status: 'no-reader' }
      continue
    }
    try {
      bundle.categories[cat.id] = { status: 'ok', data: await adapters.readCategory(cat.id, userId) }
    } catch (e) {
      bundle.categories[cat.id] = { status: 'error', error: e && e.message }
    }
  }
  return bundle
}

/**
 * Execute a "delete all my data" request. Erasable categories are hard-deleted;
 * legally-retained categories (financial/identity/consent-proof) are anonymized and
 * kept. Returns exactly what happened, so the user can be given an honest receipt.
 */
async function eraseUserData(adapters, userId, regionId) {
  const plan = erasurePlan(regionId)
  const result = { userId, regionId: plan.regionId, deleted: [], retained: [], errors: [], note: plan.note }
  for (const d of plan.delete) {
    try {
      if (adapters && typeof adapters.deleteCategory === 'function') await adapters.deleteCategory(d.id, userId)
      result.deleted.push(d.id)
    } catch (e) {
      result.errors.push({ id: d.id, op: 'delete', error: e && e.message })
    }
  }
  for (const r of plan.retain) {
    try {
      if (adapters && typeof adapters.anonymizeCategory === 'function') await adapters.anonymizeCategory(r.id, userId)
      result.retained.push(r.id)
    } catch (e) {
      result.errors.push({ id: r.id, op: 'anonymize', error: e && e.message })
    }
  }
  return result
}

module.exports = { exportUserData, eraseUserData }
