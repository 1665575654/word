<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CharacterItem, WordItem, Workspace } from '@/types'
import { buildLessonMergeRows } from '@/services/dataMerger'
import { formatLessonOrdinalLabel, normalizeLessonNo } from '@/services/lessonNoUtils'
import EditableCharTable from '@/components/table/EditableCharTable.vue'
import EditableVocabTable from '@/components/table/EditableVocabTable.vue'

const props = defineProps<{
  workspace: Workspace
}>()

const emit = defineEmits<{
  updateWriting: [data: CharacterItem[]]
  updateReading: [data: CharacterItem[]]
  updateVocab: [data: WordItem[]]
}>()

const activeKeys = ref<(string | number)[]>([])

const lessonRows = computed(() => buildLessonMergeRows(props.workspace))

watch(
  lessonRows,
  (rows) => {
    if (activeKeys.value.length === 0 && rows.length > 0) {
      activeKeys.value = rows.slice(0, 3).map((r) => String(r.lessonNo))
    }
  },
  { immediate: true }
)

function filterCharsByLesson(chars: CharacterItem[], lessonNo: string): CharacterItem[] {
  const no = normalizeLessonNo(lessonNo)
  return chars.filter((c) => normalizeLessonNo(c.lessonNo) === no)
}

function filterWordsByLesson(words: WordItem[], lessonNo: string): WordItem[] {
  const no = normalizeLessonNo(lessonNo)
  return words.filter((w) => normalizeLessonNo(w.lessonNo) === no)
}

function replaceLessonChars(
  all: CharacterItem[],
  lessonNo: string,
  lessonItems: CharacterItem[]
): CharacterItem[] {
  const no = normalizeLessonNo(lessonNo)
  const others = all.filter((c) => normalizeLessonNo(c.lessonNo) !== no)
  return [...others, ...lessonItems.map((c) => ({ ...c, lessonNo: no }))]
}

function replaceLessonWords(all: WordItem[], lessonNo: string, lessonItems: WordItem[]): WordItem[] {
  const no = normalizeLessonNo(lessonNo)
  const others = all.filter((w) => normalizeLessonNo(w.lessonNo) !== no)
  return [...others, ...lessonItems.map((w) => ({ ...w, lessonNo: no }))]
}

function panelHeader(row: { lessonNo: string; title: string }) {
  const title = row.title?.trim() || ''
  const label = formatLessonOrdinalLabel(row.lessonNo)
  return title ? `${label} · ${title}` : label
}

function onWritingUpdate(lessonNo: string, items: CharacterItem[]) {
  emit('updateWriting', replaceLessonChars(props.workspace.writingChars, lessonNo, items))
}

function onReadingUpdate(lessonNo: string, items: CharacterItem[]) {
  emit('updateReading', replaceLessonChars(props.workspace.readingChars, lessonNo, items))
}

function onVocabUpdate(lessonNo: string, items: WordItem[]) {
  emit('updateVocab', replaceLessonWords(props.workspace.vocabulary, lessonNo, items))
}
</script>

<template>
  <div class="expanded-lesson-results">
    <a-empty v-if="lessonRows.length === 0" description="暂无课次数据" />

    <a-collapse v-else v-model:activeKey="activeKeys" :bordered="false" class="lesson-collapse">
      <a-collapse-panel
        v-for="row in lessonRows"
        :key="String(row.lessonNo)"
        :header="panelHeader(row)"
      >
        <div class="table-section">
          <div class="table-section-title">写字表</div>
          <EditableCharTable
            v-if="filterCharsByLesson(workspace.writingChars, row.lessonNo).length > 0"
            :data="filterCharsByLesson(workspace.writingChars, row.lessonNo)"
            expanded
            hide-lesson-no
            @update="(items) => onWritingUpdate(row.lessonNo, items)"
          />
          <div v-else class="empty-table-hint">本课暂无写字表生字</div>
        </div>

        <div class="table-section">
          <div class="table-section-title">识字表</div>
          <EditableCharTable
            v-if="filterCharsByLesson(workspace.readingChars, row.lessonNo).length > 0"
            :data="filterCharsByLesson(workspace.readingChars, row.lessonNo)"
            expanded
            hide-lesson-no
            @update="(items) => onReadingUpdate(row.lessonNo, items)"
          />
          <div v-else class="empty-table-hint">本课暂无识字表生字</div>
        </div>

        <div class="table-section">
          <div class="table-section-title">词语表</div>
          <EditableVocabTable
            v-if="filterWordsByLesson(workspace.vocabulary, row.lessonNo).length > 0"
            :data="filterWordsByLesson(workspace.vocabulary, row.lessonNo)"
            expanded
            hide-lesson-no
            @update="(items) => onVocabUpdate(row.lessonNo, items)"
          />
          <div v-else class="empty-table-hint">本课暂无词语</div>
        </div>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<style scoped>
.expanded-lesson-results {
  margin-top: 8px;
}

.lesson-collapse :deep(.ant-collapse-item) {
  margin-bottom: 8px;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  overflow: hidden;
  background: #fafafa;
}

.lesson-collapse :deep(.ant-collapse-header) {
  font-weight: 600;
}

.table-section {
  margin-bottom: 16px;
}

.table-section:last-child {
  margin-bottom: 0;
}

.table-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #555;
  margin-bottom: 8px;
  padding-left: 8px;
  border-left: 3px solid #1677ff;
}

.empty-table-hint {
  font-size: 13px;
  color: #999;
  padding: 8px 0;
}
</style>
