import { z } from 'zod'

// 单页扫描的最大次数,防止稀疏数据下 Worker CPU time 超限
const MAX_SCAN_PAGES = 5
// KV.list 单次取的页大小(KV 默认上限 1024)
const KV_PAGE_SIZE = 1024

export default eventHandler(async (event) => {
  try {
    // Day 4: 拿当前用户用于过滤
    const currentUser = requireAuth(event)
    const { cloudflare } = event.context
    const { KV } = cloudflare.env
    const { limit, cursor: initialCursor } = await getValidatedQuery(event, z.object({
      limit: z.coerce.number().max(1024).default(20),
      cursor: z.string().trim().max(1024).optional(),
    }).parse)

    const collected: any[] = []
    // Day 4: 把空字符串和 undefined 都当作"从头开始"
    let cursor: string | undefined = (initialCursor && initialCursor.length > 0) ? initialCursor : undefined
    let listComplete = false
    let pagesScanned = 0

    while (collected.length < limit && pagesScanned < MAX_SCAN_PAGES) {
      // KV.list 不接受空字符串 cursor,要么传字符串要么不传
      const listOptions: { prefix: string, limit: number, cursor?: string } = {
        prefix: 'link:',
        limit: KV_PAGE_SIZE,
      }
      if (cursor) {
        listOptions.cursor = cursor
      }

      const page = await KV.list(listOptions)

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
  }
  catch (err: any) {
    console.error('[link/list] error:', err?.message, err?.stack)
    throw err
  }
})