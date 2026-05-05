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