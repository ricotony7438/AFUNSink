import type { H3Event } from 'h3'
import { z } from 'zod'

const CompareQuerySchema = z.object({
  startAt: z.coerce.number().int().positive().optional(),
  endAt: z.coerce.number().int().positive().optional(),
  country: z.string().trim().toUpperCase().max(3).optional().or(z.literal('')),
  slugContains: z.string().trim().max(100).optional().or(z.literal('')),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
})

type CompareQuery = z.infer<typeof CompareQuerySchema>

function buildTimeWhere(query: CompareQuery): string {
  const parts: string[] = []
  if (query.startAt) parts.push(`timestamp >= toDateTime(${query.startAt})`)
  if (query.endAt) parts.push(`timestamp <= toDateTime(${query.endAt})`)
  return parts.length > 0 ? parts.join(' AND ') : '1=1'
}

function sanitizeCountry(c?: string): string {
  if (!c) return ''
  return c.replace(/[^A-Z]/g, '')
}

function sanitizeSlugContains(s?: string): string {
  if (!s) return ''
  return s.replace(/[^a-zA-Z0-9_-]/g, '')
}

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, CompareQuerySchema.parse)
  const { dataset } = useRuntimeConfig(event)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const timeWhere = buildTimeWhere(query)
  const country = sanitizeCountry(query.country)
  const slugContains = sanitizeSlugContains(query.slugContains)

  // 主查询:按国家筛选(或全球),统计每个 slug 的点击和 UV
  const mainConditions = [timeWhere]
  if (country) mainConditions.push(`blob6 = '${country}'`)
  if (slugContains) mainConditions.push(`blob1 LIKE '%${slugContains}%'`)
  const mainWhere = mainConditions.join(' AND ')

  const mainSQL = `SELECT blob1 as slug, SUM(_sample_interval) as clicks, count(DISTINCT blob4) as uv FROM ${dataset} WHERE ${mainWhere} GROUP BY blob1 ORDER BY clicks DESC LIMIT ${query.limit}`

  console.log('compare main SQL:', mainSQL)

  const mainResult = await useWAE(event, mainSQL) as any
  const mainRows: Array<{ slug: string, clicks: number, uv: number }> = (mainResult?.data || []).map((r: any) => ({
    slug: r.slug,
    clicks: Number(r.clicks) || 0,
    uv: Number(r.uv) || 0,
  }))

  // 总点击查询:对前面筛出来的 slug 在同时间段、不限国家的总点击
  const slugList = mainRows.map(r => r.slug).filter(s => s)
  const totalsMap = new Map<string, number>()
  if (slugList.length > 0) {
    const slugsIn = slugList.map(s => `'${s.replace(/'/g, '')}'`).join(',')
    const totalsSQL = `SELECT blob1 as slug, SUM(_sample_interval) as totalClicks FROM ${dataset} WHERE ${timeWhere} AND blob1 IN (${slugsIn}) GROUP BY blob1`
    console.log('compare totals SQL:', totalsSQL)
    const totalsResult = await useWAE(event, totalsSQL) as any
    for (const r of (totalsResult?.data || [])) {
      totalsMap.set(r.slug, Number(r.totalClicks) || 0)
    }
  }

  // 从 KV 并行拉取每个 slug 的 url(用 metadata,比读 value 快)
  const urlMap = new Map<string, string>()
  await Promise.all(slugList.map(async (slug) => {
    try {
      const { metadata } = await KV.getWithMetadata(`link:${slug}`, { type: 'json' })
      if (metadata && (metadata as any).url) {
        urlMap.set(slug, (metadata as any).url)
      }
    }
    catch {
      // 忽略单个 slug 取失败
    }
  }))

  const rows = mainRows.map((r) => {
    const totalClicks = totalsMap.get(r.slug) ?? r.clicks
    const ratio = totalClicks > 0 ? r.clicks / totalClicks : 0
    return {
      slug: r.slug,
      url: urlMap.get(r.slug) || '',
      countryClicks: r.clicks,
      countryUV: r.uv,
      totalClicks,
      ratio,
    }
  })

  return {
    country: country || null,
    timeRange: { startAt: query.startAt, endAt: query.endAt },
    total: rows.length,
    data: rows,
  }
})