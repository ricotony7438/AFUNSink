export default eventHandler(async (event) => {
  // Day 4: 拿当前用户用于权限检查
  const currentUser = requireAuth(event)

  const { previewMode } = useRuntimeConfig(event).public
  if (previewMode) {
    throw createError({
      status: 403,
      statusText: 'Preview mode cannot delete links.',
    })
  }
  const { slug } = await readBody(event)
  if (slug) {
    const { cloudflare } = event.context
    const { KV } = cloudflare.env

    // Day 4: 先取出链接,检查权限
    // 没找到的链接直接 404,有但没权限的也返回 404(防枚举)
    const existing = await KV.get(`link:${slug}`, { type: 'json' })
    if (!existing) {
      throw createError({
        status: 404,
        statusText: 'Not Found',
      })
    }
    if (!canAccessLink(currentUser, existing)) {
      throw createError({
        status: 404,
        statusText: 'Not Found',
      })
    }

    await KV.delete(`link:${slug}`)
  }
})