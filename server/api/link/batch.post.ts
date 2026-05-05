import { LinkSchema } from '@@/schemas/link'
import { z } from 'zod'

// 单批次大小:KV 每请求 50 ops 硬上限,每条 link 占 2 ops(get 查重 + put 写入),保守用 20
const BATCH_SIZE = 20
// 单次请求总上限:防止 Worker CPU time 超限
const MAX_LINKS_PER_REQUEST = 500

// 批量请求的 schema:每一项都用 LinkSchema 单独校验(在循环里),这里只校验数组结构
const BatchPayloadSchema = z.object({
  links: z.array(z.record(z.any())).min(1).max(MAX_LINKS_PER_REQUEST),
  onConflict: z.enum(['skip', 'overwrite']).default('skip'),
})

defineRouteMeta({
  openAPI: {
    description: 'Batch create short links (up to 500 per request)',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['links'],
            properties: {
              links: {
                type: 'array',
                description: 'Array of link objects (same shape as POST /api/link/create body)',
                items: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } },
                maxItems: 500,
              },
              onConflict: {
                type: 'string',
                enum: ['skip', 'overwrite'],
                default: 'skip',
                description: 'How to handle slug conflicts with existing links',
              },
            },
          },
        },
      },
    },
  },
})

interface SuccessItem {
  row: number
  url: string
  slug: string
  shortLink: string
}

interface FailureItem {
  row: number
  url: string
  reason: string
}

export default eventHandler(async (event) => {
  const { caseSensitive } = useRuntimeConfig(event)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const body = await readValidatedBody(event, BatchPayloadSchema.parse)

  // Step 1: 用 LinkSchema 逐条校验 + 补全(slug 自动生成等)
  // 这一步和单条 create 走完全相同的校验链,字段约束保持一致
  const prepared: Array<{ link: any, row: number, error?: string }> = []
  const seenSlugsInBatch = new Set<string>()

// Day 2: 当前登录用户(由 server/middleware/2.auth.ts 注入)
  const currentUser = (event.context as any).user
  const ownerUsername = currentUser?.username

  body.links.forEach((raw, idx) => {
    const row = idx + 1
    try {
      const link = LinkSchema.parse(raw)
      if (!caseSensitive)
        link.slug = link.slug.toLowerCase()

      // Day 2: 写入当前登录用户为 owner
      if (ownerUsername) {
        (link as any).owner = ownerUsername
      }

      // 批次内 slug 去重(LinkSchema 会自动给 slug,理论上随机生成不会撞,但用户手填可能撞)
      if (seenSlugsInBatch.has(link.slug)) {
        prepared.push({ link, row, error: `slug "${link.slug}" duplicated within this batch` })
        return
      }
      seenSlugsInBatch.add(link.slug)
      prepared.push({ link, row })
    }
    catch (e: any) {
      // zod ZodError 有 .issues 数组,每条 issue 有 path 和 message
      const firstIssue = e?.issues?.[0]
      const errorMsg = firstIssue
        ? `${firstIssue.path?.join('.') || 'field'}: ${firstIssue.message}`
        : (e?.message || 'Validation failed')
      prepared.push({
        link: raw,
        row,
        error: errorMsg,
      })
    }
  })

  const succeeded: SuccessItem[] = []
  const failed: FailureItem[] = []

  // Step 2: 收集校验失败的项,直接进 failed
  const validItems = prepared.filter((p) => {
    if (p.error) {
      failed.push({ row: p.row, url: p.link?.url || '', reason: p.error })
      return false
    }
    return true
  })

  // Step 3: 分批查重 + 写入
  for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
    const chunk = validItems.slice(i, i + BATCH_SIZE)

    // 3a. 并发查重
    const existsResults = await Promise.all(
      chunk.map(({ link }) => KV.get(`link:${link.slug}`)),
    )

    // 3b. 决定写哪些
    const toWrite: typeof chunk = []
    chunk.forEach((item, j) => {
      const exists = existsResults[j]
      if (exists && body.onConflict === 'skip') {
        failed.push({
          row: item.row,
          url: item.link.url,
          reason: `slug "${item.link.slug}" already exists`,
        })
        return
      }
      toWrite.push(item)
    })

    // 3c. 并发写入(每条独立成败,不整体回滚)
    const writeResults = await Promise.allSettled(
      toWrite.map(({ link }) => {
        const expiration = getExpiration(event, link.expiration)
        return KV.put(`link:${link.slug}`, JSON.stringify(link), {
          expiration,
          metadata: {
            expiration,
            url: link.url,
            comment: link.comment,
          },
        })
      }),
    )

    writeResults.forEach((res, j) => {
      const item = toWrite[j]
      if (res.status === 'fulfilled') {
        succeeded.push({
          row: item.row,
          url: item.link.url,
          slug: item.link.slug,
          shortLink: `${getRequestProtocol(event)}://${getRequestHost(event)}/${item.link.slug}`,
        })
      }
      else {
        failed.push({
          row: item.row,
          url: item.link.url,
          reason: (res.reason as Error)?.message || 'KV write failed',
        })
      }
    })
  }

  succeeded.sort((a, b) => a.row - b.row)
  failed.sort((a, b) => a.row - b.row)

  // 207 Multi-Status:语义上正好对应"部分成功"
  setResponseStatus(event, failed.length === 0 ? 201 : 207)

  return {
    total: body.links.length,
    successCount: succeeded.length,
    failureCount: failed.length,
    succeeded,
    failed,
  }
})
