import { z } from 'zod'

// 一次 KV.list 取多少条 keys
// 不能太大:每条都要 KV.getWithMetadata,Cloudflare Workers 限制并发子请求
// 安全值:30 条以内并发是 OK 的
const KV_PAGE_SIZE = 30
// 单页扫描的最大次数,防止稀疏数据下 Worker CPU time 超限
const MAX_SCAN_PAGES = 10

export default eventHandler(async (event) => {
  try {
    const currentUser = requireAuth(event)
    const { cloudflare } = event.context
    const { KV } = cloudflare.env
    const { limit, cursor: initialCursor } = await getValidatedQuery(event, z.object({
      limit: z.coerce.number().max(1024).default(20),
      cursor: z.string().trim().max(1024).optional(),
    }).parse)

    const collected: any[] = []
    let cursor: string | undefined = (initialCursor && initialCursor.length > 0) ? initialCursor : undefined
    let listComplete = false
    let pagesScanned = 0

    while (collected.length < limit && pagesScanned < MAX_SCAN_PAGES) {
      const listOptions: { prefix: string, limit: number, cursor?: string } = {
        prefix: 'link:',
        limit: KV_PAGE_SIZE,
      }
      if (cursor) listOptions.cursor = cursor

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

        const filtered = enriched.filter(link => canAccessLink(currentUser, link))

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