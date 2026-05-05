import { LinkSchema } from '@@/schemas/link'

export default eventHandler(async (event) => {
  const link = await readValidatedBody(event, LinkSchema.parse)
  const { caseSensitive } = useRuntimeConfig(event)
  if (!caseSensitive) {
    link.slug = link.slug.toLowerCase()
  }

  // Day 2: 当前登录用户(由 server/middleware/2.auth.ts 注入)
  const currentUser = (event.context as any).user
  const ownerUsername = currentUser?.username

  const { cloudflare } = event.context
  const { KV } = cloudflare.env
  // Check if link exists
  const existingLink = await KV.get(`link:${link.slug}`, { type: 'json' })
  if (existingLink) {
    // If link exists, return it along with the short link
    const shortLink = `${getRequestProtocol(event)}://${getRequestHost(event)}/${link.slug}`
    return { link: existingLink, shortLink, status: 'existing' }
  }

  // Day 2: 创建分支才加 owner(已存在的不动)
  if (ownerUsername) {
    (link as any).owner = ownerUsername
  }

  // If link doesn't exist, create it
  const expiration = getExpiration(event, link.expiration)
  await KV.put(`link:${link.slug}`, JSON.stringify(link), {
    expiration,
    metadata: {
      expiration,
      url: link.url,
      comment: link.comment,
    },
  })
  setResponseStatus(event, 201)
  const shortLink = `${getRequestProtocol(event)}://${getRequestHost(event)}/${link.slug}`
  return { link, shortLink, status: 'created' }
})