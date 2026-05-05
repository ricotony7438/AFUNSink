<script setup>
import { Loader, Plus, ShieldCheck, Trash2, User as UserIcon, UserCog, UserX } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const users = ref([])
const loading = ref(false)
const me = ref(null)

// 创建用户对话框
const createOpen = ref(false)
const createForm = ref({
  username: '',
  password: '',
  role: 'user',
  displayName: '',
})
const createSubmitting = ref(false)

// 编辑用户对话框
const editOpen = ref(false)
const editTarget = ref(null) // 当前编辑的用户对象
const editForm = ref({
  password: '',
  role: 'user',
  displayName: '',
})
const editSubmitting = ref(false)

// 加载用户列表
async function loadUsers() {
  loading.value = true
  try {
    const data = await useAPI('/api/admin/users')
    users.value = data.users || []
  }
  catch (e) {
    toast.error(e?.data?.message || e?.message || '加载用户列表失败')
  }
  finally {
    loading.value = false
  }
}

// 加载当前登录用户
async function loadMe() {
  try {
    const data = await useAPI('/api/auth/me')
    me.value = data
  }
  catch {
    me.value = null
  }
}

// 提交创建
async function submitCreate() {
  if (!createForm.value.username.trim() || !createForm.value.password) {
    toast.error('用户名和密码必填')
    return
  }
  createSubmitting.value = true
  try {
    const created = await useAPI('/api/admin/users', {
      method: 'POST',
      body: {
        username: createForm.value.username.trim(),
        password: createForm.value.password,
        role: createForm.value.role,
        displayName: createForm.value.displayName.trim() || undefined,
      },
    })
    toast.success(`用户 ${created.username} 创建成功`)
    createOpen.value = false
    createForm.value = { username: '', password: '', role: 'user', displayName: '' }
    await loadUsers()
  }
  catch (e) {
    toast.error(e?.data?.message || e?.message || '创建失败')
  }
  finally {
    createSubmitting.value = false
  }
}

// 打开编辑对话框
function openEdit(user) {
  editTarget.value = user
  editForm.value = {
    password: '',
    role: user.role,
    displayName: user.displayName || '',
  }
  editOpen.value = true
}

// 提交编辑
async function submitEdit() {
  if (!editTarget.value) return
  editSubmitting.value = true
  try {
    const body = {}
    if (editForm.value.password) body.password = editForm.value.password
    if (editForm.value.role !== editTarget.value.role) body.role = editForm.value.role
    if (editForm.value.displayName !== (editTarget.value.displayName || '')) {
      body.displayName = editForm.value.displayName
    }

    if (Object.keys(body).length === 0) {
      toast.warning('没有修改任何字段')
      editSubmitting.value = false
      return
    }

    await useAPI(`/api/admin/users/${encodeURIComponent(editTarget.value.username)}`, {
      method: 'PUT',
      body,
    })
    toast.success(`用户 ${editTarget.value.username} 已更新`)
    editOpen.value = false
    await loadUsers()
  }
  catch (e) {
    toast.error(e?.data?.message || e?.message || '修改失败')
  }
  finally {
    editSubmitting.value = false
  }
}

// 切换启用/禁用
async function toggleDisabled(user) {
  const newState = !user.disabled
  const action = newState ? '禁用' : '启用'
  if (!confirm(`确定要${action}用户 ${user.username}吗?`)) return
  try {
    await useAPI(`/api/admin/users/${encodeURIComponent(user.username)}`, {
      method: 'PUT',
      body: { disabled: newState },
    })
    toast.success(`已${action}用户 ${user.username}`)
    await loadUsers()
  }
  catch (e) {
    toast.error(e?.data?.message || e?.message || '操作失败')
  }
}

// 删除用户
async function deleteUser(user) {
  const ok = confirm(
    `确定要删除用户 ${user.username} 吗?\n\n`
    + `他名下的所有链接会被转移给当前管理员(${me.value?.username || 'admin'})。\n`
    + `用户记录将永久删除,且不可恢复。`,
  )
  if (!ok) return
  try {
    const result = await useAPI(`/api/admin/users/${encodeURIComponent(user.username)}`, {
      method: 'DELETE',
    })
    toast.success(
      `用户 ${user.username} 已删除,转移了 ${result.reassignedCount} 条链接`,
      { description: result.reassignFailed > 0 ? `${result.reassignFailed} 条转移失败,请手动处理` : undefined },
    )
    await loadUsers()
  }
  catch (e) {
    toast.error(e?.data?.message || e?.message || '删除失败')
  }
}

function formatTime(unix) {
  if (!unix) return '从未'
  return new Date(unix * 1000).toLocaleString('zh-CN', { hour12: false })
}

function isSelf(user) {
  return me.value?.username === user.username
}

onMounted(() => {
  loadMe()
  loadUsers()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          用户管理
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          管理系统的所有用户账号。删除用户会把他名下的链接自动转移给你。
        </p>
      </div>
      <Button @click="createOpen = true">
        <Plus class="w-4 h-4 mr-2" />
        新建用户
      </Button>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <Loader class="animate-spin w-6 h-6 text-muted-foreground" />
    </div>

    <div v-else-if="users.length === 0" class="text-center text-muted-foreground py-12">
      还没有任何用户(理论不会出现,至少 owen 自己应该在)
    </div>

    <div v-else class="border rounded-md overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="text-left p-3">
              用户名
            </th>
            <th class="text-left p-3">
              显示名
            </th>
            <th class="text-left p-3">
              角色
            </th>
            <th class="text-left p-3">
              状态
            </th>
            <th class="text-left p-3">
              创建时间
            </th>
            <th class="text-left p-3">
              最后登录
            </th>
            <th class="text-center p-3">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.username" class="border-t hover:bg-muted/30">
            <td class="p-3 font-mono">
              <span class="flex items-center gap-2">
                <UserIcon class="w-4 h-4 text-muted-foreground" />
                {{ user.username }}
                <span v-if="isSelf(user)" class="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  我
                </span>
              </span>
            </td>
            <td class="p-3">
              {{ user.displayName || '—' }}
            </td>
            <td class="p-3">
              <span
                :class="user.role === 'admin'
                  ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-violet-500/10 text-violet-700 dark:text-violet-300'
                  : 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-500/10 text-slate-700 dark:text-slate-300'"
              >
                <ShieldCheck v-if="user.role === 'admin'" class="w-3 h-3" />
                {{ user.role === 'admin' ? '管理员' : '普通用户' }}
              </span>
            </td>
            <td class="p-3">
              <span
                :class="user.disabled
                  ? 'inline-flex px-2 py-0.5 rounded text-xs bg-red-500/10 text-red-700 dark:text-red-300'
                  : 'inline-flex px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-700 dark:text-green-300'"
              >
                {{ user.disabled ? '已禁用' : '正常' }}
              </span>
            </td>
            <td class="p-3 text-xs text-muted-foreground">
              {{ formatTime(user.createdAt) }}
            </td>
            <td class="p-3 text-xs text-muted-foreground">
              {{ formatTime(user.lastLoginAt) }}
            </td>
            <td class="p-3">
              <div class="flex items-center justify-center gap-1">
                <Button variant="ghost" size="sm" title="编辑" @click="openEdit(user)">
                  <UserCog class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost" size="sm"
                  :title="user.disabled ? '启用' : '禁用'"
                  :disabled="isSelf(user)"
                  @click="toggleDisabled(user)"
                >
                  <UserX class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost" size="sm"
                  title="删除"
                  :disabled="isSelf(user)"
                  class="text-red-600 hover:text-red-700"
                  @click="deleteUser(user)"
                >
                  <Trash2 class="w-4 h-4" />
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 创建用户对话框 -->
    <Dialog v-model:open="createOpen">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>新建用户</DialogTitle>
          <DialogDescription>
            创建后用户可以用此账号密码登录系统
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-2">
          <div class="space-y-2">
            <Label>用户名 *</Label>
            <Input
              v-model="createForm.username"
              placeholder="3-20 位,字母/数字/_/-"
              :disabled="createSubmitting"
            />
          </div>
          <div class="space-y-2">
            <Label>密码 *</Label>
            <Input
              v-model="createForm.password"
              type="password"
              placeholder="至少 8 位"
              :disabled="createSubmitting"
            />
          </div>
          <div class="space-y-2">
            <Label>角色</Label>
            <Select v-model="createForm.role" :disabled="createSubmitting">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">
                  普通用户(只能管自己的链接)
                </SelectItem>
                <SelectItem value="admin">
                  管理员(看所有人的链接)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label>显示名(可选)</Label>
            <Input
              v-model="createForm.displayName"
              placeholder="留空则使用用户名"
              :disabled="createSubmitting"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" :disabled="createSubmitting" @click="createOpen = false">
            取消
          </Button>
          <Button :disabled="createSubmitting" @click="submitCreate">
            {{ createSubmitting ? '创建中...' : '创建' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 编辑用户对话框 -->
    <Dialog v-model:open="editOpen">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>编辑用户 {{ editTarget?.username }}</DialogTitle>
          <DialogDescription>
            只填要修改的字段,留空表示不变
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-2">
          <div class="space-y-2">
            <Label>新密码(留空 = 不改)</Label>
            <Input
              v-model="editForm.password"
              type="password"
              placeholder="至少 8 位"
              :disabled="editSubmitting"
            />
          </div>
          <div class="space-y-2">
            <Label>角色</Label>
            <Select
              v-model="editForm.role"
              :disabled="editSubmitting || (editTarget && isSelf(editTarget))"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">
                  普通用户
                </SelectItem>
                <SelectItem value="admin">
                  管理员
                </SelectItem>
              </SelectContent>
            </Select>
            <p v-if="editTarget && isSelf(editTarget)" class="text-xs text-muted-foreground">
              不能修改自己的角色
            </p>
          </div>
          <div class="space-y-2">
            <Label>显示名</Label>
            <Input
              v-model="editForm.displayName"
              placeholder="留空 = 用户名"
              :disabled="editSubmitting"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" :disabled="editSubmitting" @click="editOpen = false">
            取消
          </Button>
          <Button :disabled="editSubmitting" @click="submitEdit">
            {{ editSubmitting ? '保存中...' : '保存' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>