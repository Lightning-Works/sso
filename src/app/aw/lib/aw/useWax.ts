'use client'

import { useCallback, useEffect, useState } from 'react'
import { connectWax, autoLoginWax, transact, auth, currentAccount, type AwAction } from '../wax/session'

/** React wrapper over the WAX signing session (connect + submit transactions). */
export function useWax() {
  const [signer, setSigner] = useState<string | null>(currentAccount())
  const [connecting, setConnecting] = useState(false)

  const connect = useCallback(async () => {
    setConnecting(true)
    try { setSigner(await connectWax()) }
    finally { setConnecting(false) }
  }, [])

  // Silent reconnect from an existing MyCloudWallet session (no popup).
  const autoLogin = useCallback(async () => {
    const a = await autoLoginWax()
    if (a) setSigner(a)
    return a
  }, [])

  // On mount, silently restore the signer if a session is still live, so
  // features can sign without the user reconnecting after a refresh.
  useEffect(() => { if (!currentAccount()) autoLogin() }, [autoLogin])

  const submit = useCallback((actions: AwAction[]) => transact(actions), [])

  return { signer, connecting, connect, autoLogin, submit, auth }
}
