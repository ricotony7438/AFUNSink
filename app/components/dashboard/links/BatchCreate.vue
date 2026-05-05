<script setup lang="ts">
import { CheckCircle2, Copy, Download, Loader2, Upload, XCircle } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

interface BatchResult {
  total: number
  successCount: number
  failureCount: number
  succeeded: Array<{ row: number, url: string, slug: string, shortLink: string }>
  failed: Array<{ row: number, url: string, reason: string }>
}

const inputText = ref('')
const onConflict = ref<'skip' | 'overwrite'>('skip')
const loading = ref(false)
const result = ref<BatchResult | null>(null)

const parsedLinks = computed(() => {
  return inputText.value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\t]/).map(s => s.trim())
      // 关键:slug/comment 没填时不传(undefined),
      // 让后端 LinkSchema 的 .default(nanoid()) 自动生成 slug
      const item: { url: string, slug?: string, comment?: string } = {
        url: parts[0] || '',
      }
      if (parts[1])
        item.slug = parts[1]
      if (parts[2])
        item.comment = parts[2]
      return item
    })
})

const lineCount = computed(() => parsedLinks.value.length)
const tooMany = computed(() => lineCount.value > 500)

async function handleFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file)
    return
  const text = await file.text()
  inputText.value = text
}

async function submit() {
  if (!lineCount.value || tooMany.value)
    return
  loading.value = true
  result.value = null
  try {
    const data = await useAPI('/api/link/batch', {
      method: 'POST',
      body: { links: parsedLinks.value, onConflict: onConflict.value },
    }) as BatchResult
    result.value = data
    if (data.failureCount === 0) {
      toast.success(`批量生成完成:${data.successCount} 条全部成功`)
    }
    else {
      toast.warning(`批量生成完成:${data.successCount} 成功,${data.failureCount} 失败`)
    }
  }
  catch (err: any) {
    toast.error(err?.data?.message || err?.message || '请求失败')
  }
  finally {
    loading.value = false
  }
}

function copyAll() {
  if (!result.value)
    return
  const text = result.value.succeeded.map(s => s.shortLink).join('\n')
  navigator.clipboard.writeText(text)
  toast.success('已复制全部短链')
}

function copyAsCSV() {
  if (!result.value)
    return
  const header = 'row,original_url,slug,short_link'
  const rows = result.value.succeeded.map(s =>
    `${s.row},"${s.url}",${s.slug},${s.shortLink}`,
  )
  navigator.clipboard.writeText([header, ...rows].join('\n'))
  toast.success('已复制为 CSV')
}

function downloadCSV() {
  if (!result.value)
    return
  const header = 'row,status,original_url,slug,short_link,reason'
  const okRows = result.value.succeeded.map(s =>
    `${s.row},success,"${s.url}",${s.slug},${s.shortLink},`,
  )
  const failRows = result.value.failed.map(f =>
    `${f.row},failed,"${f.url}",,,${f.reason.replace(/,/g, ';')}`,
  )
  const csv = [header, ...okRows, ...failRows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sink-batch-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function reset() {
  inputText.value = ''
  result.value = null
}
</script>

<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>批量生成短链</CardTitle>
        <CardDescription>
          每行一条。支持三种格式:<code>url</code> / <code>url,slug</code> / <code>url,slug,comment</code>。slug 留空将自动生成。最多一次 500 条。
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <Textarea
          v-model="inputText"
          rows="12"
          placeholder="https://example.com/page-1
https://example.com/page-2,my-slug
https://example.com/page-3,promo,Spring sale 2026"
          class="font-mono text-sm"
        />

        <div class="flex flex-wrap items-center gap-3">
          <label class="inline-flex items-center gap-2 cursor-pointer text-sm">
            <input type="file" accept=".csv,.txt" class="hidden" @change="handleFileUpload">
            <Button variant="outline" size="sm" as="span">
              <Upload class="w-4 h-4 mr-2" /> 上传 CSV / TXT
            </Button>
          </label>

          <Select v-model="onConflict">
            <SelectTrigger class="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="skip">
                slug 冲突时跳过
              </SelectItem>
              <SelectItem value="overwrite">
                slug 冲突时覆盖
              </SelectItem>
            </SelectContent>
          </Select>

          <span class="text-sm text-muted-foreground ml-auto">
            <span :class="tooMany ? 'text-destructive font-medium' : ''">
              {{ lineCount }} / 500
            </span>
          </span>
        </div>

        <div class="flex gap-2">
          <Button :disabled="!lineCount || tooMany || loading" @click="submit">
            <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
            生成 {{ lineCount }} 条短链
          </Button>
          <Button v-if="result" variant="ghost" @click="reset">
            重置
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card v-if="result">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <CheckCircle2 class="w-5 h-5 text-green-600" />
          完成:{{ result.successCount }} 成功 / {{ result.failureCount }} 失败
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" :disabled="!result.successCount" @click="copyAll">
            <Copy class="w-4 h-4 mr-2" /> 复制全部短链
          </Button>
          <Button size="sm" variant="outline" :disabled="!result.successCount" @click="copyAsCSV">
            <Copy class="w-4 h-4 mr-2" /> 复制为 CSV
          </Button>
          <Button size="sm" variant="outline" @click="downloadCSV">
            <Download class="w-4 h-4 mr-2" /> 下载完整 CSV
          </Button>
        </div>

        <div v-if="result.successCount" class="border rounded-md max-h-96 overflow-auto">
          <table class="w-full text-sm">
            <thead class="bg-muted sticky top-0">
              <tr>
                <th class="text-left p-2 w-12">
                  #
                </th>
                <th class="text-left p-2">
                  原始 URL
                </th>
                <th class="text-left p-2">
                  短链
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in result.succeeded" :key="s.slug" class="border-t">
                <td class="p-2 text-muted-foreground">
                  {{ s.row }}
                </td>
                <td class="p-2 font-mono text-xs truncate max-w-xs" :title="s.url">
                  {{ s.url }}
                </td>
                <td class="p-2 font-mono text-xs">
                  <a :href="s.shortLink" target="_blank" class="text-primary hover:underline">
                    {{ s.shortLink }}
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="result.failureCount" class="border border-destructive/30 rounded-md max-h-64 overflow-auto">
          <table class="w-full text-sm">
            <thead class="bg-destructive/10 sticky top-0">
              <tr>
                <th class="text-left p-2 w-12">
                  #
                </th>
                <th class="text-left p-2">
                  URL
                </th>
                <th class="text-left p-2">
                  失败原因
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in result.failed" :key="`${f.row}-${f.url}`" class="border-t">
                <td class="p-2 text-muted-foreground">
                  {{ f.row }}
                </td>
                <td class="p-2 font-mono text-xs truncate max-w-xs" :title="f.url">
                  {{ f.url }}
                </td>
                <td class="p-2 text-destructive text-xs">
                  <XCircle class="w-3 h-3 inline mr-1" />{{ f.reason }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
