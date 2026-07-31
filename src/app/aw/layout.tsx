import type { ReactNode } from 'react'

/**
 * Loads the four Google Fonts the AWW design requires (Chakra Petch, Inter,
 * JetBrains Mono, Bangers). Scoped to the /aw segment so the rest of the SSO
 * is unaffected. React hoists these <link> tags into <head>.
 */
export default function AwLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&family=Bangers&display=swap"
      />
      {children}
    </>
  )
}
