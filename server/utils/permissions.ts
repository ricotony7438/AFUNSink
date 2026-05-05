/**
 * 权限检查工具
 *
 * 所有 admin API 在 handler 开头调用 requireAdmin(event),
 * 不是 admin 就抛 403,不需要每次手写检查逻辑。
 */

import type { H3Event } from 'h3'

export interface RequestUser {
  username: string
  role: 'admin' | 'user'
}

/**
 * 从 event.context 取当前登录用户。
 * 中间件 server/middleware/2.auth.ts 会注入这个对象。
 * 没登录的话(理论上中间件会先拦住)也兜底处理。
 */
export function getCurrentUser(event: H3Event): RequestUser | null {
  const user = (event.context as any).user
  if (user?.username && user?.role) {
    return { username: user.username, role: user.role }
  }
  return null
}

/**
 * 要求当前用户必须是 admin,否则抛 403。
 * 没登录抛 401(理论不会发生,但兜底)。
 */
export function requireAdmin(event: H3Event): RequestUser {
  const user = getCurrentUser(event)
  if (!user) {
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
      message: '请先登录',
    })
  }
  if (user.role !== 'admin') {
    throw createError({
      status: 403,
      statusText: 'Forbidden',
      message: '需要管理员权限',
    })
  }
  return user
}

/**
 * 要求当前用户已登录(任何角色)。
 * 用在普通用户也能访问、但需要知道身份的接口。
 */
export function requireAuth(event: H3Event): RequestUser {
  const user = getCurrentUser(event)
  if (!user) {
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
      message: '请先登录',
    })
  }
  return user
}

/**
 * 校验用户名格式(只允许英文字母、数字、下划线、连字符,3-20 位)
 */
export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_-]{3,20}$/.test(username)
}
/**
 * 判断当前用户是否能访问某条链接
 *
 * 规则:
 *   - admin 能访问所有链接
 *   - 普通用户只能访问 owner == 自己的链接
 *   - 没有 owner 字段的旧链接,只有 admin 能访问
 *
 * 用法:
 *   const link = await KV.get('link:foo', { type: 'json' })
 *   if (!canAccessLink(user, link)) throw 403
 */
export function canAccessLink(
  user: RequestUser,
  link: any,
): boolean {
  if (!link) return false
  if (user.role === 'admin') return true
  if (link.owner && link.owner === user.username) return true
  return false
}
/**
 * 取当前 user 的所有链接的 slug 列表(用于 stats 过滤)
 *
 * 返回:
 *   - admin → undefined(意思是"不需要过滤,看全部")
 *   - user → ['slug1', 'slug2', ...](该 user 的所有 slug,可能为空)
 *
 * 用法:
 *   const ownerSlugs = await getOwnerSlugsForFilter(event)
 *   const sql = query2sql(query, event, ownerSlugs)
 */
export async function getOwnerSlugsForFilter(
  event: any,
): Promise<string[] | undefined> {
  const user = requireAuth(event)
  if (user.role === 'admin') return undefined

  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const slugs: string[] = []
  let cursor: string | undefined

  while (true) {
    const page = await KV.list({ prefix: 'link:', limit: 1000, cursor })

    // 并行读取这一页的所有 link,过滤出 owner 是当前 user 的
    const pageSlugs = await Promise.all((page.keys || []).map(async (k: { name: string }) => {
      try {
        const link = await KV.get(k.name, { type: 'json' }) as { owner?: string } | null
        if (link && link.owner === user.username) {
          return k.name.replace('link:', '')
        }
      }
      catch {}
      return null
    }))

    for (const s of pageSlugs) {
      if (s) slugs.push(s)
    }

    if (page.list_complete) break
    cursor = page.cursor
    if (!cursor) break
  }

  return slugs
}