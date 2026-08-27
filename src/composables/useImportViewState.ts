import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  DATA_TYPES,
  isEditMode,
  isUploadType,
  type EditMode,
  type UploadType,
} from '@/composables/importTableConfig'

/** uploadType / editMode 与路由 query（type、tab）双向同步 */
export function useImportViewState() {
  const route = useRoute()
  const router = useRouter()

  const uploadType = ref<UploadType>('catalog')
  const editMode = ref<EditMode>('table')

  function applyRouteViewState() {
    const typeQuery = route.query.type
    const tabQuery = route.query.tab

    if (isUploadType(typeQuery)) {
      uploadType.value = typeQuery
    }

    if (isEditMode(tabQuery)) {
      if (tabQuery === 'expand' || tabQuery === 'expandedJson') {
        if (uploadType.value !== 'catalog') {
          editMode.value = tabQuery
        } else if (isUploadType(typeQuery) && typeQuery !== 'catalog') {
          editMode.value = tabQuery
        } else {
          editMode.value = 'table'
        }
      } else {
        editMode.value = tabQuery
      }
    }
  }

  function syncRouteViewState() {
    const nextQuery = { ...route.query }
    if (uploadType.value === 'catalog') {
      delete nextQuery.type
    } else {
      nextQuery.type = uploadType.value
    }
    if (editMode.value === 'table') {
      delete nextQuery.tab
    } else {
      nextQuery.tab = editMode.value
    }
    const changed =
      nextQuery.type !== route.query.type || nextQuery.tab !== route.query.tab
    if (changed) {
      router.replace({ query: nextQuery })
    }
  }

  function goToExpandTab() {
    if (uploadType.value === 'catalog') {
      message.info('请先选择写字表、识字表或词语表')
      return
    }
    editMode.value = 'expand'
  }

  applyRouteViewState()

  watch(
    () => [route.query.type, route.query.tab],
    () => applyRouteViewState()
  )

  watch([uploadType, editMode], () => {
    syncRouteViewState()
  })

  watch(uploadType, (type) => {
    if (type === 'catalog' && (editMode.value === 'expand' || editMode.value === 'expandedJson')) {
      editMode.value = 'table'
    }
  })

  return {
    DATA_TYPES,
    uploadType,
    editMode,
    goToExpandTab,
  }
}
