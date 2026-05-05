<script setup>
const route = useRoute()

// 检查当前用户是否是 admin,仅 admin 能看到"用户管理" tab
const isAdmin = ref(false)
onMounted(async () => {
  try {
    const me = await useAPI('/api/auth/me')
    isAdmin.value = me?.role === 'admin'
  }
  catch {
    isAdmin.value = false
  }
})
</script>

<template>
  <section class="flex justify-between">
    <Tabs
      v-if="route.path !== '/dashboard/link'"
      :default-value="route.path"
      @update:model-value="navigateTo"
    >
      <TabsList>
        <TabsTrigger
          value="/dashboard/links"
        >
          {{ $t('nav.links') }}
        </TabsTrigger>
        <TabsTrigger value="/dashboard/analysis">
          {{ $t('nav.analysis') }}
        </TabsTrigger>
        <TabsTrigger value="/dashboard/realtime">
          {{ $t('nav.realtime') }}
        </TabsTrigger>
        <TabsTrigger v-if="isAdmin" value="/dashboard/users">
          {{ $t('nav.users') }}
        </TabsTrigger>
      </TabsList>
    </Tabs>
    <slot name="left" />
    <div>
      <slot />
    </div>
  </section>
</template>