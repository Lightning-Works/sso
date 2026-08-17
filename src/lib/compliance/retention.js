// Retention engine — GDPR requires not keeping personal data longer than needed.
// Each data category carries its own retention window (dataCategories.js); this
// turns that into a sweep plan a scheduled job runs. When a record passes its
// window, erasable categories are DELETED and regulated ones are ANONYMIZED (the
// legal-retention reason has now elapsed, so the identifiers can go). Pure logic.

const { getCategory } = require('./dataCategories')
const DAY_MS = 86400000

/** The instant after which a record of this category should be swept, or null if
 * it has no fixed window (lives with the account until deletion / withdrawal). */
function retentionDeadline(categoryId, createdAt) {
  const c = getCategory(categoryId)
  if (!c || c.retentionDays == null) return null
  return createdAt + c.retentionDays * DAY_MS
}

/** Is a record past its retention window as of `now`? */
function isExpired(categoryId, createdAt, now) {
  const d = retentionDeadline(categoryId, createdAt)
  return d != null && now >= d
}

/** What to do to an EXPIRED record: delete it if erasable, else anonymize it. */
function expiredAction(categoryId) {
  const c = getCategory(categoryId)
  return c && c.erasable ? 'delete' : 'anonymize'
}

/**
 * Given a batch of stored records [{categoryId, userId, createdAt, ref}], return
 * the ones due for sweeping, each tagged with its action. The job then applies the
 * action via its store adapters.
 */
function sweepPlan(records, now) {
  const out = []
  for (const r of records || []) {
    if (isExpired(r.categoryId, r.createdAt, now)) {
      out.push({ categoryId: r.categoryId, userId: r.userId, ref: r.ref, action: expiredAction(r.categoryId) })
    }
  }
  return out
}

module.exports = { retentionDeadline, isExpired, expiredAction, sweepPlan, DAY_MS }
