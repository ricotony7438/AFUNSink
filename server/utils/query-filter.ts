import type { QuerySchema } from '@@/schemas/query'
import type { SelectStatement } from 'sql-bricks'
import type { z } from 'zod'

const { in: $in, and, eq } = SqlBricks

export type Query = z.infer<typeof QuerySchema>

export function query2filter(query: Query, ownerSlugs?: string[]) {
  const filter = []
  if (query.id)
    filter.push(eq('index1', query.id))
  Object.keys(logsMap).forEach((key) => {
    // @ts-expect-error todo
    if (query[key]) {
      // @ts-expect-error todo
      filter.push($in(logsMap[key], query[key].split(',')))
    }
  })

  // Day 4: 如果传了 ownerSlugs(说明是 user 调用),只看自己拥有的 slug 的统计
  // 空数组 = 该用户没有任何链接,强制返回空结果(用一个不可能匹配的条件)
  if (ownerSlugs !== undefined) {
    if (ownerSlugs.length === 0) {
      // 一个永远 false 的条件,确保 0 行返回
      filter.push(eq('1', '0'))
    }
    else {
      // logsMap.slug 是 slug 字段在 WAE 里的列名
      // @ts-expect-error logsMap is dynamic
      filter.push($in(logsMap.slug, ownerSlugs))
    }
  }

  return filter.length ? and(...filter) : []
}

export function appendTimeFilter(sql: SelectStatement, query: Query): unknown {
  if (query.startAt)
    sql.where(SqlBricks.gte('timestamp', SqlBricks(`toDateTime(${query.startAt})`)))
  if (query.endAt)
    sql.where(SqlBricks.lte('timestamp', SqlBricks(`toDateTime(${query.endAt})`)))
  return sql
}