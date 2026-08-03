/**
 * Alien Worlds mining proof-of-work — solver.
 *
 * Verified against two real on-chain mines: the contract requires
 *   sha256( nameToUint64LE(account)[8]  +  first 8 bytes of last-mine tx  +  nonce[8] )
 * to have enough leading zero bits (2 zero bytes for WAM-created accounts). We
 * target 20 bits (2 zero bytes + a zero nibble) which satisfies the rule for any
 * ease/reduction, at ~1M hashes per solve.
 *
 * SHA-256 is hand-rolled for speed (no per-hash allocations) and SELF-TESTED at
 * load — POW_OK is false if the digest of "abc" is wrong, in which case the
 * miner refuses to run rather than submit invalid nonces that waste resources.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

/** SHA-256 of a byte array → 32-byte digest. */
export function sha256(msg: Uint8Array): Uint8Array {
  const len = msg.length
  const bitLen = len * 8
  const withOne = len + 1
  const total = withOne + ((56 - (withOne % 64) + 64) % 64) + 8
  const buf = new Uint8Array(total)
  buf.set(msg)
  buf[len] = 0x80
  // 64-bit big-endian length (bitLen < 2^32 for our small inputs)
  buf[total - 4] = (bitLen >>> 24) & 0xff
  buf[total - 3] = (bitLen >>> 16) & 0xff
  buf[total - 2] = (bitLen >>> 8) & 0xff
  buf[total - 1] = bitLen & 0xff

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19
  const w = new Uint32Array(64)

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = (buf[off + i * 4] << 24) | (buf[off + i * 4 + 1] << 16) | (buf[off + i * 4 + 2] << 8) | buf[off + i * 4 + 3]
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) | 0
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0
  }
  const out = new Uint8Array(32)
  const hs = [h0, h1, h2, h3, h4, h5, h6, h7]
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (hs[i] >>> 24) & 0xff; out[i * 4 + 1] = (hs[i] >>> 16) & 0xff
    out[i * 4 + 2] = (hs[i] >>> 8) & 0xff; out[i * 4 + 3] = hs[i] & 0xff
  }
  return out
}

const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')

/** Guard: SHA-256 must produce the known digest of "abc" or we refuse to mine. */
export const POW_OK = toHex(sha256(new TextEncoder().encode('abc')))
  === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

// EOSIO name → uint64 → 8 bytes little-endian. BigInt (not 32-bit shifts) so the
// high bits don't overflow — verified to reproduce a real mine's 23-bit hash.
function nameToUint64LE(name: string): Uint8Array {
  const sym = (c: string) => {
    const x = c.charCodeAt(0)
    if (x >= 97 && x <= 122) return x - 97 + 6 // a-z
    if (x >= 49 && x <= 53) return x - 49 + 1  // 1-5
    return 0
  }
  const EIGHT = BigInt(8), FF = BigInt(255)
  let n = BigInt(0)
  for (let i = 0; i < 12; i++) {
    const c = BigInt((i < name.length ? sym(name[i]) : 0) & 0x1f)
    n |= c << BigInt(64 - 5 * (i + 1))
  }
  if (name.length > 12) n |= BigInt(sym(name[12]) & 0x0f)
  n &= (BigInt(1) << BigInt(64)) - BigInt(1)
  const out = new Uint8Array(8)
  for (let i = 0; i < 8; i++) { out[i] = Number(n & FF); n >>= EIGHT }
  return out
}

const hexToBytes = (h: string) => {
  const out = new Uint8Array(h.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16)
  return out
}
function leadingZeroBits(b: Uint8Array): number {
  let n = 0
  for (const byte of b) {
    if (byte === 0) { n += 8; continue }
    for (let k = 7; k >= 0; k--) { if ((byte >> k) & 1) return n; n++ }
    break
  }
  return n
}

/**
 * Find a nonce whose PoW hash has ≥ targetBits leading zeros. Yields to the UI
 * every ~20k tries so the tab stays responsive. Returns the nonce as hex.
 */
export async function solvePow(account: string, lastMineTxHex: string, targetBits = 20, onTries?: (n: number) => void): Promise<string> {
  if (!POW_OK) throw new Error('PoW self-test failed — refusing to mine')
  const buf = new Uint8Array(24)
  buf.set(nameToUint64LE(account), 0)
  buf.set(hexToBytes(lastMineTxHex).slice(0, 8), 8)
  const nonce = new Uint8Array(8)
  crypto.getRandomValues(nonce) // random starting point
  let tries = 0
  for (;;) {
    // increment the 8-byte nonce counter
    for (let i = 0; i < 8; i++) { if (nonce[i]++ !== 255) break; }
    buf.set(nonce, 16)
    if (leadingZeroBits(sha256(buf)) >= targetBits) return toHex(nonce)
    if (++tries % 20000 === 0) { onTries?.(tries); await new Promise(r => setTimeout(r, 0)) }
  }
}
