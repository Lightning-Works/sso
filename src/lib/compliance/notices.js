// Key public statements, versioned so GoBanq supplies/finalizes the binding text
// and so the app can't accidentally ship a reassurance without its matching caveat.
// The data-sale statement is the one the founder asked for: it MUST show both facts
// at EQUAL prominence (never sell identifying data / may sell anonymized aggregates).
// enforceEqualProminence() below fails a build/test if either half is missing, so
// the honest framing can't be quietly dropped to a footnote later.

const STATEMENTS = {
  data_sale: {
    id: 'data_sale',
    optInCategory: 'anonymized_sale',
    // BOTH lines render at the same size/weight. GoBanq confirms final wording.
    promise: 'We never sell data that identifies you.',
    caveat: 'We may sell anonymized, aggregated insights that can never be traced back to you.',
    detail: 'Anonymized means aggregated across many users, not just your name removed. You can turn this off at any time, and it is off unless you opt in.',
    render: 'equal-prominence',
    draft: true // needs GoBanq sign-off before it is treated as binding
  },
  ai_personalization: {
    id: 'ai_personalization',
    optInCategory: 'ai_personalization',
    promise: 'The assistant can remember YOU, from your own chats with it.',
    caveat: 'It never reads or stores what other people say in group chats.',
    detail: 'Only your direct interactions with the assistant are used, and only if you allow it.',
    render: 'equal-prominence',
    draft: true
  }
}

/**
 * Guard: a data-use statement must carry BOTH the reassurance and the caveat, each
 * non-empty, so a prominent promise can never ship without its equal-prominence
 * counterpart (that framing is a dark pattern; see the design decision). Returns
 * the statement or throws.
 */
function enforceEqualProminence(id) {
  const s = STATEMENTS[id]
  if (!s) throw new Error('unknown statement: ' + id)
  if (!s.promise || !s.promise.trim() || !s.caveat || !s.caveat.trim()) {
    throw new Error('statement "' + id + '" must have BOTH promise and caveat at equal prominence')
  }
  return s
}

/** The pair a UI should render side-by-side / same-weight. */
function statementPair(id) {
  const s = enforceEqualProminence(id)
  return { promise: s.promise, caveat: s.caveat, detail: s.detail, optInCategory: s.optInCategory, render: s.render }
}

module.exports = { STATEMENTS, enforceEqualProminence, statementPair }
