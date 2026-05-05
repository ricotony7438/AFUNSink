/**
 * Session 管理工具 - 基于 Cloudflare KV
 *
 * key 格式: `session:{token}`
 * value 格式: { username, role, createdAt, expiresAt }
 * TTL: 7 天(由 KV 自动过期)
 *
 * 注意:函数名加 "User" 前缀避免和 Nitro 内置的 getSession 冲突
 */

import type { H3Event } from 'h3'

export interface UserSessionData {
  username: string
  role: 'admin' | 'user'
  createdAt: number
  expiresAt: number
}

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 天

/**
 * 生成一个新的 session token
 */
export function generateSessionToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

/**
 * 创建一个新 session,返回 token
 */
export async function createUserSession(
  event: H3Event,
  username: string,
  role: 'admin' | 'user',
): Promise<string> {
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const token = generateSessionToken()
  const now = Math.floor(Date.now() / 1000)
  const session: UserSessionData = {
    username,
    role,
    createdAt: now,
    expiresAt: now + SESSION_TTL_SECONDS,
  }

  await KV.put(
    `session:${token}`,
    JSON.stringify(session),
    { expirationTtl: SESSION_TTL_SECONDS },
  )

  return token
}

/**
 * 读取一个 session,返回 UserSessionData 或 null
 */
export async function getUserSession(
  event: H3Event,
  token: string,
): Promise<UserSessionData | null> {
  if (!token) return null
  try {
    const { cloudflare } = event.context
    const { KV } = cloudflare.env
    const value = await KV.get(`session:${token}`, { type: 'json' }) as UserSessionData | null
    if (!value) return null

    const now = Math.floor(Date.now() / 1000)
    if (value.expiresAt < now) {
      await KV.delete(`session:${token}`)
      return null
    }

    return value
  }
  catch {
    return null
  }
}

/**
 * 删除一个 session(登出用)
 */
export async function deleteUserSession(
  event: H3Event,
  token: string,
): Promise<void> {
  if (!token) return
  try {
    const { cloudflare } = event.context
    const { KV } = cloudflare.env
    await KV.delete(`session:${token}`)
  }
  catch {
    // 忽略删除失败
  }
}

/**
 * 从请求 header 提取 Bearer token
 */
export function extractBearerToken(event: H3Event): string {
  const auth = getRequestHeader(event, 'Authorization') || ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}