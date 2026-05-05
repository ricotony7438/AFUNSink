<script setup lang="ts">
import { now } from '@internationalized/date'
import { toast } from 'vue-sonner'

const COMMON_COUNTRIES = [
  { code: 'BR', name: '巴西' },
  { code: 'CN', name: '中国' },
  { code: 'US', name: '美国' },
  { code: 'PT', name: '葡萄牙' },
  { code: 'JP', name: '日本' },
  { code: 'KR', name: '韩国' },
  { code: 'TH', name: '泰国' },
  { code: 'VN', name: '越南' },
  { code: 'ID', name: '印度尼西亚' },
  { code: 'MY', name: '马来西亚' },
  { code: 'SG', name: '新加坡' },
  { code: 'PH', name: '菲律宾' },
  { code: 'IN', name: '印度' },
  { code: 'GB', name: '英国' },
  { code: 'DE', name: '德国' },
  { code: 'FR', name: '法国' },
  { code: 'RU', name: '俄罗斯' },
  { code: 'MX', name: '墨西哥' },
  { code: 'AR', name: '阿根廷' },
  { code: 'CA', name: '加拿大' },
  { code: 'AU', name: '澳大利亚' },
]

interface CompareRow {
  slug: string
  url: string
  countryClicks: number
  countryUV: number
  totalClicks: number
  ratio: number
}

interface CompareResponse {
  country: string | null
  timeRange: { startAt?: number, endAt?: number }
  total: number
  data: CompareRow[]
}

// 时间状态:provide 给 DatePicker
const time = ref({
  startAt: date2unix(now().subtract({ days: 7 })),
  endAt: date2unix(now()),
})
provide('time', time)

const country = ref('BR')
const slugContains = ref('')
const displayLimit = ref(100)

const loading = ref(false)
const result = ref<CompareResponse | null>(null)

function changeDate(dateRange: [number, number]) {
  time.value.startAt = dateRange[0]
  time.value.endAt = dateRange[1]
  // 时间变化后自动重查
  submit()
}

function buildQuery() {
  const params: Record<string, any> = {
    limit: displayLimit.value,
    startAt: time.value.startAt,
    endAt: time.value.endAt,
  }
  if (country.value && country.value !== 'ALL') params.country = country.value
  if (slugContains.value.trim()) params.slugContains = slugContains.value.trim()
  return params
}

async function submit() {
  loading.value = true
  try {
    const data = await useAPI('/api/stats/compare', {
      query: buildQuery(),
    }) as CompareResponse
    result.value = data
  }
  catch (err: any) {
    const msg = err?.data?.message || err?.message || '查询失败'
    toast.error(msg)
    result.value = null
  }
  finally {
    loading.value = false
  }
}

const baseUrl = computed(() => {
  if (typeof window === 'undefined') return ''
  return window.location.origin
})

function shortLink(slug: string) {
  return `${baseUrl.value}/${slug}`
}

function detailHref(slug: string) {
  return `/dashboard/link?slug=${encodeURIComponent(slug)}`
}

function copyAllLinks() {
  if (!result.value?.data?.length) {
    toast.warning('没有数据可复制')
    return
  }
  const text = result.value.data.map(r => shortLink(r.slug)).join('\n')
  navigator.clipboard.writeText(text).then(() => {
    toast.success(`已复制 ${result.value!.data.length} 条短链`)
  }).catch(() => {
    toast.error('复制失败')
  })
}

function exportCSV() {
  if (!result.value?.data?.length) {
    toast.warning('没有数据可导出')
    return
  }
  const header = ['rank', 'slug', 'short_link', 'original_url', 'country_clicks', 'country_uv', 'total_clicks', 'country_ratio']
  const rows = result.value.data.map((r, i) => [
    i + 1,
    r.slug,
    shortLink(r.slug),
    r.url || '',
    r.countryClicks,
    r.countryUV,
    r.totalClicks,
    `${(r.ratio * 100).toFixed(2)}%`,
  ])
  const csv = [header, ...rows].map(row => row.map((c) => {
    const s = String(c)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }).join(',')).join('\n')

  const bom = '\uFEFF'
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sink-compare-${country.value || 'ALL'}-${Date.now()}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.success('已导出 CSV')
}

const countryLabel = computed(() => {
  if (!country.value || country.value === 'ALL') return '全球'
  const c = COMMON_COUNTRIES.find(x => x.code === country.value)
  return c ? `${c.name} ${c.code}` : country.value
})

onMounted(() => {
  submit()
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">
        数据对比
      </h1>
      <p class="text-sm text-muted-foreground mt-1">
        按国家、时间筛选,看哪些短链在该地区表现最好。数据来自 Cloudflare Analytics Engine,可能有约 5 分钟延迟。
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="space-y-2">
        <label class="text-sm font-medium">时间范围</label>
        <DashboardDatePicker @update:date-range="changeDate" />
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium">国家(留空=全球)</label>
        <Select v-model="country">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">
              全球(不筛选)
            </SelectItem>
            <SelectItem v-for="c in COMMON_COUNTRIES" :key="c.code" :value="c.code">
              {{ c.name }} {{ c.code }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium">slug 包含(可空)</label>
        <Input v-model="slugContains" placeholder="例如 pubg" />
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium">显示前</label>
        <Select v-model="displayLimit">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="20">
              20 条
            </SelectItem>
            <SelectItem :value="50">
              50 条
            </SelectItem>
            <SelectItem :value="100">
              100 条
            </SelectItem>
            <SelectItem :value="200">
              200 条
            </SelectItem>
            <SelectItem :value="500">
              500 条
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <div class="flex gap-2">
      <Button :disabled="loading" @click="submit">
        {{ loading ? '查询中...' : '查询' }}
      </Button>
    </div>

    <div v-if="result" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">
          📊 排行榜:{{ countryLabel }} · 共 {{ result.total }} 条
        </h2>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" :disabled="!result.data.length" @click="copyAllLinks">
            复制全部短链
          </Button>
          <Button variant="outline" size="sm" :disabled="!result.data.length" @click="exportCSV">
            导出 CSV
          </Button>
        </div>
      </div>

      <div v-if="!result.data.length" class="text-center text-muted-foreground py-12">
        所选时间和国家范围内没有数据
      </div>

      <div v-else class="border rounded-md overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-muted/50">
            <tr>
              <th class="text-left p-3">
                排名
              </th>
              <th class="text-left p-3">
                短链 / 原始 URL
              </th>
              <th class="text-right p-3">
                {{ country && country !== 'ALL' ? country : '全球' }} 点击
              </th>
              <th class="text-right p-3">
                {{ country && country !== 'ALL' ? country : '全球' }} UV
              </th>
              <th class="text-right p-3">
                总点击
              </th>
              <th class="text-right p-3">
                占比
              </th>
              <th class="text-center p-3">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in result.data" :key="row.slug" class="border-t hover:bg-muted/30">
              <td class="p-3 font-mono text-xs">
                {{ idx + 1 }}
              </td>
              <td class="p-3">
                <div>
                  <a :href="shortLink(row.slug)" target="_blank" class="text-primary hover:underline font-medium">
                    /{{ row.slug }}
                  </a>
                </div>
                <div v-if="row.url" class="text-xs text-muted-foreground truncate max-w-md mt-0.5" :title="row.url">
                  {{ row.url }}
                </div>
              </td>
              <td class="p-3 text-right font-mono">
                {{ row.countryClicks.toLocaleString() }}
              </td>
              <td class="p-3 text-right font-mono">
                {{ row.countryUV.toLocaleString() }}
              </td>
              <td class="p-3 text-right font-mono">
                {{ row.totalClicks.toLocaleString() }}
              </td>
              <td class="p-3 text-right font-mono">
                {{ (row.ratio * 100).toFixed(1) }}%
              </td>
              <td class="p-3 text-center">
                <NuxtLink :to="detailHref(row.slug)">
                  <Button variant="ghost" size="sm">
                    详情
                  </Button>
                </NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>