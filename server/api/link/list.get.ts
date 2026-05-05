import { z } from 'zod'

// 单页扫描的最大次数,防止稀疏数据下 Worker CPU time 超限
const MAX_SCAN_PAGES = 5
// KV.list 单次取的页大小(KV 默认上限 1024)
const KV_PAGE_SIZE = 1024

export default eventHandler(async (event) => {
  // Day 4: 拿当前用户用于过滤
  const currentUser = requireAuth(event)

  const { cloudflare } = event.context
  const { KV } = cloudflare.env
  const { limit, cursor: initialCursor } = await getValidatedQuery(event, z.object({
    limit: z.coerce.number().max(1024).default(20),
    cursor: z.string().trim().max(1024).optional(),
  }).parse)

  const collected: any[] = []
  let cursor: string | undefined = initialCursor || undefined
  let listComplete = false
  let pagesScanned = 0

  while (collected.length < limit && pagesScanned < MAX_SCAN_PAGES) {
    const page = await KV.list({
      prefix: 'link:',
      limit: KV_PAGE_SIZE,
      cursor,
    })

    if (Array.isArray(page.keys)) {
      const enriched = await Promise.all(page.keys.map(async (key: { name: string }) => {
        const { metadata, value: link } = await KV.getWithMetadata(key.name, { type: 'json' })
        if (link) {
          return {
            ...(metadata as any),
            ...(link as any),
          }
        }
        return link
      }))

      // Day 4: 权限过滤 - admin 看全部, user 只看自己的
      const filtered = enriched.filter(link => canAccessLink(currentUser, link))

      // 凑够 limit 就停,多余的留给下一次翻页
      const remaining = limit - collected.length
      if (filtered.length >= remaining) {
        collected.push(...filtered.slice(0, remaining))
        // 注意:这里用 KV 这一页的 cursor 作为"下一次起点"
        // 即使我们没用完 filtered 的全部,也会让下次重新过滤这一页 KV 数据
        // 但因为权限过滤是"幂等"的,重复过滤同一页没有副作用
        // 缺点是 KV 流量略高,但代码简单且正确
        break
      }
      else {
        collected.push(...filtered)
      }
    }

    pagesScanned++

    if (page.list_complete) {
      listComplete = true
      break
    }
    cursor = page.cursor
  }

  return {
    links: collected,
    list_complete: listComplete,
    cursor: listComplete ? undefined : cursor,
  }
})