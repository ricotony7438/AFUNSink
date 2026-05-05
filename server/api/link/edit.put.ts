import type { z } from 'zod'
import { LinkSchema } from '@@/schemas/link'

export default eventHandler(async (event) => {
  const { previewMode } = useRuntimeConfig(event).public
  if (previewMode) {
    throw createError({
      status: 403,
      statusText: 'Preview mode cannot edit links.',
    })
  }
  const link = await readValidatedBody(event, LinkSchema.parse)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env
  const existingLink: z.infer<typeof LinkSchema> | null = await KV.get(`link:${link.slug}`, { type: 'json' })
  if (existingLink) {
    // Day 2: owner 字段是后端管理的,不允许通过编辑接口修改
    // 即使前端提交了 owner,也无视它,保留原 owner
    const existingOwner = (existingLink as any).owner

    const newLink = {
      ...existingLink,
      ...link,
      id: existingLink.id, // don't update id
      createdAt: existingLink.createdAt, // don't update createdAt
      updatedAt: Math.floor(Date.now() / 1000),
    }

    // Day 2: 强制保留原 owner(在 spread 之后覆盖)
    if (existingOwner) {
      (newLink as any).owner = existingOwner
    }

    const expiration = getExpiration(event, newLink.expiration)
    await KV.put(`link:${newLink.slug}`, JSON.stringify(newLink), {
      expiration,
      metadata: {
        expiration,
        url: newLink.url,
        comment: newLink.comment,
      },
    })
    setResponseStatus(event, 201)
    const shortLink = `${getRequestProtocol(event)}://${getRequestHost(event)}/${newLink.slug}`
    return { link: newLink, shortLink }
  }
})