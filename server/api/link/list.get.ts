export default eventHandler(async (event) => {
  // 诊断版:无论成败都返回 200,前端在 Network → Response 里看 debug 内容
  const debug: any = {
    step: 'start',
    user: null,
    error: null,
  }

  try {
    debug.step = 'requireAuth'
    const currentUser = requireAuth(event)
    debug.user = currentUser

    debug.step = 'KV available'
    const { cloudflare } = event.context
    const { KV } = cloudflare.env
    debug.kvAvailable = !!KV

    debug.step = 'KV.list first page'
    const page = await KV.list({ prefix: 'link:', limit: 5 })
    debug.gotKeys = page.keys?.length ?? 0

    debug.step = 'KV.getWithMetadata first key'
    if (page.keys && page.keys.length > 0) {
      const first = await KV.getWithMetadata(page.keys[0].name, { type: 'json' })
      debug.firstLinkOwner = (first.value as any)?.owner ?? '(no owner field)'
      debug.firstLinkSlug = (first.value as any)?.slug ?? '(no slug)'
    }

    debug.step = 'check canAccessLink'
    debug.canAccessLinkType = typeof canAccessLink

    debug.step = 'done'
    return debug
  }
  catch (err: any) {
    debug.error = {
      message: err?.message ?? '(no message)',
      stack: err?.stack?.slice(0, 1000) ?? '(no stack)',
      name: err?.name ?? '(no name)',
    }
    return debug
  }
})