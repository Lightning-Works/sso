import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams
  // DiviGo's LWSSOSITELOGIN- handler sends the user back as
  // https://sso.lightningworks.io/?divigo=<code>. Forward to the wallet
  // page so DiviGoWalletPanel can pick up the code and finalize the link.
  const diviGoCode = typeof params.divigo === 'string' ? params.divigo : null
  if (diviGoCode) {
    const next = `/wallet/divi?divigo=${encodeURIComponent(diviGoCode)}`
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) redirect(next)
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/account')
  redirect('/login')
}
