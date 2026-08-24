'use client'

/**
 * Persistent media cache (IndexedDB) for Alien Worlds NFT art.
 *
 * The animated originals live on flaky public IPFS gateways, so once we've
 * downloaded one for an NFT the user owns we keep the bytes on their device.
 * The second visit loads instantly from disk and works even if the gateway is
 * down. Entries are keyed by a stable id (the asset id). purgeExcept() drops the
 * art for anything no longer in the set (sold / transferred out), so the cache
 * never grows without bound.
 *
 * Everything is best-effort: any IDB failure (private window, quota, no support)
 * resolves to null/undefined and the caller falls back to loading over the wire.
 */

const DB = 'aww-media'
const STORE = 'blobs'

function open(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return open().then(db => new Promise<T | null>(resolve => {
    if (!db) return resolve(null)
    try {
      const t = db.transaction(STORE, mode)
      const req = fn(t.objectStore(STORE))
      req.onsuccess = () => resolve(req.result as T)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  }))
}

/** Cached blob for a key, or null if absent/unavailable. */
export async function getMedia(key: string): Promise<Blob | null> {
  const v = await tx<Blob>('readonly', s => s.get(key))
  return v instanceof Blob ? v : null
}

export async function putMedia(key: string, blob: Blob): Promise<void> {
  await tx('readwrite', s => s.put(blob, key))
}

/** Every stored key. */
export async function allKeys(): Promise<string[]> {
  const keys = await tx<IDBValidKey[]>('readonly', s => s.getAllKeys())
  return (keys || []).map(String)
}

/** Delete any cached media whose key is NOT in `keep` (e.g. sold / removed NFTs). */
export async function purgeExcept(keep: string[]): Promise<void> {
  const set = new Set(keep)
  const keys = await allKeys()
  await Promise.all(keys.filter(k => !set.has(k)).map(k => tx('readwrite', s => s.delete(k))))
}
