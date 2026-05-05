/**
 * GET /api/admin/users
 * 列出所有用户(仅 admin)
 *
 * 返回字段:username, role, displayName, createdAt, lastLoginAt, disabled
 * 不返回:passwordHash
 */

interface UserRecord {
  username: string
  passwordHash: string
  role: 'admin' | 'user'
  displayName?: string
  createdAt?: number
  lastLoginAt?: number
  disabled?: boolean
}

export default eventHandler(async (event) => {
  requireAdmin(event)

  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // 列出所有 user:* keys(用户量不会大,一次拿完)
  const list = await KV.list({ prefix: 'user:' })

  // 并行读取每个用户
  const users = await Promise.all(
    (list.keys || []).map(async (k: { name: string }) => {
      try {
        const value = await KV.get(k.name, { type: 'json' }) as UserRecord | null
        if (!value) return null
        // 关键:剥离 passwordHash,绝不返回前端
        const { passwordHash: _, ...safe } = value
        return safe
      }
      catch {
        return null
      }
    }),
  )

  // 过滤空值,按用户名排序
  const filtered = users.filter(u => u !== null) as Omit<UserRecord, 'passwordHash'>[]
  filtered.sort((a, b) => a.username.localeCompare(b.username))

  return {
    total: filtered.length,
    users: filtered,
  }
})