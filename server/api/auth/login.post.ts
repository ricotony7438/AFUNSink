import { z } from 'zod'

const LoginSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
})

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, LoginSchema.parse)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // 查 user:{username}
  const user = await KV.get(`user:${body.username}`, { type: 'json' }) as {
    username: string
    passwordHash: string
    role: 'admin' | 'user'
    disabled?: boolean
  } | null

  if (!user) {
    // 故意不区分"用户不存在"和"密码错误"——避免被枚举用户名
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: '用户名或密码错误',
    })
  }

  if (user.disabled) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: '账号已停用,请联系管理员',
    })
  }

  const passwordOk = await verifyPassword(body.password, user.passwordHash)
  if (!passwordOk) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: '用户名或密码错误',
    })
  }

  // 创建 session
const token = await createUserSession(event, user.username, user.role)

  // 更新最后登录时间(可选,失败不影响登录)
  try {
    await KV.put(
      `user:${user.username}`,
      JSON.stringify({ ...user, lastLoginAt: Math.floor(Date.now() / 1000) }),
    )
  }
  catch {
    // 忽略
  }

  return {
    token,
    username: user.username,
    role: user.role,
  }
})