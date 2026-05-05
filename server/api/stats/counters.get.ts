import type { H3Event } from 'h3'
import { QuerySchema } from '@@/schemas/query'

const { select } = SqlBricks

function query2sql(query: Query, event: H3Event, ownerSlugs?: string[]): string {
  const filter = query2filter(query, ownerSlugs)
  const { dataset } = useRuntimeConfig(event)
  // visitors did not consider sampling
  const sql = select(`SUM(_sample_interval) as visits, COUNT(DISTINCT ${logsMap.ip}) as visitors, COUNT(DISTINCT ${logsMap.referer}) as referers`).from(dataset).where(filter)
  appendTimeFilter(sql, query)
  return sql.toString()
}

export default eventHandler(async (event) => {
  // Day 4: 取当前用户的 slug 列表(admin 返回 undefined 不过滤)
  const ownerSlugs = await getOwnerSlugsForFilter(event)
  const query = await getValidatedQuery(event, QuerySchema.parse)
  const sql = query2sql(query, event, ownerSlugs)
  return useWAE(event, sql)
})