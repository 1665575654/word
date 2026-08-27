<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {DeleteOutlined, PlusOutlined} from '@ant-design/icons-vue'
import type {CharacterItem} from '@/types'
import {isValidLessonNo, normalizeLessonNo} from '@/services/lessonNoUtils'
import {formatStringArray, normalizeStringArray, parseStringArray,} from '@/utils/stringArray'

const props = defineProps<{
  data: CharacterItem[]
  expanded?: boolean
  hideLessonNo?: boolean
}>()

const emit = defineEmits<{
  update: [data: CharacterItem[]]
}>()

const rows = ref<CharacterItem[]>([])

function normalizeChar(item: CharacterItem): CharacterItem {
  return {
    ...item,
    words: normalizeStringArray(item.words),
    sentences: normalizeStringArray(item.sentences),
    readings: item.readings?.map((r) => ({
      ...r,
      words: normalizeStringArray(r.words),
      sentences: normalizeStringArray(r.sentences),
    })),
  }
}

function dataFingerprint(data: CharacterItem[]): string {
  return data
    .map(
      (c) =>
        `${normalizeLessonNo(c.lessonNo)}-${c.char}-${c.expanded ? 1 : 0}-${c.pinyin ?? ''}-${c.radical ?? ''}-${c.structure ?? ''}-${normalizeStringArray(c.words).join('|')}-${normalizeStringArray(c.sentences).join('|')}`
    )
    .join('\n')
}

watch(
  () => dataFingerprint(props.data),
  () => {
    rows.value = props.data.map(normalizeChar)
  },
  { immediate: true }
)

function emitUpdate() {
  emit(
    'update',
    rows.value.filter((r) => r.char.trim().length === 1 && isValidLessonNo(r.lessonNo))
  )
}

function addRow() {
  const lessonNo = rows.value[0]?.lessonNo ?? '1'
  rows.value.push({ char: '', lessonNo })
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
  emitUpdate()
}

function onFieldChange() {
  emitUpdate()
}

function displayWords(record: CharacterItem): string {
  const top = normalizeStringArray(record.words)
  if (top.length > 0) return formatStringArray(top)
  return formatStringArray(record.readings?.[0]?.words)
}

function displaySentences(record: CharacterItem): string {
  const top = normalizeStringArray(record.sentences)
  if (top.length > 0) return formatStringArray(top)
  return formatStringArray(record.readings?.[0]?.sentences)
}

function displayPinyin(record: CharacterItem): string {
  return record.pinyin?.trim() || record.readings?.[0]?.pinyin?.trim() || ''
}

const columns = computed(() => {
  if (props.expanded) {
    return [
      ...(props.hideLessonNo ? [] : [{title: '课次', dataIndex: 'lessonNo', width: 70}]),
      {title: '生字', dataIndex: 'char', width: 60},
      {title: '读音', dataIndex: 'pinyin', width: 80},
      {title: '音序', dataIndex: 'phoneticOrder', width: 60},
      {title: '部首', dataIndex: 'radical', width: 60},
      {title: '结构', dataIndex: 'structure', width: 70},
      {title: '组词', dataIndex: 'words', width: 120},
      {title: '造句', dataIndex: 'sentences', width: 160},
      {title: '操作', key: 'action', width: 60},
    ]
  }
  return [
    { title: '课次', dataIndex: 'lessonNo', width: 100 },
    { title: '生字', dataIndex: 'char', width: 100 },
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
      :row-key="(r: CharacterItem) => `${r.lessonNo}-${r.char}`"
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
        <template v-else-if="column.dataIndex === 'char'">
          <a-input v-model:value="record.char" :maxlength="1" style="width: 60px" @change="onFieldChange" />
        </template>
        <template v-else-if="column.dataIndex === 'pinyin'">
          <a-input
            :value="displayPinyin(record)"
            @change="(e: Event) => { record.pinyin = (e.target as HTMLInputElement).value; onFieldChange() }"
          />
        </template>
        <template v-else-if="column.dataIndex === 'phoneticOrder'">
          <a-input v-model:value="record.phoneticOrder" @change="onFieldChange" />
        </template>
        <template v-else-if="column.dataIndex === 'radical'">
          <a-input v-model:value="record.radical" @change="onFieldChange" />
        </template>
        <template v-else-if="column.dataIndex === 'structure'">
          <a-input v-model:value="record.structure" @change="onFieldChange" />
        </template>
        <template v-else-if="column.dataIndex === 'words'">
          <a-input
            :value="displayWords(record)"
            @change="(e: Event) => { record.words = parseStringArray((e.target as HTMLInputElement).value); onFieldChange() }"
          />
        </template>
        <template v-else-if="column.dataIndex === 'sentences'">
          <a-input
            :value="displaySentences(record)"
            @change="(e: Event) => { record.sentences = parseStringArray((e.target as HTMLInputElement).value); onFieldChange() }"
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
      <PlusOutlined /> 添加生字
    </a-button>
  </div>
</template>
