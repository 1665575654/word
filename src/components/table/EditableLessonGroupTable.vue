<script setup lang="ts">
import { ref, watch } from 'vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import type {
  GroupedCharEntry,
  GroupedWordEntry,
  LessonReadingGroup,
  LessonVocabularyGroup,
  LessonWritingGroup,
} from '@/services/dataMerger'
import { formatIntegerLessonNo, formatLessonOrdinalLabel } from '@/services/lessonNoUtils'

const props = defineProps<
  (
    | { kind: 'writing'; groups: LessonWritingGroup[] }
    | { kind: 'reading'; groups: LessonReadingGroup[] }
    | { kind: 'vocabulary'; groups: LessonVocabularyGroup[] }
  ) & { catalogLessons?: never }
>()

const emit = defineEmits<{
  update: [groups: LessonWritingGroup[] | LessonReadingGroup[] | LessonVocabularyGroup[]]
}>()

const rows = ref<Array<LessonWritingGroup | LessonReadingGroup | LessonVocabularyGroup>>([])
const activeKeys = ref<(string | number)[]>([])

watch(
  () => [props.groups, props.kind] as const,
  ([val]) => {
    const sorted = [...val].sort((a, b) => a.index - b.index)
    rows.value = sorted.map((group, i) => {
      const index = i + 1
      if (props.kind === 'writing') {
        const g = group as LessonWritingGroup
        return {
          index,
          lessonNo: g.lessonNo,
          title: g.title,
          writingChars: [...g.writingChars],
        }
      }
      if (props.kind === 'reading') {
        const g = group as LessonReadingGroup
        return {
          index,
          lessonNo: g.lessonNo,
          title: g.title,
          readingChars: [...g.readingChars],
        }
      }
      const g = group as LessonVocabularyGroup
      return {
        index,
        lessonNo: g.lessonNo,
        title: g.title,
        vocabulary: [...g.vocabulary],
      }
    })
    if (activeKeys.value.length === 0 && sorted.length > 0) {
      activeKeys.value = sorted.slice(0, 3).map((g) => String(g.lessonNo))
    }
  },
  { immediate: true, deep: true }
)

function getItems(row: LessonWritingGroup | LessonReadingGroup | LessonVocabularyGroup): GroupedCharEntry[] | GroupedWordEntry[] {
  if (props.kind === 'writing') return (row as LessonWritingGroup).writingChars
  if (props.kind === 'reading') return (row as LessonReadingGroup).readingChars
  return (row as LessonVocabularyGroup).vocabulary
}

function getItemText(item: GroupedCharEntry | GroupedWordEntry): string {
  if ('char' in item) return item.char
  return item.word
}

function setItemText(item: GroupedCharEntry | GroupedWordEntry, value: string) {
  if ('char' in item) item.char = value
  else item.word = value
}

function createEmptyGroup(index: number, lessonNo: string): LessonWritingGroup | LessonReadingGroup | LessonVocabularyGroup {
  if (props.kind === 'writing') {
    return { index, lessonNo, title: '', writingChars: [] }
  }
  if (props.kind === 'reading') {
    return { index, lessonNo, title: '', readingChars: [] }
  }
  return { index, lessonNo, title: '', vocabulary: [] }
}

/** 索引 = 当前列表位置（1 起），随增删重排 */
function reindexRows() {
  rows.value.forEach((r, i) => {
    r.index = i + 1
  })
}

function emitUpdate() {
  reindexRows()
  if (props.kind === 'writing') {
    emit(
      'update',
      rows.value.map((row) => ({
        index: row.index,
        lessonNo: row.lessonNo,
        title: row.title,
        writingChars: (row as LessonWritingGroup).writingChars,
      })) as LessonWritingGroup[]
    )
    return
  }
  if (props.kind === 'reading') {
    emit(
      'update',
      rows.value.map((row) => ({
        index: row.index,
        lessonNo: row.lessonNo,
        title: row.title,
        readingChars: (row as LessonReadingGroup).readingChars,
      })) as LessonReadingGroup[]
    )
    return
  }
  emit(
    'update',
    rows.value.map((row) => ({
      index: row.index,
      lessonNo: row.lessonNo,
      title: row.title,
      vocabulary: (row as LessonVocabularyGroup).vocabulary,
    })) as LessonVocabularyGroup[]
  )
}

function onItemChange(
  row: LessonWritingGroup | LessonReadingGroup | LessonVocabularyGroup,
  itemIndex: number,
  value: string
) {
  const items = getItems(row)
  setItemText(items[itemIndex], value)
  emitUpdate()
}

function addItem(row: LessonWritingGroup | LessonReadingGroup | LessonVocabularyGroup) {
  if (props.kind === 'vocabulary') {
    ;(row as LessonVocabularyGroup).vocabulary.push({ word: '' })
  } else if (props.kind === 'writing') {
    ;(row as LessonWritingGroup).writingChars.push({ char: '' })
  } else {
    ;(row as LessonReadingGroup).readingChars.push({ char: '' })
  }
}

function removeItem(
  row: LessonWritingGroup | LessonReadingGroup | LessonVocabularyGroup,
  itemIndex: number
) {
  getItems(row).splice(itemIndex, 1)
  emitUpdate()
}

function addLesson() {
  const index = rows.value.length + 1
  const lessonNo = formatIntegerLessonNo(index)
  rows.value.push(createEmptyGroup(index, lessonNo))
  activeKeys.value = [...activeKeys.value, String(lessonNo)]
  emitUpdate()
}

function removeLesson(index: number) {
  const lessonNo = rows.value[index]?.lessonNo
  rows.value.splice(index, 1)
  if (lessonNo !== undefined) {
    activeKeys.value = activeKeys.value.filter((k) => k !== String(lessonNo))
  }
  emitUpdate()
}

function panelHeader(row: { index: number; lessonNo: string; title?: string }) {
  const title = row.title?.trim() || ''
  const label = formatLessonOrdinalLabel(row.lessonNo)
  return title ? `${label} · ${title}` : label
}
</script>

<template>
  <div class="lesson-group-table">
    <a-empty v-if="rows.length === 0" description="暂无数据，请上传表图片或手动添加课次" />

    <a-collapse v-else v-model:activeKey="activeKeys" :bordered="false" class="lesson-collapse">
      <a-collapse-panel
        v-for="(row, index) in rows"
        :key="String(row.lessonNo)"
        :header="panelHeader(row)"
      >
        <template #extra>
          <a-space :size="0" @click.stop>
            <a-button
              type="text"
              danger
              size="small"
              title="删除课次"
              @click.stop="removeLesson(index)"
            >
              <DeleteOutlined />
            </a-button>
          </a-space>
        </template>

        <div class="meta-row">
          <span class="meta-label">索引</span>
          <span class="meta-readonly">{{ row.index }}</span>
          <span class="meta-label">课次</span>
          <span class="meta-readonly">{{ row.lessonNo }}</span>
        </div>

        <div v-if="getItems(row).length === 0" class="empty-lesson-hint">
          本课暂无{{ kind === 'vocabulary' ? '词语' : '生字' }}
        </div>

        <div v-else class="items-grid">
          <div
            v-for="(item, itemIndex) in getItems(row)"
            :key="itemIndex"
            class="item-cell"
          >
            <a-input
              :value="getItemText(item)"
              :maxlength="kind === 'vocabulary' ? undefined : 1"
              :class="{ 'char-input': kind !== 'vocabulary', 'word-input': kind === 'vocabulary' }"
              @change="(e: Event) => onItemChange(row, itemIndex, (e.target as HTMLInputElement).value)"
            />
            <a-button
              type="text"
              danger
              size="small"
              class="item-delete"
              @click="removeItem(row, itemIndex)"
            >
              <DeleteOutlined />
            </a-button>
          </div>
        </div>

        <a-button type="dashed" size="small" class="add-item-btn" @click="addItem(row)">
          <PlusOutlined /> 添加
        </a-button>
      </a-collapse-panel>
    </a-collapse>

    <a-button type="dashed" block style="margin-top: 12px" @click="addLesson">
      <PlusOutlined /> 添加课次
    </a-button>
  </div>
</template>

<style scoped>
.lesson-group-table {
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
  margin-bottom: 8px;
}

.items-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.item-cell {
  display: flex;
  align-items: center;
  gap: 2px;
}

.char-input {
  width: 48px;
  text-align: center;
}

.word-input {
  width: 120px;
}

.item-delete {
  padding: 0 4px;
}

.add-item-btn {
  margin-top: 10px;
}
</style>
