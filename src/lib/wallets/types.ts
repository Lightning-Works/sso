export type WalletChain = 'evm' | 'solana' | 'wax'

export interface ConnectedWallet {
  chain: WalletChain
  provider: string       // 'metamask', 'phantom', 'solflare', 'wax'
  address: string        // public address
  displayAddress: string // shortened for display
  chainId?: number       // for EVM chains
  chainName?: string     // 'Ethereum', 'Polygon', etc.
}

export interface WalletToken {
  symbol: string
  name: string
  balance: string
  decimals: number
  address?: string  // token contract address (null for native)
  logoUrl?: string  // token logo image URL
  chain: WalletChain
  walletAddress: string
}

export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}
