/**
 * Shared validation for token gate rules
 */

export const VALID_RULE_TYPES = ['nft_ownership', 'token_balance', 'nft_trait', 'nft_collection_count', 'custom_token'] as const
export const VALID_OPERATORS = ['must_have', 'must_not_have', 'gte', 'lte'] as const
export const VALID_CHAINS = ['evm', 'solana', 'wax', 'divi'] as const
export const MAX_RULES = 20
export const MAX_NAME_LENGTH = 200
export const MAX_DESC_LENGTH = 2000

/**
 * Validate an array of gate rules. Returns error string or null if valid.
 */
export function validateRules(rules: Record<string, unknown>[]): string | null {
  if (rules.length === 0) return 'At least one rule is required'
  if (rules.length > MAX_RULES) return `Maximum ${MAX_RULES} rules per gate`

  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]
    const ruleType = (r.rule_type || r.type) as string
    if (!VALID_RULE_TYPES.includes(ruleType as typeof VALID_RULE_TYPES[number])) {
      return `Rule ${i + 1}: invalid rule_type "${ruleType}". Must be one of: ${VALID_RULE_TYPES.join(', ')}`
    }

    const op = (r.operator || 'must_have') as string
    if (!VALID_OPERATORS.includes(op as typeof VALID_OPERATORS[number])) {
      return `Rule ${i + 1}: invalid operator "${op}". Must be one of: ${VALID_OPERATORS.join(', ')}`
    }

    const chain = r.chain as string | undefined
    if (chain && !VALID_CHAINS.includes(chain as typeof VALID_CHAINS[number])) {
      return `Rule ${i + 1}: invalid chain "${chain}". Must be one of: ${VALID_CHAINS.join(', ')}`
    }

    const amount = r.amount ?? r.min_balance ?? r.min_count
    if (amount !== undefined && amount !== null && (typeof amount !== 'number' || amount < 0)) {
      return `Rule ${i + 1}: amount must be a non-negative number`
    }

    // Validate required fields per rule type
    if (ruleType === 'nft_trait' && !r.trait_type) {
      return `Rule ${i + 1}: nft_trait requires trait_type`
    }
    if ((ruleType === 'nft_ownership' || ruleType === 'nft_collection_count' || ruleType === 'nft_trait') && !r.collection_address && !r.collection) {
      return `Rule ${i + 1}: ${ruleType} requires collection_address`
    }
  }

  return null
}
