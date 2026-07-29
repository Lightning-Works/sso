'use client'

import s from '../aw.module.css'
import { Card, Grid, Empty, PageHead } from '../ui/primitives'
import type { FeatureProps } from './ctx'

/** NFT inventory. An optional `schema` filters to one category (Land, Tools…). */
export default function Inventory({ holdings, schema }: FeatureProps & { schema?: string }) {
  const all = holdings?.nfts ?? []
  const items = schema ? all.filter(n => (n.schema || '').toLowerCase().includes(schema.toLowerCase())) : all
  const total = items.reduce((sum, n) => sum + n.count, 0)
  const label = schema ? schema[0].toUpperCase() + schema.slice(1) : 'All'

  return (
    <>
      <PageHead title={`Inventory · ${label}`} desc="Your Alien Worlds NFTs — land, tools, avatars, weapons and more." />
      <Card title={`${label}${total ? ` — ${total}` : ''}`} tag="live read">
        {!holdings ? <Empty text="Connect or load a WAX account to see your NFTs." /> : (
          items.length === 0 ? <Empty text={schema ? `No ${label.toLowerCase()} NFTs on this account.` : 'No Alien Worlds NFTs held.'} /> : (
            <Grid>
              {items.slice(0, 80).map((n, i) => (
                <div key={i} className={s.nft}>
                  <div className={s.nftSchema}>{n.schema || 'item'}</div>
                  <div className={s.nftMeta}>template #{n.template_id} · ×{n.count}</div>
                </div>
              ))}
            </Grid>
          )
        )}
      </Card>
    </>
  )
}
