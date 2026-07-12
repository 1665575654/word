<script setup lang="ts">
import { onMounted } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import AppHeader from '@/components/layout/AppHeader.vue'

const workspaceStore = useWorkspaceStore()

onMounted(() => {
  workspaceStore.init()
})
</script>

<template>
  <a-layout style="min-height: 100vh">
    <AppHeader />
    <a-layout-content>
      <router-view />
    </a-layout-content>
  </a-layout>
</template>
