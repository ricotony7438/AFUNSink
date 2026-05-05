export default eventHandler(async (event) => {
  // Day 4: 拿当前用户用于过滤
  const currentUser = requireAuth(event)

  const slug = getQuery(event).slug
  if (slug) {
    const { cloudflare } = event.context
    const { KV } = cloudflare.env
    const { metadata, value: link } = await KV.getWithMetadata(`link:${slug}`, { type: 'json' })
    if (link) {
      // Day 4: 权限过滤 - user 看别人的链接相当于看不到
      if (!canAccessLink(currentUser, link)) {
        throw createError({
          status: 404,
          statusText: 'Not Found',
        })
      }

      return {
        ...metadata,
        ...link,
      }
    }
  }
  throw createError({
    status: 404,
    statusText: 'Not Found',
  })
})