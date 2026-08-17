// Data-category registry — this is BOTH the data map (what we hold, where, why,
// how long) AND the collection-governance table. Every kind of personal data the
// system may touch is one entry here. Add a data type by adding an entry; that is
// what makes new collection lawful-by-design and reachable by the export/delete
// flows. As laws change, you edit the rule here, not the code that collects.
//
// lawfulBasis (GDPR): 'contract' | 'consent' | 'legal_obligation' | 'legitimate_interest'
// essential: true  = required to provide the wallet -> collected under 'contract',
//                     NOT a separate opt-in, and generally NOT erasable on request
//                     because financial/AML law requires retention.
// essential: false = optional -> gated by consent (opt-in regions) / opt-out.
// stores: where it physically lives, so export + erasure can actually reach it.
// erasable: can it be fully deleted on a valid erasure request, or only
//           anonymized/retained because a legal obligation requires keeping it.

/** @typedef {'contract'|'consent'|'legal_obligation'|'legitimate_interest'} LawfulBasis */

const DATA_CATEGORIES = {
  identity: {
    id: 'identity',
    label: 'Account identity',
    description: 'Username, Telegram/route id, email if provided.',
    lawfulBasis: 'contract',
    essential: true,
    retentionDays: 3650, // kept for the AML/financial record window after account closure
    retentionReason: 'AML / financial-services recordkeeping obligation',
    erasable: false, // anonymize when allowed; cannot fully delete regulated records
    stores: ['divigo.mongo.Users', 'sso.supabase.users', 'sso.supabase.divigo_links'],
    sensitivity: 'high'
  },
  wallet_tx: {
    id: 'wallet_tx',
    label: 'Wallet & transaction records',
    description: 'Balances, addresses, and the history of sends/receives.',
    lawfulBasis: 'contract',
    essential: true,
    retentionDays: 3650,
    retentionReason: 'AML / financial-services recordkeeping obligation',
    erasable: false,
    stores: ['divigo.mongo.Wallets', 'divigo.mongo.transactions'],
    sensitivity: 'high'
  },
  consent_record: {
    id: 'consent_record',
    label: 'Consent record',
    description: 'Proof the user consented: who, when, which notice version, and the IP used at that moment.',
    lawfulBasis: 'legal_obligation', // GDPR requires you to be able to DEMONSTRATE consent
    essential: true,
    retentionDays: 3650,
    retentionReason: 'Must be retained as evidence of consent for the limitation period',
    erasable: false, // the proof itself must survive an erasure request
    stores: ['sso.supabase.consent_records'],
    sensitivity: 'medium'
  },
  device_info: {
    id: 'device_info',
    label: 'Device information',
    description: 'Browser/user-agent, device type, OS, screen — captured only if allowed.',
    lawfulBasis: 'consent',
    essential: false,
    retentionDays: 395,
    retentionReason: 'Diagnostics / fraud signals; short retention',
    erasable: true,
    stores: ['sso.supabase.device_events'],
    sensitivity: 'medium'
  },
  ip_activity: {
    id: 'ip_activity',
    label: 'IP & activity beyond consent-proof',
    description: 'Ongoing IP/geo/usage logging (separate from the one-time consent-proof IP).',
    lawfulBasis: 'consent',
    essential: false,
    retentionDays: 90,
    retentionReason: 'Security/analytics; minimized retention',
    erasable: true,
    stores: ['sso.supabase.activity_logs'],
    sensitivity: 'medium'
  },
  analytics: {
    id: 'analytics',
    label: 'Product analytics',
    description: 'How features are used, to improve the product.',
    lawfulBasis: 'consent',
    essential: false,
    retentionDays: 395,
    retentionReason: 'Product analytics',
    erasable: true,
    stores: ['sso.supabase.analytics_events'],
    sensitivity: 'low'
  },
  agent_chat: {
    id: 'agent_chat',
    label: 'AI assistant conversations',
    description: 'Messages sent to/from the AI concierge. NOTE: processed by x.ai (US) — a cross-border transfer; PII must be minimized before sending to the model.',
    lawfulBasis: 'consent',
    essential: false,
    retentionDays: 180,
    retentionReason: 'Assistant quality / abuse review; short retention',
    erasable: true,
    stores: ['kinetink.supabase.user_knowledge', 'divigo.mongo.agent_chats'],
    sensitivity: 'high',
    crossBorderProcessor: 'x.ai (US)'
  },
  discoverability: {
    id: 'discoverability',
    label: 'Be findable by name',
    description: 'Lets people who know your name find you to send funds. Off by default.',
    lawfulBasis: 'consent',
    essential: false,
    retentionDays: null, // lives with the account while enabled
    retentionReason: 'Active while the user keeps it enabled',
    erasable: true,
    stores: ['sso.supabase.discoverability'],
    sensitivity: 'medium'
  },
  marketing: {
    id: 'marketing',
    label: 'Marketing messages',
    description: 'Product news and offers. Off by default.',
    lawfulBasis: 'consent',
    essential: false,
    retentionDays: null,
    retentionReason: 'Until the user unsubscribes',
    erasable: true,
    stores: ['sso.supabase.marketing_prefs'],
    sensitivity: 'low'
  },
  ai_personalization: {
    id: 'ai_personalization',
    label: 'Let the AI remember you',
    description: "Use your OWN past chats with the assistant to personalize how it helps you. Only your interactions with the bot — never other people's messages.",
    lawfulBasis: 'consent',
    essential: false,
    retentionDays: 365,
    retentionReason: 'Personalization while you use the assistant',
    erasable: true,
    stores: ['kinetink.supabase.user_knowledge'],
    sensitivity: 'high'
  },
  product_improvement: {
    id: 'product_improvement',
    label: 'Help improve the product',
    description: 'Let us use your data in ANONYMIZED, aggregated form to make the assistant better. Anonymized = aggregated so it can never be traced back to you (not just your name removed).',
    lawfulBasis: 'consent',
    essential: false,
    retentionDays: 730,
    retentionReason: 'Model/product improvement',
    erasable: true, // the personal source data is erasable; truly-anonymous aggregates are out of scope
    stores: ['sso.supabase.improvement_optin'],
    sensitivity: 'high'
  },
  anonymized_sale: {
    id: 'anonymized_sale',
    label: 'Share anonymized insights with others',
    description: 'Let us sell ANONYMIZED, aggregated insights to other companies. Never anything that identifies you. Separate choice; off by default.',
    lawfulBasis: 'consent',
    essential: false,
    retentionDays: null,
    retentionReason: 'Active while you allow it',
    erasable: true,
    stores: ['sso.supabase.datasale_optin'],
    sensitivity: 'high'
  }
}

/** @returns {string[]} all category ids */
const allCategoryIds = () => Object.keys(DATA_CATEGORIES)
/** @returns {object[]} categories required to run the wallet (collected under contract) */
const essentialCategories = () => Object.values(DATA_CATEGORIES).filter((c) => c.essential)
/** @returns {object[]} optional categories (consent-gated) */
const optionalCategories = () => Object.values(DATA_CATEGORIES).filter((c) => !c.essential)
/** @param {string} id */
const getCategory = (id) => DATA_CATEGORIES[id] || null

module.exports = {
  DATA_CATEGORIES,
  allCategoryIds,
  essentialCategories,
  optionalCategories,
  getCategory
}
