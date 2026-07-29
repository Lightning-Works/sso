'use client'

import s from '../aw.module.css'
import { Card, Grid, Empty, PageHead } from '../ui/primitives'
import type { FeatureProps } from './ctx'

export default function Inventory({ holdings }: FeatureProps) {
  const total = holdings?.nfts.reduce((sum, n) => sum + n.count, 0) ?? 0
  return (
    <>
      <PageHead title="Inventory" desc="Your Alien Worlds NFTs — land, tools, avatars, weapons and more." />
      <Card title={`Alien Worlds NFTs${total ? ` — ${total}` : ''}`} tag="live read">
        {!holdings ? <Empty text="Load an account to see your NFTs." /> : (
          holdings.nfts.length === 0 ? <Empty text="No Alien Worlds NFTs held on this account." /> : (
            <Grid>
              {holdings.nfts.slice(0, 60).map((n, i) => (
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
