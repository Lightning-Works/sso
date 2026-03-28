import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { syncContract } from '@/lib/blockchain/lw-nft-sync'

const CRON_SECRET = process.env.CRON_SECRET || ''

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: contracts } = await supabase
    .from('lw_nft_contracts')
    .select('id, collection_name')
    .order('id')

  if (!contracts || contracts.length === 0) {
    return NextResponse.json({ status: 'no contracts' })
  }

  const results: { collection: string; nft_count?: number; error?: string }[] = []

  for (const contract of contracts) {
    try {
      const result = await syncContract(contract.id)
      results.push({ collection: contract.collection_name, nft_count: result.nft_count })
    } catch (e) {
      results.push({ collection: contract.collection_name, error: (e as Error).message })
    }
    // Rate limit between contracts
    await new Promise(r => setTimeout(r, 500))
  }

  return NextResponse.json({ status: 'ok', results })
}
