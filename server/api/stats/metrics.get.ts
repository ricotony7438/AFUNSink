import type { H3Event } from 'h3'
import { QuerySchema } from '@@/schemas/query'
import { z } from 'zod'

const { select } = SqlBricks

const MetricsQuerySchema = QuerySchema.extend({
  type: z.string(),
})

function query2sql(query: z.infer<typeof MetricsQuerySchema>, event: H3Event, ownerSlugs?: string[]): string {
  const filter = query2filter(query, ownerSlugs)
  const { dataset } = useRuntimeConfig(event)
  // @ts-expect-error todo
  const sql = select(`${logsMap[query.type]} as name, SUM(_sample_interval) as count`).from(dataset).where(filter).groupBy('name').orderBy('count DESC').limit(query.limit)
  appendTimeFilter(sql, query)
  return sql.toString()
}

export default eventHandler(async (event) => {
  // Day 4: 取当前用户的 slug 列表(admin 返回 undefined 不过滤)
  const ownerSlugs = await getOwnerSlugsForFilter(event)
  const query = await getValidatedQuery(event, MetricsQuerySchema.parse)
  const sql = query2sql(query, event, ownerSlugs)
  return useWAE(event, sql)
})