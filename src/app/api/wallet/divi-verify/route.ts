import { NextResponse } from 'next/server'
import { validateDiviAddress, verifyDiviSignature } from '@/lib/wallets/divi'
import { getDiviBalance } from '@/lib/wallets/balances/divi-balances'

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const address = body.address as string | undefined
  const message = body.message as string | undefined
  const signature = body.signature as string | undefined

  if (!address || !message || !signature) {
    return NextResponse.json({ error: 'address, message, and signature are required' }, { status: 400 })
  }

  if (!validateDiviAddress(address)) {
    return NextResponse.json({ error: 'Invalid DIVI address' }, { status: 400 })
  }

  // Verify the signature via Divi RPC
  const verified = await verifyDiviSignature(address, message, signature)
  if (!verified) {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 })
  }

  // Fetch balance while we're at it
  const balance = await getDiviBalance(address)

  return NextResponse.json({ verified: true, balance })
}
