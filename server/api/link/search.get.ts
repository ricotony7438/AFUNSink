interface Link {
  slug: string
  url: string
  comment?: string
}

// 单次 KV.list 拿多少 keys
// 控制在 30 以内,避免单批 KV.getWithMetadata 并发超过 Workers 限制
const KV_PAGE_SIZE = 30
// 整个扫描最大页数:30 * 50 = 1500 条 keys 上限
const MAX_PAGES = 50

export default eventHandler(async (event) => {
  // Day 4: 拿当前用户用于过滤
  const currentUser = requireAuth(event)
  const isAdmin = currentUser.role === 'admin'
  const { cloudflare } = event.context
  const { KV } = cloudflare.env
  const list: Link[] = []
  let cursor: string | undefined
  let pagesScanned = 0

  try {
    while (pagesScanned < MAX_PAGES) {
      const listOptions: { prefix: string, limit: number, cursor?: string } = {
        prefix: 'link:',
        limit: KV_PAGE_SIZE,
      }
      if (cursor) listOptions.cursor = cursor

      const { keys, list_complete, cursor: nextCursor } = await KV.list(listOptions)

      if (Array.isArray(keys) && keys.length > 0) {
        // 这一批的 keys 并发处理(每批最多 30 条,在 Workers 并发限制内)
        const batchResults = await Promise.all(keys.map(async (key) => {
          try {
            // admin + metadata 完整 → 走快路径
            if (isAdmin && key.metadata?.url) {
              return {
                slug: key.name.replace('link:', ''),
                url: (key.metadata as any).url,
                comment: (key.metadata as any).comment,
              } as Link
            }

            // user 或 metadata 不全:必须 KV.get 取 link 对象
            const { metadata, value: link } = await KV.getWithMetadata(key.name, { type: 'json' })
            if (!link) return null

            // Day 4: 权限过滤
            if (!isAdmin && (link as any).owner !== currentUser.username) {
              return null
            }

            // Forward compatible: 给老链接补 metadata
            if (!key.metadata?.url) {
              await KV.put(key.name, JSON.stringify(link), {
                expiration: (metadata as any)?.expiration,
                metadata: {
                  ...(metadata as any),
                  url: (link as any).url,
                  comment: (link as any).comment,
                },
              })
            }

            return {
              slug: key.name.replace('link:', ''),
              url: (link as any).url,
              comment: (link as any).comment,
            } as Link
          }
          catch (err) {
            console.error(`[search] Error processing key ${key.name}:`, err)
            return null
          }
        }))

        // 把这一批的结果加进总列表
        for (const item of batchResults) {
          if (item) list.push(item)
        }
      }

      pagesScanned++

      if (list_complete) break
      cursor = nextCursor
      if (!cursor) break
    }

    return list
  }
  catch (err: any) {
    console.error('[search] error:', err?.message, err?.stack)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch link list',
    })
  }
})