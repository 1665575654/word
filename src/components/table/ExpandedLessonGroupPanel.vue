<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CharacterItem, LessonMeta, WordItem } from '@/types'
import {
  groupsForExpandedWriting,
  groupsForExpandedReading,
  groupsForExpandedVocabulary,
  type LessonExpandedWritingGroup,
  type LessonExpandedReadingGroup,
  type LessonExpandedVocabularyGroup,
} from '@/services/dataMerger'
import { formatLessonOrdinalLabel, normalizeLessonNo } from '@/services/lessonNoUtils'
import EditableCharTable from '@/components/table/EditableCharTable.vue'
import EditableVocabTable from '@/components/table/EditableVocabTable.vue'

type TableType = 'writing' | 'reading' | 'vocabulary'

const props = defineProps<{
  tableType: TableType
  catalog: LessonMeta[]
  writingChars?: CharacterItem[]
  readingChars?: CharacterItem[]
  vocabulary?: WordItem[]
}>()

const emit = defineEmits<{
  updateWriting: [data: CharacterItem[]]
  updateReading: [data: CharacterItem[]]
  updateVocabulary: [data: WordItem[]]
}>()

const activeKeys = ref<(string | number)[]>([])

type LessonGroup =
  | LessonExpandedWritingGroup
  | LessonExpandedReadingGroup
  | LessonExpandedVocabularyGroup

const groups = computed<LessonGroup[]>(() => {
  const catalog = props.catalog
  switch (props.tableType) {
    case 'writing':
      return groupsForExpandedWriting(props.writingChars ?? [], catalog)
    case 'reading':
      return groupsForExpandedReading(props.readingChars ?? [], catalog)
    case 'vocabulary':
      return groupsForExpandedVocabulary(props.vocabulary ?? [], catalog)
  }
})

watch(
  groups,
  (rows) => {
    const validKeys = new Set(rows.map((r) => String(r.lessonNo)))
    activeKeys.value = activeKeys.value
      .map(String)
      .filter((k) => validKeys.has(k))
    if (activeKeys.value.length === 0 && rows.length > 0) {
      activeKeys.value = rows.slice(0, 3).map((r) => String(r.lessonNo))
    }
  },
  { immediate: true }
)

function isPanelActive(lessonNo: string): boolean {
  const key = String(lessonNo)
  return activeKeys.value.map(String).includes(key)
}

function panelHeader(row: { lessonNo: string; title?: string }) {
  const title = row.title?.trim() || ''
  const label = formatLessonOrdinalLabel(row.lessonNo)
  return title ? `${label} · ${title}` : label
}

function charsForLesson(lessonNo: string): CharacterItem[] {
  const no = normalizeLessonNo(lessonNo)
  const source =
    props.tableType === 'writing'
      ? props.writingChars ?? []
      : props.readingChars ?? []
  return source.filter((c) => normalizeLessonNo(c.lessonNo) === no)
}

function wordsForLesson(lessonNo: string): WordItem[] {
  const no = normalizeLessonNo(lessonNo)
  return (props.vocabulary ?? []).filter((w) => normalizeLessonNo(w.lessonNo) === no)
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

function replaceLessonWords(
  all: WordItem[],
  lessonNo: string,
  lessonItems: WordItem[]
): WordItem[] {
  const no = normalizeLessonNo(lessonNo)
  const others = all.filter((w) => normalizeLessonNo(w.lessonNo) !== no)
  return [...others, ...lessonItems.map((w) => ({ ...w, lessonNo: no }))]
}

function onCharsUpdate(lessonNo: string, items: CharacterItem[]) {
  if (props.tableType === 'writing') {
    emit('updateWriting', replaceLessonChars(props.writingChars ?? [], lessonNo, items))
  } else {
    emit('updateReading', replaceLessonChars(props.readingChars ?? [], lessonNo, items))
  }
}

function onVocabUpdate(lessonNo: string, items: WordItem[]) {
  emit('updateVocabulary', replaceLessonWords(props.vocabulary ?? [], lessonNo, items))
}

function itemCount(row: LessonGroup): number {
  if (props.tableType === 'writing') {
    return (row as LessonExpandedWritingGroup).writingChars.length
  }
  if (props.tableType === 'reading') {
    return (row as LessonExpandedReadingGroup).readingChars.length
  }
  return (row as LessonExpandedVocabularyGroup).vocabulary.length
}
</script>

<template>
  <div class="expanded-lesson-group-panel">
    <a-empty v-if="groups.length === 0" description="暂无数据，请先上传识别" />

    <a-collapse v-else v-model:activeKey="activeKeys" :bordered="false" :destroy-inactive-panel="true" class="lesson-collapse">
      <a-collapse-panel
        v-for="row in groups"
        :key="String(row.lessonNo)"
        :header="panelHeader(row)"
      >
        <template v-if="isPanelActive(row.lessonNo)">
          <div class="meta-row">
            <span class="meta-label">索引</span>
            <span class="meta-readonly">{{ row.index }}</span>
            <span class="meta-label">课次</span>
            <span class="meta-readonly">{{ row.lessonNo }}</span>
          </div>

          <div v-if="itemCount(row) === 0" class="empty-lesson-hint">
            本课暂无{{ tableType === 'vocabulary' ? '词语' : '生字' }}
          </div>

          <EditableCharTable
            v-else-if="tableType === 'writing' || tableType === 'reading'"
            :key="`char-${row.lessonNo}`"
            :data="charsForLesson(row.lessonNo)"
            expanded
            hide-lesson-no
            @update="(items) => onCharsUpdate(row.lessonNo, items)"
          />
          <EditableVocabTable
            v-else
            :key="`vocab-${row.lessonNo}`"
            :data="wordsForLesson(row.lessonNo)"
            expanded
            hide-lesson-no
            @update="(items) => onVocabUpdate(row.lessonNo, items)"
          />
        </template>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<style scoped>
.expanded-lesson-group-panel {
  margin-top: 4px;
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

.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #e8e8e8;
}

.meta-readonly {
  font-size: 13px;
  min-width: 32px;
  color: #666;
}

.meta-label {
  font-size: 12px;
  color: #999;
}

.empty-lesson-hint {
  font-size: 13px;
  color: #999;
}
</style>
