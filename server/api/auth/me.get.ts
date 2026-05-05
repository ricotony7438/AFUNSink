export default eventHandler(async (event) => {
  const token = extractBearerToken(event)
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: '未登录',
    })
  }

  const session = await getUserSession(event, token)
  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Session 已过期',
    })
  }

  return {
    username: session.username,
    role: session.role,
    expiresAt: session.expiresAt,
  }
})