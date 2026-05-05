/**
 * PUT /api/admin/users/[username]
 * 修改用户信息(仅 admin)
 *
 * Body 可选字段:password, role, displayName, disabled
 * 不可改:username(主键不可变)
 *
 * 安全检查:
 *   - 不允许把自己的角色从 admin 降为 user
 *   - 不允许把自己 disabled
 *   - 不允许操作不存在的用户
 */

import { z } from 'zod'

const UpdateUserSchema = z.object({
  password: z.string().min(8).max(200).optional(),
  role: z.enum(['admin', 'user']).optional(),
  displayName: z.string().trim().max(50).optional(),
  disabled: z.boolean().optional(),
})

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
  const currentUser = requireAdmin(event)

  const targetUsername = getRouterParam(event, 'username')
  if (!targetUsername) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: '缺少用户名参数',
    })
  }

  const body = await readValidatedBody(event, UpdateUserSchema.parse)

  // 至少要改一个字段
  if (
    body.password === undefined
    && body.role === undefined
    && body.displayName === undefined
    && body.disabled === undefined
  ) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: '没有要修改的字段',
    })
  }

  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // 取出现有用户
  const existing = await KV.get(`user:${targetUsername}`, { type: 'json' }) as UserRecord | null
  if (!existing) {
    throw createError({
      status: 404,
      statusText: 'Not Found',
      message: `用户 ${targetUsername} 不存在`,
    })
  }

  // 安全检查:不允许 admin 把自己的角色降级或禁用自己
  const isModifyingSelf = currentUser.username === targetUsername

  if (isModifyingSelf && body.role && body.role !== 'admin') {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: '不能把自己降级为普通用户',
    })
  }

  if (isModifyingSelf && body.disabled === true) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: '不能禁用自己的账号',
    })
  }

  // 构建新记录(从原记录开始,只覆盖传过来的字段)
  const updated: UserRecord = { ...existing }

  if (body.password !== undefined) {
    updated.passwordHash = await hashPassword(body.password)
  }
  if (body.role !== undefined) {
    updated.role = body.role
  }
  if (body.displayName !== undefined) {
    updated.displayName = body.displayName
  }
  if (body.disabled !== undefined) {
    updated.disabled = body.disabled
  }

  await KV.put(`user:${targetUsername}`, JSON.stringify(updated))

  // 返回时剥离 passwordHash
  const { passwordHash: _, ...safe } = updated
  return safe
})