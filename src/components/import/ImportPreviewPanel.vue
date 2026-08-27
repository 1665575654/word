<script setup lang="ts">
import {
  ExportOutlined,
  ImportOutlined,
  ClearOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons-vue'
import { JSON_FILE_ACCEPT } from '@/services/fileIO'
import type {
  LessonReadingGroup,
  LessonVocabularyGroup,
  LessonWritingGroup,
} from '@/services/dataMerger'
import EditableLessonTable from '@/components/table/EditableLessonTable.vue'
import EditableLessonGroupTable from '@/components/table/EditableLessonGroupTable.vue'
import ImportTableExpandPanel from '@/components/table/ImportTableExpandPanel.vue'
import EditableJsonPanel from '@/components/EditableJsonPanel.vue'
import type {
  CharacterItem,
  LessonMeta,
  WordItem,
  CharExpandConfig,
  VocabExpandConfig,
  Workspace,
} from '@/types'
import type { EditMode, UploadType } from '@/composables/importTableConfig'

defineProps<{
  workspace: Workspace
  uploadType: UploadType
  uploadTypeLabel: string
  currentDataCountLabel: string
  editMode: EditMode
  jsonText: string
  expandedJsonText: string
  writingTableGroups: LessonWritingGroup[]
  readingTableGroups: LessonReadingGroup[]
  vocabularyTableGroups: LessonVocabularyGroup[]
}>()

const emit = defineEmits<{
  'update:editMode': [value: EditMode]
  'update:jsonText': [value: string]
  'update:expandedJsonText': [value: string]
  clear: []
  exportTableJson: []
  importTableJson: [file: File]
  goToExpand: []
  catalogUpdate: [lessons: LessonMeta[]]
  writingGroupsUpdate: [groups: LessonWritingGroup[]]
  readingGroupsUpdate: [groups: LessonReadingGroup[]]
  vocabularyGroupsUpdate: [groups: LessonVocabularyGroup[]]
  applyJson: [parsed: unknown]
  exportExpandedJson: []
  importExpandedJson: [file: File]
  updateWriting: [data: CharacterItem[]]
  updateReading: [data: CharacterItem[]]
  updateVocabulary: [data: WordItem[]]
  expandConfigChange: [config: CharExpandConfig | VocabExpandConfig]
  applyExpandedJson: [parsed: unknown]
}>()

function beforeImportTableJson(file: File) {
  emit('importTableJson', file)
  return false
}

function beforeImportExpandedJson(file: File) {
  emit('importExpandedJson', file)
  return false
}
</script>

<template>
  <div class="card-section">
    <div class="preview-header">
      <a-typography-title :level="5" style="margin: 0">
        {{ uploadTypeLabel }} — 数据预览与编辑 ({{ currentDataCountLabel }})
      </a-typography-title>
      <a-space>
        <a-popconfirm title="确定清空当前数据？" @confirm="emit('clear')">
          <a-button danger>
            <ClearOutlined /> 清空
          </a-button>
        </a-popconfirm>
      </a-space>
    </div>
    <a-typography-paragraph type="secondary" style="margin-top: 8px">
      预览内容随上方数据类型切换，仅展示当前类型的数据。
    </a-typography-paragraph>
    <a-tabs
      :activeKey="editMode"
      style="margin-top: 8px"
      @update:activeKey="emit('update:editMode', $event as EditMode)"
    >
      <a-tab-pane key="table" tab="表格编辑">
        <div class="tab-toolbar">
          <a-space>
            <a-button @click="emit('exportTableJson')">
              <ExportOutlined /> 下载 JSON
            </a-button>
            <a-upload
              :before-upload="beforeImportTableJson"
              :show-upload-list="false"
              :accept="JSON_FILE_ACCEPT"
            >
              <a-button>
                <ImportOutlined /> 上传 JSON
              </a-button>
            </a-upload>
            <a-button
              v-if="uploadType !== 'catalog'"
              type="primary"
              @click="emit('goToExpand')"
            >
              <ThunderboltOutlined /> AI 拓展
            </a-button>
          </a-space>
        </div>
        <EditableLessonTable
          v-if="uploadType === 'catalog'"
          :data="workspace.catalog.lessons"
          @update="emit('catalogUpdate', $event)"
        />
        <EditableLessonGroupTable
          v-else-if="uploadType === 'writing'"
          kind="writing"
          :groups="writingTableGroups"
          @update="(groups) => emit('writingGroupsUpdate', groups as LessonWritingGroup[])"
        />
        <EditableLessonGroupTable
          v-else-if="uploadType === 'reading'"
          kind="reading"
          :groups="readingTableGroups"
          @update="(groups) => emit('readingGroupsUpdate', groups as LessonReadingGroup[])"
        />
        <EditableLessonGroupTable
          v-else
          kind="vocabulary"
          :groups="vocabularyTableGroups"
          @update="(groups) => emit('vocabularyGroupsUpdate', groups as LessonVocabularyGroup[])"
        />
      </a-tab-pane>
      <a-tab-pane key="json" tab="JSON 编辑">
        <EditableJsonPanel
          :model-value="jsonText"
          @update:model-value="emit('update:jsonText', $event)"
          @apply="emit('applyJson', $event)"
        />
      </a-tab-pane>
      <a-tab-pane v-if="uploadType !== 'catalog'" key="expand" tab="AI 拓展">
        <div class="tab-toolbar">
          <a-space>
            <a-button @click="emit('exportExpandedJson')">
              <ExportOutlined /> 下载 JSON
            </a-button>
            <a-upload
              :before-upload="beforeImportExpandedJson"
              :show-upload-list="false"
              :accept="JSON_FILE_ACCEPT"
            >
              <a-button>
                <ImportOutlined /> 上传 JSON
              </a-button>
            </a-upload>
          </a-space>
        </div>
        <ImportTableExpandPanel
          :table-type="uploadType"
          :grade="workspace.meta.grade"
          :catalog="workspace.catalog.lessons"
          :writing-chars="workspace.writingChars"
          :reading-chars="workspace.readingChars"
          :vocabulary="workspace.vocabulary"
          @update-writing="emit('updateWriting', $event)"
          @update-reading="emit('updateReading', $event)"
          @update-vocabulary="emit('updateVocabulary', $event)"
          @expand-config-change="emit('expandConfigChange', $event)"
        />
      </a-tab-pane>
      <a-tab-pane v-if="uploadType !== 'catalog'" key="expandedJson" tab="拓展后的 JSON">
        <EditableJsonPanel
          :model-value="expandedJsonText"
          @update:model-value="emit('update:expandedJsonText', $event)"
          @apply="emit('applyExpandedJson', $event)"
        />
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<style scoped>
.tab-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.preview-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
