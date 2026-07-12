<script setup lang="ts">
import { ref, watch } from 'vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import type { LessonMeta } from '@/types'

const props = defineProps<{
  data: LessonMeta[]
}>()

const emit = defineEmits<{
  update: [data: LessonMeta[]]
}>()

const rows = ref<LessonMeta[]>([])

watch(
  () => props.data,
  (val) => {
    rows.value = val.map((l, i) => ({
      ...l,
      index: i + 1,
    }))
  },
  { immediate: true, deep: true }
)

/** 索引 = 当前列表位置（1 起），随增删重排 */
function reindexRows() {
  rows.value.forEach((r, i) => {
    r.index = i + 1
  })
}

function rowsToPayload() {
  return rows.value
    .filter((r) => r.title.trim())
    .map((r, i) => ({
      ...r,
      index: i + 1,
    }))
}

function emitUpdate() {
  reindexRows()
  emit('update', rowsToPayload())
}

function createEmptyRow(): LessonMeta {
  return { index: rows.value.length + 1, lessonNo: '', title: '' }
}

function addRow() {
  rows.value.push(createEmptyRow())
  reindexRows()
}

function insertRowBelow(index: number) {
  rows.value.splice(index + 1, 0, createEmptyRow())
  reindexRows()
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
  emitUpdate()
}

function onFieldChange() {
  emitUpdate()
}

function rowKey(_record: LessonMeta, index?: number) {
  return index ?? 0
}
</script>

<template>
  <div>
    <a-table
      :data-source="rows"
      :columns="[
        { title: '索引', dataIndex: 'index', width: 72 },
        { title: '课次', dataIndex: 'lessonNo', width: 130 },
        { title: '标题', dataIndex: 'title' },
        { title: '操作', key: 'action', width: 100 },
      ]"
      :pagination="false"
      size="small"
      :row-key="rowKey"
    >
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.dataIndex === 'index'">
          <span>{{ index + 1 }}</span>
        </template>
        <template v-else-if="column.dataIndex === 'lessonNo'">
          <a-input v-model:value="record.lessonNo" placeholder="如 阅读-1 或 语文园地-1" @change="onFieldChange" />
        </template>
        <template v-else-if="column.dataIndex === 'title'">
          <a-input v-model:value="record.title" @change="onFieldChange" />
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="0">
            <a-button
              type="text"
              size="small"
              title="在下方插入"
              @click="insertRowBelow(index)"
            >
              <PlusOutlined />
            </a-button>
            <a-button type="text" danger size="small" title="删除" @click="removeRow(index)">
              <DeleteOutlined />
            </a-button>
          </a-space>
        </template>
      </template>
    </a-table>
    <a-button type="dashed" block style="margin-top: 8px" @click="addRow">
      <PlusOutlined /> 添加课次
    </a-button>
  </div>
</template>
