<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import type { LessonMergeRow } from '@/services/dataMerger'
import {
  formatIntegerLessonNo,
  formatLessonOrdinalLabel,
  isValidLessonNo,
  parsePrintedLessonNo,
} from '@/services/lessonNoUtils'

const props = defineProps<{
  data: LessonMergeRow[]
}>()

const emit = defineEmits<{
  update: [data: LessonMergeRow[]]
}>()

const rows = ref<LessonMergeRow[]>([])
const activeKeys = ref<(string | number)[]>([])

watch(
  () => props.data,
  (val) => {
    rows.value = val.map((r, i) => ({ ...r, index: i + 1 }))
    if (activeKeys.value.length === 0 && val.length > 0) {
      activeKeys.value = val.slice(0, 3).map((r) => String(r.lessonNo))
    }
  },
  { immediate: true, deep: true }
)

const totalCounts = computed(() => ({
  writing: rows.value.reduce(
    (n, r) => n + r.writingChars.split(/[、,，\s]+/).filter((s) => s.trim().length === 1).length,
    0
  ),
  reading: rows.value.reduce(
    (n, r) => n + r.readingChars.split(/[、,，\s]+/).filter((s) => s.trim().length === 1).length,
    0
  ),
  vocabulary: rows.value.reduce(
    (n, r) => n + r.vocabulary.split(/[、,，]+/).map((s) => s.trim()).filter(Boolean).length,
    0
  ),
}))

/** 索引 = 当前列表位置（1 起），随增删重排 */
function reindexRows() {
  rows.value.forEach((r, i) => {
    r.index = i + 1
  })
}

function emitUpdate() {
  reindexRows()
  emit(
    'update',
    rows.value
      .filter((r) => isValidLessonNo(r.lessonNo))
      .map((r, i) => ({ ...r, index: i + 1 }))
  )
}

function addLesson() {
  const maxNo = rows.value.reduce((m, r) => Math.max(m, parsePrintedLessonNo(r.lessonNo)), 0)
  const lessonNo = formatIntegerLessonNo(maxNo + 1)
  const index = rows.value.length + 1
  rows.value.push({
    index,
    lessonNo,
    title: '',
    writingChars: '',
    readingChars: '',
    vocabulary: '',
  })
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

function onFieldChange() {
  emitUpdate()
}

function splitChars(text: string): string[] {
  return text.split(/[、,，\s]+/).map((s) => s.trim()).filter((s) => s.length === 1)
}

function splitWords(text: string): string[] {
  return text.split(/[、,，]+/).map((s) => s.trim()).filter(Boolean)
}

function panelHeader(row: LessonMergeRow) {
  const title = row.title.trim()
  const label = formatLessonOrdinalLabel(row.lessonNo)
  return title ? `${label} · ${title}` : label
}
</script>

<template>
  <div class="lesson-grouped-tables">
    <div class="summary-bar">
      <a-tag color="blue">写字表 {{ totalCounts.writing }} 字</a-tag>
      <a-tag color="green">识字表 {{ totalCounts.reading }} 字</a-tag>
      <a-tag color="orange">词语表 {{ totalCounts.vocabulary }} 词</a-tag>
      <a-typography-text type="secondary">共 {{ rows.length }} 课</a-typography-text>
    </div>

    <a-empty v-if="rows.length === 0" description="暂无数据，请上传表图片或手动添加课次" />

    <a-collapse v-else v-model:activeKey="activeKeys" :bordered="false" class="lesson-collapse">
      <a-collapse-panel
        v-for="(row, index) in rows"
        :key="String(row.lessonNo)"
        :header="panelHeader(row)"
      >
        <template #extra>
          <a-button type="text" danger size="small" @click.stop="removeLesson(index)">
            <DeleteOutlined />
          </a-button>
        </template>

        <div class="lesson-fields">
          <div class="field-row">
            <span class="field-label writing">写字表</span>
            <a-input
              v-model:value="row.writingChars"
              placeholder="用顿号分隔单个汉字"
              @change="onFieldChange"
            />
            <div v-if="splitChars(row.writingChars).length" class="char-tags">
              <a-tag v-for="c in splitChars(row.writingChars)" :key="`w-${c}`" color="blue">{{ c }}</a-tag>
            </div>
          </div>

          <div class="field-row">
            <span class="field-label reading">识字表</span>
            <a-input
              v-model:value="row.readingChars"
              placeholder="用顿号分隔单个汉字"
              @change="onFieldChange"
            />
            <div v-if="splitChars(row.readingChars).length" class="char-tags">
              <a-tag v-for="c in splitChars(row.readingChars)" :key="`r-${c}`" color="green">{{ c }}</a-tag>
            </div>
          </div>

          <div class="field-row">
            <span class="field-label vocabulary">词语表</span>
            <a-input
              v-model:value="row.vocabulary"
              placeholder="用顿号分隔词语"
              @change="onFieldChange"
            />
            <div v-if="splitWords(row.vocabulary).length" class="char-tags">
              <a-tag v-for="w in splitWords(row.vocabulary)" :key="`v-${w}`" color="orange">{{ w }}</a-tag>
            </div>
          </div>

          <div class="meta-row">
            <span class="meta-label">索引</span>
            <span class="meta-readonly">{{ row.index }}</span>
            <span class="meta-label">课次</span>
            <a-input v-model:value="row.lessonNo" placeholder="如 阅读-1" style="width: 110px" @change="onFieldChange" />
            <span class="meta-label">课文标题</span>
            <a-input
              v-model:value="row.title"
              placeholder="可选，与目录对应"
              style="flex: 1"
              @change="onFieldChange"
            />
          </div>
        </div>
      </a-collapse-panel>
    </a-collapse>

    <a-button type="dashed" block style="margin-top: 12px" @click="addLesson">
      <PlusOutlined /> 添加课次
    </a-button>
  </div>
</template>

<style scoped>
.lesson-grouped-tables {
  margin-top: 8px;
}

.summary-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
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

.lesson-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  width: 56px;
}

.field-label.writing {
  color: #1677ff;
}

.field-label.reading {
  color: #52c41a;
}

.field-label.vocabulary {
  color: #fa8c16;
}

.char-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px dashed #e8e8e8;
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
</style>
