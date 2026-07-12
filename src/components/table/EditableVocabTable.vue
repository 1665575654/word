<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import type { WordItem } from '@/types'
import { isValidLessonNo } from '@/services/lessonNoUtils'

const props = defineProps<{
  data: WordItem[]
  expanded?: boolean
  hideLessonNo?: boolean
}>()

const emit = defineEmits<{
  update: [data: WordItem[]]
}>()

const rows = ref<WordItem[]>([])

watch(
  () => props.data,
  (val) => {
    rows.value = val.map((w) => ({ ...w }))
  },
  { immediate: true, deep: true }
)

function emitUpdate() {
  emit(
    'update',
    rows.value.filter((r) => r.word.trim().length > 0 && isValidLessonNo(r.lessonNo))
  )
}

function addRow() {
  const lessonNo = rows.value[0]?.lessonNo ?? '1'
  rows.value.push({ word: '', lessonNo })
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
  emitUpdate()
}

function onFieldChange() {
  emitUpdate()
}

function formatArray(val?: string[]) {
  return val?.join('、') ?? ''
}

function parseArray(text: string): string[] {
  return text.split(/[、,，]+/).map((s) => s.trim()).filter(Boolean)
}

const columns = computed(() => {
  if (props.expanded) {
    return [
      ...(props.hideLessonNo ? [] : [{ title: '课次', dataIndex: 'lessonNo', width: 70 }]),
      { title: '词语', dataIndex: 'word', width: 100 },
      { title: '组词', dataIndex: 'relatedWords', width: 140 },
      { title: '造句', dataIndex: 'sentences', width: 200 },
      { title: '操作', key: 'action', width: 60 },
    ]
  }
  return [
    { title: '课次', dataIndex: 'lessonNo', width: 100 },
    { title: '词语', dataIndex: 'word' },
    { title: '操作', key: 'action', width: 80 },
  ]
})
</script>

<template>
  <div>
    <a-table
      :data-source="rows"
      :columns="columns"
      :pagination="{ pageSize: 15 }"
      size="small"
      :row-key="(r: WordItem) => `${r.lessonNo}-${r.word}`"
    >
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.dataIndex === 'lessonNo'">
          <a-input-number
            v-model:value="record.lessonNo"
            :min="1"
            style="width: 70px"
            @change="onFieldChange"
          />
        </template>
        <template v-else-if="column.dataIndex === 'word'">
          <a-input v-model:value="record.word" @change="onFieldChange" />
        </template>
        <template v-else-if="column.dataIndex === 'relatedWords'">
          <a-input
            :value="formatArray(record.relatedWords)"
            @change="(e: Event) => { record.relatedWords = parseArray((e.target as HTMLInputElement).value); onFieldChange() }"
          />
        </template>
        <template v-else-if="column.dataIndex === 'sentences'">
          <a-input
            :value="formatArray(record.sentences)"
            @change="(e: Event) => { record.sentences = parseArray((e.target as HTMLInputElement).value); onFieldChange() }"
          />
        </template>
        <template v-else-if="column.key === 'action'">
          <a-button type="text" danger size="small" @click="removeRow(index)">
            <DeleteOutlined />
          </a-button>
        </template>
      </template>
    </a-table>
    <a-button type="dashed" block style="margin-top: 8px" @click="addRow">
      <PlusOutlined /> 添加词语
    </a-button>
  </div>
</template>
