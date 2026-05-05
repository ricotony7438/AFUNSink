/**
 * DELETE /api/admin/users/[username]
 * 删除用户(仅 admin)
 *
 * 行为:
 *   - 删除目标用户的 user:{username} 记录
 *   - 把目标用户名下所有链接的 owner 字段转给操作者(通常是 owen)
 *   - 短链跳转完全不受影响
 *
 * 安全检查:
 *   - 不允许 admin 删除自己
 *   - 用户必须存在
 */

interface UserRecord {
  username: string
  passwordHash: string
  role: 'admin' | 'user'
}

interface LinkRecord {
  id?: string
  url?: string
  slug?: string
  owner?: string
  [key: string]: any
}

// KV 单请求 50 ops 上限,每条 link 占 1 op (put),保守用 20
const REASSIGN_BATCH_SIZE = 20

export default eventHandler(async (event) => {
  const currentUser = requireAdmin(event)

  const targetUsername = getRouterParam(event, 'username')
  if (!targetUsername) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: '缺少用户名参数',
    })
  }

  // 安全检查:不允许 admin 删除自己
  if (currentUser.username === targetUsername) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: '不能删除自己的账号',
    })
  }

  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // 用户必须存在
  const existing = await KV.get(`user:${targetUsername}`)
  if (!existing) {
    throw createError({
      status: 404,
      statusText: 'Not Found',
      message: `用户 ${targetUsername} 不存在`,
    })
  }

  // 第一步:扫描所有链接,找到 owner == 目标用户的
  // KV.list 默认 limit 1000,链接超过这个数要 cursor 翻页
  const ownedLinks: { keyName: string, link: LinkRecord, metadata: any }[] = []
  let cursor: string | undefined

  while (true) {
    const list = await KV.list({ prefix: 'link:', limit: 1000, cursor })

    // 并行读取每条 link 的 value 和 metadata
    const reads = await Promise.all(
      (list.keys || []).map(async (k: { name: string, metadata?: any }) => {
        try {
          const value = await KV.get(k.name, { type: 'json' }) as LinkRecord | null
          if (value && value.owner === targetUsername) {
            return { keyName: k.name, link: value, metadata: k.metadata }
          }
        }
        catch {
          // 跳过坏数据
        }
        return null
      }),
    )

    for (const r of reads) {
      if (r) ownedLinks.push(r)
    }

    if (list.list_complete) break
    cursor = list.cursor
    if (!cursor) break
  }

  // 第二步:把这些链接的 owner 改成当前操作者(currentUser.username)
  let reassignedCount = 0
  let reassignFailed = 0
  for (let i = 0; i < ownedLinks.length; i += REASSIGN_BATCH_SIZE) {
    const chunk = ownedLinks.slice(i, i + REASSIGN_BATCH_SIZE)
    const writeResults = await Promise.allSettled(
      chunk.map(({ keyName, link, metadata }) => {
        const updated = { ...link, owner: currentUser.username }
        return KV.put(keyName, JSON.stringify(updated), {
          metadata: metadata || undefined,
        })
      }),
    )
    for (const r of writeResults) {
      if (r.status === 'fulfilled') reassignedCount++
      else reassignFailed++
    }
  }

  // 第三步:删除用户记录
  await KV.delete(`user:${targetUsername}`)

  return {
    deleted: targetUsername,
    reassignedTo: currentUser.username,
    reassignedCount,
    reassignFailed,
    totalOwnedLinks: ownedLinks.length,
  }
})