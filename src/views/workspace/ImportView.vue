<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ArrowRightOutlined } from '@ant-design/icons-vue'
import ImportUploadCard from '@/components/import/ImportUploadCard.vue'
import ImportPreviewPanel from '@/components/import/ImportPreviewPanel.vue'
import { useWorkspaceRoute } from '@/composables/useWorkspaceRoute'
import { useImportViewState } from '@/composables/useImportViewState'
import { useImportTableData } from '@/composables/useImportTableData'
import type { CharacterItem, WordItem } from '@/types'

const router = useRouter()
const { workspace, workspaceStore, ensureWorkspaceSelected } = useWorkspaceRoute()
const { DATA_TYPES, uploadType, editMode, goToExpandTab } = useImportViewState()

const {
  parsing,
  jsonText,
  expandedJsonText,
  writingTableGroups,
  readingTableGroups,
  vocabularyTableGroups,
  uploadTypeLabel,
  currentDataCountLabel,
  handleImageUpload,
  onCatalogUpdate,
  onWritingGroupsUpdate,
  onReadingGroupsUpdate,
  onVocabularyGroupsUpdate,
  mergeFieldUpdate,
  onExpandConfigChange,
  applyExpandedJsonData,
  applyJsonData,
  handleExportTableJson,
  handleExportExpandedJson,
  handleImportTableJson,
  handleImportExpandedJson,
  handleClear,
} = useImportTableData({
  workspace,
  workspaceStore,
  ensureWorkspaceSelected,
  uploadType,
  editMode,
})

function goNext() {
  if (!workspace.value) return
  router.push(`/workspace/${workspace.value.id}/export`)
}

function onUpdateWriting(data: CharacterItem[]) {
  void mergeFieldUpdate('writingChars', data, (c) => `${c.lessonNo}-${c.char}`)
}

function onUpdateReading(data: CharacterItem[]) {
  void mergeFieldUpdate('readingChars', data, (c) => `${c.lessonNo}-${c.char}`)
}

function onUpdateVocabulary(data: WordItem[]) {
  void mergeFieldUpdate('vocabulary', data, (w) => `${w.lessonNo}-${w.word}`)
}
</script>

<template>
  <div>
    <ImportUploadCard
      v-model:upload-type="uploadType"
      :upload-type-label="uploadTypeLabel"
      :parsing="parsing"
      :data-types="DATA_TYPES"
      @upload="handleImageUpload"
    />

    <ImportPreviewPanel
      v-if="workspace"
      :workspace="workspace"
      :upload-type="uploadType"
      :upload-type-label="uploadTypeLabel"
      :current-data-count-label="currentDataCountLabel"
      v-model:edit-mode="editMode"
      v-model:json-text="jsonText"
      v-model:expanded-json-text="expandedJsonText"
      :writing-table-groups="writingTableGroups"
      :reading-table-groups="readingTableGroups"
      :vocabulary-table-groups="vocabularyTableGroups"
      @clear="handleClear"
      @export-table-json="handleExportTableJson"
      @import-table-json="handleImportTableJson"
      @go-to-expand="goToExpandTab"
      @catalog-update="onCatalogUpdate"
      @writing-groups-update="onWritingGroupsUpdate"
      @reading-groups-update="onReadingGroupsUpdate"
      @vocabulary-groups-update="onVocabularyGroupsUpdate"
      @apply-json="applyJsonData"
      @export-expanded-json="handleExportExpandedJson"
      @import-expanded-json="handleImportExpandedJson"
      @update-writing="onUpdateWriting"
      @update-reading="onUpdateReading"
      @update-vocabulary="onUpdateVocabulary"
      @expand-config-change="onExpandConfigChange"
      @apply-expanded-json="applyExpandedJsonData"
    />

    <a-space style="margin-top: 16px">
      <a-button type="primary" @click="goNext">
        下一步：生成文件 <ArrowRightOutlined />
      </a-button>
    </a-space>
  </div>
</template>
