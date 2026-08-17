const R = require('../retention.js')
const DAY = R.DAY_MS
let pass = 0, fail = 0
const chk = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n) } else { fail++; console.log('  ❌ ' + n) } }
const T0 = 1_700_000_000_000

chk('analytics deadline = created + 395d', R.retentionDeadline('analytics', T0) === T0 + 395 * DAY)
chk('marketing has no fixed window (null)', R.retentionDeadline('marketing', T0) === null)
chk('wallet_tx window = 3650d', R.retentionDeadline('wallet_tx', T0) === T0 + 3650 * DAY)

chk('analytics record 400d old -> expired', R.isExpired('analytics', T0, T0 + 400 * DAY))
chk('analytics record 100d old -> not expired', R.isExpired('analytics', T0, T0 + 100 * DAY) === false)
chk('marketing never expires (null window)', R.isExpired('marketing', T0, T0 + 99999 * DAY) === false)

chk('expired analytics (erasable) -> delete', R.expiredAction('analytics') === 'delete')
chk('expired wallet_tx (regulated) -> anonymize', R.expiredAction('wallet_tx') === 'anonymize')

const recs = [
  { categoryId: 'analytics', userId: 'u1', createdAt: T0, ref: 'a1' },        // 400d later -> expired -> delete
  { categoryId: 'device_info', userId: 'u1', createdAt: T0, ref: 'd1' },      // 395d window -> at 400d expired -> delete
  { categoryId: 'wallet_tx', userId: 'u1', createdAt: T0, ref: 'w1' },        // 3650d -> not yet
  { categoryId: 'marketing', userId: 'u1', createdAt: T0, ref: 'm1' }         // null -> never
]
const plan = R.sweepPlan(recs, T0 + 400 * DAY)
chk('sweep: only analytics + device due', plan.length === 2 && plan.every(p => ['analytics', 'device_info'].includes(p.categoryId)))
chk('sweep: both tagged delete', plan.every(p => p.action === 'delete'))
const plan2 = R.sweepPlan(recs, T0 + 4000 * DAY)
chk('sweep after 4000d: wallet_tx now due -> anonymize', plan2.some(p => p.categoryId === 'wallet_tx' && p.action === 'anonymize'))

console.log('\n' + (fail === 0 ? 'RETENTION: ALL ' + pass + ' PASSED' : pass + ' passed, ' + fail + ' FAILED'))
process.exit(fail === 0 ? 0 : 1)
