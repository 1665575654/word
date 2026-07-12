<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkspaceStore } from '@/stores/workspace'
import { STAGE_LABELS } from '@/types'
import { getWorkspaceDisplayName } from '@/utils/exportName'

const route = useRoute()
const router = useRouter()
const workspaceStore = useWorkspaceStore()

const workspaceId = computed(() => route.params.id as string)
const workspace = computed(() =>
  workspaceStore.workspaces.find((w) => w.id === workspaceId.value)
)

watch(
  [workspaceId, () => workspaceStore.loaded],
  ([id, loaded]) => {
    if (id && loaded) workspaceStore.select(id)
  },
  { immediate: true }
)

const stepRoutes = ['import', 'export'] as const

const currentStep = computed(() => {
  const idx = stepRoutes.indexOf(route.name as typeof stepRoutes[number])
  return idx >= 0 ? idx : 0
})

function goStep(step: number) {
  router.push(`/workspace/${workspaceId.value}/${stepRoutes[step]}`)
}
</script>

<template>
  <div class="page-container">
    <div v-if="workspace" style="margin-bottom: 16px">
      <a-typography-title :level="4" style="margin: 0">
        {{ getWorkspaceDisplayName(workspace.meta) }}
      </a-typography-title>
      <a-typography-text type="secondary">
        阶段：{{ STAGE_LABELS[workspace.stage] }}
      </a-typography-text>
    </div>

    <a-steps :current="currentStep" style="margin-bottom: 24px" @change="goStep">
      <a-step title="上传识别" description="目录/生字/识字/词语" />
      <a-step title="生成文件" description="选择模板导出" />
    </a-steps>

    <router-view />
  </div>
</template>
