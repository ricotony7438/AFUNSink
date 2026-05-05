import type { H3Event } from 'h3'
import { QuerySchema } from '@@/schemas/query'
import { z } from 'zod'

const { select } = SqlBricks

const unitMap: { [x: string]: string } = {
  minute: '%H:%M',
  hour: '%Y-%m-%d %H',
  day: '%Y-%m-%d',
}

const ViewsQuerySchema = QuerySchema.extend({
  unit: z.string(),
  clientTimezone: z.string().default('Etc/UTC'),
})

function query2sql(query: z.infer<typeof ViewsQuerySchema>, event: H3Event, ownerSlugs?: string[]): string {
  const filter = query2filter(query, ownerSlugs)
  const { dataset } = useRuntimeConfig(event)
  const sql = select(`formatDateTime(timestamp, '${unitMap[query.unit]}', '${query.clientTimezone}') as time, SUM(_sample_interval) as visits, COUNT(DISTINCT ${logsMap.ip}) as visitors`).from(dataset).where(filter).groupBy('time').orderBy('time')
  appendTimeFilter(sql, query)
  return sql.toString()
}

export default eventHandler(async (event) => {
  // Day 4: 取当前用户的 slug 列表(admin 返回 undefined 不过滤)
  const ownerSlugs = await getOwnerSlugsForFilter(event)
  const query = await getValidatedQuery(event, ViewsQuerySchema.parse)
  const sql = query2sql(query, event, ownerSlugs)
  return useWAE(event, sql)
})