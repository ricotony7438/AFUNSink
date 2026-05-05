/**
 * POST /api/admin/users
 * 创建新用户(仅 admin)
 *
 * Body: { username, password, role, displayName? }
 * Returns: 不含 passwordHash 的用户记录
 */

import { z } from 'zod'

const CreateUserSchema = z.object({
  username: z.string().trim().min(3).max(20),
  password: z.string().min(8).max(200),
  role: z.enum(['admin', 'user']).default('user'),
  displayName: z.string().trim().max(50).optional(),
})

interface UserRecord {
  username: string
  passwordHash: string
  role: 'admin' | 'user'
  displayName?: string
  createdAt: number
  disabled: boolean
}

export default eventHandler(async (event) => {
  requireAdmin(event)

  const body = await readValidatedBody(event, CreateUserSchema.parse)

  if (!isValidUsername(body.username)) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: '用户名只允许英文字母、数字、下划线、连字符,3-20 位',
    })
  }

  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // 用户名是否已存在
  const existing = await KV.get(`user:${body.username}`)
  if (existing) {
    throw createError({
      status: 409,
      statusText: 'Conflict',
      message: `用户名 ${body.username} 已存在`,
    })
  }

  // 哈希密码
  const passwordHash = await hashPassword(body.password)

  // 构建记录
  const userRecord: UserRecord = {
    username: body.username,
    passwordHash,
    role: body.role,
    displayName: body.displayName || body.username,
    createdAt: Math.floor(Date.now() / 1000),
    disabled: false,
  }

  // 写入 KV
  await KV.put(`user:${body.username}`, JSON.stringify(userRecord))

  // 返回时剥离 passwordHash
  const { passwordHash: _, ...safe } = userRecord
  setResponseStatus(event, 201)
  return safe
})