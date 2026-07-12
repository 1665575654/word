<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import type { CharacterItem, WordItem } from '@/types'

const props = defineProps<
  | { kind: 'writing' | 'reading'; data: CharacterItem[] }
  | { kind: 'vocabulary'; data: WordItem[] }
>()

const emit = defineEmits<{
  update: [data: CharacterItem[] | WordItem[]]
}>()

type CharRow = CharacterItem
type WordRow = WordItem

const rows = ref<Array<CharRow | WordRow>>([])

const fieldMeta = computed(() => {
  switch (props.kind) {
    case 'writing':
      return { label: '生字', addLabel: '添加生字', maxlength: 1 }
    case 'reading':
      return { label: '识字', addLabel: '添加识字', maxlength: 1 }
    case 'vocabulary':
      return { label: '词语', addLabel: '添加词语', maxlength: undefined }
  }
})

watch(
  () => [props.data, props.kind] as const,
  ([val]) => {
    rows.value = val.map((item) => ({ ...item }))
  },
  { immediate: true, deep: true }
)

function isCharKind(): boolean {
  return props.kind === 'writing' || props.kind === 'reading'
}

function emitUpdate() {
  if (isCharKind()) {
    emit(
      'update',
      (rows.value as CharRow[])
        .map((row) => ({ ...row, char: row.char.trim() }))
        .filter((row) => row.char.length === 1)
    )
    return
  }
  emit(
    'update',
    (rows.value as WordRow[])
      .map((row) => ({ ...row, word: row.word.trim() }))
      .filter((row) => row.word.length > 0)
  )
}

function createEmptyRow(): CharRow | WordRow {
  if (isCharKind()) {
    return { char: '', lessonNo: '1' }
  }
  return { word: '', lessonNo: '1' }
}

function addRow() {
  rows.value.push(createEmptyRow())
}

function insertRowBelow(index: number) {
  rows.value.splice(index + 1, 0, createEmptyRow())
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
  emitUpdate()
}

function onFieldChange() {
  emitUpdate()
}

function rowKey(_record: CharRow | WordRow, index?: number) {
  return index ?? 0
}

function getContent(record: CharRow | WordRow): string {
  if (isCharKind()) {
    return (record as CharRow).char
  }
  return (record as WordRow).word
}

function setContent(record: CharRow | WordRow, value: string) {
  if (isCharKind()) {
    ;(record as CharRow).char = value
  } else {
    ;(record as WordRow).word = value
  }
}
</script>

<template>
  <div>
    <a-table
      :data-source="rows"
      :columns="[
        { title: '序号', dataIndex: 'index', width: 80 },
        { title: fieldMeta.label, dataIndex: 'content' },
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
        <template v-else-if="column.dataIndex === 'content'">
          <a-input
            :value="getContent(record)"
            :maxlength="fieldMeta.maxlength"
            @change="(e: Event) => { setContent(record, (e.target as HTMLInputElement).value); onFieldChange() }"
          />
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
      <PlusOutlined /> {{ fieldMeta.addLabel }}
    </a-button>
  </div>
</template>
