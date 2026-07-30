'use client'

import { useCallback, useState } from 'react'
import { connectWax, transact, auth, currentAccount, type AwAction } from '../wax/session'

/** React wrapper over the WAX signing session (connect + submit transactions). */
export function useWax() {
  const [signer, setSigner] = useState<string | null>(currentAccount())
  const [connecting, setConnecting] = useState(false)

  const connect = useCallback(async () => {
    setConnecting(true)
    try { setSigner(await connectWax()) }
    finally { setConnecting(false) }
  }, [])

  const submit = useCallback((actions: AwAction[]) => transact(actions), [])

  return { signer, connecting, connect, submit, auth }
}
