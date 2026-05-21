/**
 * Contract-derived comic cid.
 *
 * A comic (paged or webtoon) is keyed in storage by a cid. When the
 * NFT's animation_url has no real IPFS CID, the cid is synthesized from
 * the smart-contract address — immutable and identical for every mint
 * of the series. This helper produces exactly that synthetic cid so the
 * server can look a comic up from just a contract address, matching the
 * contract branch of ComicReader.parseCid.
 *
 * Returns null if the input isn't a usable hex contract address.
 */
export function contractCid(contractAddress: string | null | undefined): string | null {
  const a = (contractAddress || '').trim().toLowerCase()
  if (!/^0x[0-9a-f]{4,}$/.test(a)) return null
  const seed = a.replace(/^0x/, '').replace(/[^a-z0-9]+/g, '').slice(0, 46)
  return seed ? 'lw' + seed : null
}
