// Anonymization gate — enforces that anything shared/sold is TRULY anonymous, not
// just "name removed". The rule the founder agreed to: anonymized == aggregated
// across many users so it can't be traced back to anyone. This module makes that a
// hard gate: only aggregate() output that passes assertAnonymous() may leave.
//
// Key facts encoded here:
//  - Stripping identifiers alone is PSEUDONYMIZATION (still personal data). Not enough.
//  - Free text (chat/messages/memos) is treated as un-anonymizable and is dropped.
//  - Aggregates below the k-anonymity floor (small cohorts) are suppressed, because
//    a group of one or two can re-identify a person.

// Fields that directly identify a person — never released, never a group-by key.
const DIRECT_IDENTIFIERS = new Set([
  'userid', 'user_id', 'id', 'username', 'handle', 'email', 'phone', 'number',
  'telegramid', 'telegram_id', 'address', 'wallet', 'name', 'ip', 'ssoid', 'sso_id'
])
// Unstructured fields — high re-identification risk; dropped, never aggregated/released.
const FREE_TEXT = new Set(['message', 'text', 'chat', 'content', 'note', 'memo', 'body', 'prompt', 'reply'])

const K_DEFAULT = 20 // minimum cohort size for an aggregate row to be releasable

const norm = (f) => String(f || '').toLowerCase()
const isIdentifier = (f) => DIRECT_IDENTIFIERS.has(norm(f))
const isFreeText = (f) => FREE_TEXT.has(norm(f))
const isReleasableField = (f) => !isIdentifier(f) && !isFreeText(f)

/** Pseudonymize (NOT anonymize): drop identifiers + free text. Documented as insufficient
 *  on its own — use only as an input step before aggregation. */
function stripIdentifiers(record) {
  const out = {}
  for (const k of Object.keys(record || {})) {
    if (isIdentifier(k) || isFreeText(k)) continue
    out[k] = record[k]
  }
  return out
}

/**
 * Aggregate records into releasable rows. Groups by non-identifying, non-free-text
 * fields, counts each group, and SUPPRESSES any group smaller than k. Optional
 * numeric metrics are summed/averaged per group. Returns only cohort rows >= k.
 * @param {object[]} records
 * @param {{groupBy:string[], metrics?:string[], k?:number}} opts
 */
function aggregate(records, { groupBy, metrics = [], k = K_DEFAULT } = {}) {
  if (!Array.isArray(groupBy) || groupBy.length === 0) throw new Error('aggregate requires groupBy fields')
  for (const g of groupBy) if (!isReleasableField(g)) throw new Error('cannot group by identifying/free-text field: ' + g)
  for (const m of metrics) if (!isReleasableField(m)) throw new Error('cannot aggregate identifying/free-text metric: ' + m)

  const groups = new Map()
  for (const r of records || []) {
    const key = groupBy.map((g) => String(r[g])).join('')
    if (!groups.has(key)) groups.set(key, { rows: [], keyVals: groupBy.map((g) => r[g]) })
    groups.get(key).rows.push(r)
  }
  const out = []
  for (const { rows, keyVals } of groups.values()) {
    if (rows.length < k) continue // suppress small cohort (k-anonymity)
    const row = { count: rows.length }
    groupBy.forEach((g, i) => { row[g] = keyVals[i] })
    for (const m of metrics) {
      const nums = rows.map((r) => Number(r[m])).filter((n) => isFinite(n))
      row[m + '_sum'] = nums.reduce((a, b) => a + b, 0)
      row[m + '_avg'] = nums.length ? row[m + '_sum'] / nums.length : null
    }
    out.push(row)
  }
  return out
}

/**
 * The RELEASE GATE. Returns { ok, reason } — only true if `output` is safe to
 * share/sell: an array of aggregate rows, every row's cohort >= k, and NO direct
 * identifier or free-text field anywhere. Anything record-level or small fails.
 */
function assertAnonymous(output, { k = K_DEFAULT } = {}) {
  if (!Array.isArray(output)) return { ok: false, reason: 'output must be aggregate rows (an array)' }
  for (const row of output) {
    if (!row || typeof row !== 'object') return { ok: false, reason: 'each row must be an object' }
    for (const f of Object.keys(row)) {
      if (isIdentifier(f)) return { ok: false, reason: 'identifier field present: ' + f }
      if (isFreeText(f)) return { ok: false, reason: 'free-text field present: ' + f }
    }
    if (!('count' in row)) return { ok: false, reason: 'row missing cohort count (not an aggregate)' }
    if (Number(row.count) < k) return { ok: false, reason: 'cohort smaller than k=' + k + ' (re-identifiable)' }
  }
  return { ok: true, reason: null }
}

module.exports = {
  stripIdentifiers, aggregate, assertAnonymous,
  isReleasableField, DIRECT_IDENTIFIERS, FREE_TEXT, K_DEFAULT
}
