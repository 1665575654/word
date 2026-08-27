import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { useWorkspaceStore } from '@/stores/workspace'

/** 根据路由 :id 解析工作区，并确保 store.current 已选中（update 依赖 current） */
export function useWorkspaceRoute() {
  const route = useRoute()
  const workspaceStore = useWorkspaceStore()

  const workspaceId = computed(() => {
    const id = route.params.id
    return typeof id === 'string' ? id : ''
  })

  const workspace = computed(() =>
    workspaceId.value
      ? workspaceStore.workspaces.find((w) => w.id === workspaceId.value)
      : undefined
  )

  async function ensureWorkspaceSelected(): Promise<boolean> {
    if (!workspace.value) {
      message.error('工作区未加载，请刷新页面后重试')
      return false
    }
    if (workspaceStore.current?.id !== workspace.value.id) {
      workspaceStore.select(workspace.value.id)
    }
    return true
  }

  return {
    workspaceId,
    workspace,
    workspaceStore,
    ensureWorkspaceSelected,
  }
}
