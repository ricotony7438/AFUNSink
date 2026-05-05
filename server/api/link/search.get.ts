interface Link {
  slug: string
  url: string
  comment?: string
}

export default eventHandler(async (event) => {
  // Day 4: 拿当前用户用于过滤
  const currentUser = requireAuth(event)
  const isAdmin = currentUser.role === 'admin'

  const { cloudflare } = event.context
  const { KV } = cloudflare.env
  const list: Link[] = []
  let finalCursor: string | undefined
  try {
    while (true) {
      const { keys, list_complete, cursor } = await KV.list({
        prefix: `link:`,
        limit: 1000,
        cursor: finalCursor,
      })
      finalCursor = cursor
      if (Array.isArray(keys)) {
        for (const key of keys) {
          try {
            // Day 4: user 必须读出 link 才能拿到 owner 字段判断权限
            // admin 不需要(但如果 metadata 不全还是要读 link 兜底)
            const needFullRead = !isAdmin || !key.metadata?.url

            if (!needFullRead && key.metadata?.url) {
              // admin 走快路径:metadata 够了
              list.push({
                slug: key.name.replace('link:', ''),
                url: key.metadata.url,
                comment: key.metadata.comment,
              })
            }
            else {
              // user 或者旧链接没 metadata:必须 KV.get 取 link 完整对象
              const { metadata, value: link } = await KV.getWithMetadata(key.name, { type: 'json' })
              if (link) {
                // Day 4: 权限过滤
                if (!isAdmin && link.owner !== currentUser.username) {
                  continue
                }

                list.push({
                  slug: key.name.replace('link:', ''),
                  url: link.url,
                  comment: link.comment,
                })

                // Forward compatible: 给老链接补 metadata
                if (!key.metadata?.url) {
                  await KV.put(key.name, JSON.stringify(link), {
                    expiration: metadata?.expiration,
                    metadata: {
                      ...metadata,
                      url: link.url,
                      comment: link.comment,
                    },
                  })
                }
              }
            }
          }
          catch (err) {
            console.error(`Error processing key ${key.name}:`, err)
            continue
          }
        }
      }
      if (!keys || list_complete) {
        break
      }
    }
    return list
  }
  catch (err) {
    console.error('Error fetching link list:', err)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch link list',
    })
  }
})