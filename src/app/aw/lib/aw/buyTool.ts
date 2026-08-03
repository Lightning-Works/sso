/**
 * Buy an AtomicMarket listing in-app — no AtomicHub needed.
 *
 * AtomicMarket is an on-chain contract, so buying is just a signed transaction
 * (approved in MyCloudWallet via our WharfKit session). WAX-priced sales use a
 * one-transaction deposit+purchase: transfer the exact price into the buyer's
 * atomicmarket balance with memo "deposit", then purchasesale spends it.
 *
 * Verified on-chain: atomicmarket::purchasesale(buyer, sale_id,
 * intended_delphi_median, taker_marketplace). intended_delphi_median = 0 for
 * WAX-priced sales; taker_marketplace = "" for the default.
 */
import type { AwAction } from '../wax/session'

const waxAsset = (amount: number) => `${amount.toFixed(8)} WAX`

export function buildBuyActions(buyer: string, saleId: string, priceWax: number): AwAction[] {
  const authorization = [{ actor: buyer, permission: 'active' }]
  return [
    {
      account: 'eosio.token', name: 'transfer', authorization,
      data: { from: buyer, to: 'atomicmarket', quantity: waxAsset(priceWax), memo: 'deposit' },
    },
    {
      account: 'atomicmarket', name: 'purchasesale', authorization,
      data: { buyer, sale_id: saleId, intended_delphi_median: 0, taker_marketplace: '' },
    },
  ]
}
