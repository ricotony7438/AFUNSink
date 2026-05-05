<script setup>
import { AlertCircle, KeyRound, User as UserIcon } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const { previewMode } = useRuntimeConfig().public

const mode = ref('user') // 'user' 用户名密码 | 'token' 老 token 兜底
const username = ref('')
const password = ref('')
const token = ref('')
const submitting = ref(false)

async function loginByUser() {
  if (!username.value.trim() || !password.value) {
    toast.error('请输入用户名和密码')
    return
  }
  submitting.value = true
  try {
    const data = await $fetch('/api/auth/login', {
      method: 'POST',
      body: {
        username: username.value.trim(),
        password: password.value,
      },
    })
    // 把 session token 存到 localStorage,沿用现有 key 名
    localStorage.setItem('SinkSiteToken', data.token)
    localStorage.setItem('SinkUsername', data.username)
    localStorage.setItem('SinkUserRole', data.role)
    toast.success(`欢迎回来,${data.username}`)
    await navigateTo('/dashboard')
  }
  catch (e) {
    console.error(e)
    toast.error('登录失败', {
      description: e?.data?.message || e?.message || '请检查用户名和密码',
    })
  }
  finally {
    submitting.value = false
  }
}

async function loginByToken() {
  if (!token.value.trim()) {
    toast.error('请输入 token')
    return
  }
  submitting.value = true
  try {
    localStorage.setItem('SinkSiteToken', token.value.trim())
    localStorage.removeItem('SinkUsername')
    localStorage.removeItem('SinkUserRole')
    await useAPI('/api/verify')
    toast.success('登录成功')
    await navigateTo('/dashboard')
  }
  catch (e) {
    console.error(e)
    localStorage.removeItem('SinkSiteToken')
    toast.error('Token 无效', {
      description: e?.data?.message || e?.message || '请检查 token',
    })
  }
  finally {
    submitting.value = false
  }
}

function handleKeydown(e) {
  if (e.key === 'Enter') {
    if (mode.value === 'user') loginByUser()
    else loginByToken()
  }
}
</script>

<template>
  <Card class="w-full max-w-sm">
    <CardHeader>
      <CardTitle class="text-2xl">
        登录
      </CardTitle>
      <CardDescription>
        <span v-if="mode === 'user'">使用用户名和密码登录</span>
        <span v-else>使用站点 token 登录(管理员兜底)</span>
      </CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      <!-- 用户名密码登录 -->
      <div v-if="mode === 'user'" class="space-y-4">
        <div class="space-y-2">
          <Label for="username">用户名</Label>
          <div class="relative">
            <UserIcon class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="username"
              v-model="username"
              placeholder="例如 owen"
              class="pl-9"
              :disabled="submitting"
              @keydown="handleKeydown"
            />
          </div>
        </div>
        <div class="space-y-2">
          <Label for="password">密码</Label>
          <div class="relative">
            <KeyRound class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="password"
              v-model="password"
              type="password"
              placeholder="********"
              class="pl-9"
              :disabled="submitting"
              @keydown="handleKeydown"
            />
          </div>
        </div>
        <Button class="w-full" :disabled="submitting" @click="loginByUser">
          {{ submitting ? '登录中...' : '登录' }}
        </Button>
      </div>

      <!-- token 登录 -->
      <div v-else class="space-y-4">
        <div class="space-y-2">
          <Label for="token">站点 Token</Label>
          <div class="relative">
            <KeyRound class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="token"
              v-model="token"
              type="password"
              placeholder="********"
              class="pl-9"
              :disabled="submitting"
              @keydown="handleKeydown"
            />
          </div>
        </div>
        <Alert v-if="previewMode">
          <AlertCircle class="w-4 h-4" />
          <AlertTitle>提示</AlertTitle>
          <AlertDescription>
            预览模式的站点 token 是 <code class="font-mono text-green-500">SinkCool</code>
          </AlertDescription>
        </Alert>
        <Button class="w-full" :disabled="submitting" @click="loginByToken">
          {{ submitting ? '登录中...' : '登录' }}
        </Button>
      </div>

      <!-- 切换登录方式 -->
      <div class="text-center text-xs text-muted-foreground">
        <button
          type="button"
          class="hover:text-foreground hover:underline"
          @click="mode = mode === 'user' ? 'token' : 'user'"
        >
          {{ mode === 'user' ? '改用 token 登录' : '改用用户名登录' }}
        </button>
      </div>
    </CardContent>
  </Card>
</template>