<script setup lang="ts">
import { ref, computed } from 'vue'
import { message } from 'ant-design-vue'
import { ThunderboltOutlined } from '@ant-design/icons-vue'
import ExpandedLessonGroupPanel from '@/components/table/ExpandedLessonGroupPanel.vue'
import { expandCharacters, expandVocabulary, EXPAND_BATCH_SIZE, mergeCharPartial, mergeVocabPartial } from '@/services/aiExpander'
import { isLessonSlotChar, isLessonSlotWord } from '@/services/dataMerger'
import { formatLessonOrdinalLabel, normalizeLessonNo } from '@/services/lessonNoUtils'
import { useSettingsStore } from '@/stores/settings'
import { useWorkspaceStore } from '@/stores/workspace'
import { getGradeLabel } from '@/utils/exportName'
import {
  DEFAULT_CHAR_EXPAND_CONFIG,
  DEFAULT_VOCAB_EXPAND_CONFIG,
  type CharacterItem,
  type WordItem,
  type CharExpandConfig,
  type VocabExpandConfig,
  type LessonMeta,
} from '@/types'

type TableType = 'writing' | 'reading' | 'vocabulary'

const props = defineProps<{
  tableType: TableType
  grade: string
  catalog: LessonMeta[]
  writingChars?: CharacterItem[]
  readingChars?: CharacterItem[]
  vocabulary?: WordItem[]
}>()

const emit = defineEmits<{
  updateWriting: [data: CharacterItem[]]
  updateReading: [data: CharacterItem[]]
  updateVocabulary: [data: WordItem[]]
  expandConfigChange: [config: CharExpandConfig | VocabExpandConfig]
}>()

const settingsStore = useSettingsStore()
const workspaceStore = useWorkspaceStore()
const expanding = ref(false)
const progress = ref(0)
const progressDetail = ref('')
const modalOpen = ref(false)
const selectedLessonNos = ref<string[]>([])
/** 确认拓展时锁定的课次，避免弹框关闭后选中状态被改动 */
const pendingExpandLessonNos = ref<string[]>([])

interface LessonExpandOption {
  lessonNo: string
  title: string
  total: number
  unexpanded: number
}

const charConfig = ref<CharExpandConfig>({ ...DEFAULT_CHAR_EXPAND_CONFIG })
const vocabConfig = ref<VocabExpandConfig>({ ...DEFAULT_VOCAB_EXPAND_CONFIG })

const charFieldOptions = [
  { label: '读音', value: 'pinyin' },
  { label: '音序', value: 'phoneticOrder' },
  { label: '部首', value: 'radical' },
  { label: '结构', value: 'structure' },
  { label: '组词', value: 'words' },
  { label: '造句', value: 'sentences' },
]

const tableLabel = computed(() => {
  switch (props.tableType) {
    case 'writing':
      return '写字表'
    case 'reading':
      return '识字表'
    case 'vocabulary':
      return '词语表'
  }
})

const isCharTable = computed(
  () => props.tableType === 'writing' || props.tableType === 'reading'
)

const currentChars = computed(() => {
  if (props.tableType === 'writing') {
    return props.writingChars?.filter((c) => !isLessonSlotChar(c.char)) ?? []
  }
  if (props.tableType === 'reading') {
    return props.readingChars?.filter((c) => !isLessonSlotChar(c.char)) ?? []
  }
  return []
})

const currentVocab = computed(
  () => props.vocabulary?.filter((w) => !isLessonSlotWord(w.word)) ?? []
)

const displayCount = computed(() =>
  isCharTable.value ? currentChars.value.length : currentVocab.value.length
)

const unexpandedCount = computed(() => {
  if (isCharTable.value) {
    return currentChars.value.filter((c) => !c.expanded).length
  }
  return currentVocab.value.filter((w) => !w.expanded).length
})

function countLessonItems(lessonNo: string): { total: number; unexpanded: number } {
  const no = normalizeLessonNo(lessonNo)
  if (isCharTable.value) {
    const items = currentChars.value.filter((c) => normalizeLessonNo(c.lessonNo) === no)
    return {
      total: items.length,
      unexpanded: items.filter((c) => !c.expanded).length,
    }
  }
  const items = currentVocab.value.filter((w) => normalizeLessonNo(w.lessonNo) === no)
  return {
    total: items.length,
    unexpanded: items.filter((w) => !w.expanded).length,
  }
}

const lessonOptions = computed<LessonExpandOption[]>(() => {
  const seen = new Set<string>()
  const options: LessonExpandOption[] = []

  for (const lesson of props.catalog) {
    const lessonNo = normalizeLessonNo(lesson.lessonNo)
    if (!lessonNo || seen.has(lessonNo)) continue
    const counts = countLessonItems(lessonNo)
    if (counts.total === 0) continue
    seen.add(lessonNo)
    options.push({ lessonNo, title: lesson.title?.trim() ?? '', ...counts })
  }

  const dataLessonNos = isCharTable.value
    ? currentChars.value.map((c) => normalizeLessonNo(c.lessonNo))
    : currentVocab.value.map((w) => normalizeLessonNo(w.lessonNo))

  for (const lessonNo of dataLessonNos) {
    if (!lessonNo || seen.has(lessonNo)) continue
    const counts = countLessonItems(lessonNo)
    if (counts.total === 0) continue
    seen.add(lessonNo)
    options.push({ lessonNo, title: '', ...counts })
  }

  return options
})

const selectedLessonUnexpandedCount = computed(() =>
  lessonOptions.value
    .filter((opt) => selectedLessonNos.value.includes(opt.lessonNo))
    .reduce((sum, opt) => sum + opt.unexpanded, 0)
)

function lessonOptionLabel(opt: LessonExpandOption): string {
  const label = formatLessonOrdinalLabel(opt.lessonNo)
  return opt.title ? `${label} · ${opt.title}` : label
}

function selectAllLessons() {
  selectedLessonNos.value = lessonOptions.value.map((opt) => opt.lessonNo)
}

function clearLessonSelection() {
  selectedLessonNos.value = []
}

function isInLessonSet(lessonNo: string, set: Set<string>): boolean {
  return set.has(normalizeLessonNo(lessonNo))
}

function openExpandModal() {
  if (displayCount.value === 0) {
    message.warning('当前表暂无数据，请先上传识别')
    return
  }
  if (isCharTable.value) {
    charConfig.value = {
      enabled: true,
      charFields: [...DEFAULT_CHAR_EXPAND_CONFIG.charFields],
      wordCount: DEFAULT_CHAR_EXPAND_CONFIG.wordCount,
      sentenceCount: DEFAULT_CHAR_EXPAND_CONFIG.sentenceCount,
    }
  } else {
    vocabConfig.value = { ...DEFAULT_VOCAB_EXPAND_CONFIG }
  }
  selectedLessonNos.value = lessonOptions.value.map((opt) => opt.lessonNo)
  modalOpen.value = true
}

function handleConfirmExpand() {
  if (!settingsStore.hasExpandApiKey()) {
    message.warning('请先在设置页配置文本拓展 API Key')
    return
  }

  if (selectedLessonNos.value.length === 0) {
    message.warning('请至少选择一节课')
    return
  }

  if (selectedLessonUnexpandedCount.value === 0) {
    message.info('所选课次均已拓展，无需重复执行')
    return
  }

  if (isCharTable.value && charConfig.value.charFields.length === 0) {
    message.warning('请至少选择一个拓展字段')
    return
  }

  pendingExpandLessonNos.value = [...selectedLessonNos.value]
  modalOpen.value = false
  void runExpand()
}

function mergeFieldChars(field: 'writingChars' | 'readingChars', partial: CharacterItem[]) {
  const ws = workspaceStore.current
  if (!ws) return
  const merged = mergeCharPartial(ws[field], partial)
  return workspaceStore.update({
    [field]: merged,
    ...(ws.stage !== 'expanded' ? { stage: 'expanded' as const } : {}),
  })
}

function mergeFieldVocab(partial: WordItem[]) {
  const ws = workspaceStore.current
  if (!ws) return
  const merged = mergeVocabPartial(ws.vocabulary, partial)
  return workspaceStore.update({
    vocabulary: merged,
    ...(ws.stage !== 'expanded' ? { stage: 'expanded' as const } : {}),
  })
}

async function runExpand() {
  expanding.value = true
  progress.value = 0
  progressDetail.value = ''
  const grade = getGradeLabel(props.grade) || '小学'
  const lessonSet = new Set(pendingExpandLessonNos.value.map(normalizeLessonNo))
  const initialExpandedCount = isCharTable.value
    ? currentChars.value.filter((c) => c.expanded).length
    : currentVocab.value.filter((w) => w.expanded).length

  try {
    if (isCharTable.value) {
      const allChars = currentChars.value
      const unexpanded = allChars.filter(
        (c) => !c.expanded && isInLessonSet(c.lessonNo, lessonSet)
      )
      const totalBatches = Math.ceil(unexpanded.length / EXPAND_BATCH_SIZE)

      await expandCharacters(unexpanded, charConfig.value, grade, {
        onProgress: (done, total) => {
          progress.value = Math.round((done / total) * 100)
          const batchNo = Math.ceil(done / EXPAND_BATCH_SIZE) || 1
          progressDetail.value = `第 ${batchNo}/${totalBatches} 批，已完成 ${done}/${total} 条`
        },
        onBatchComplete: async (partial) => {
          const field = props.tableType === 'writing' ? 'writingChars' : 'readingChars'
          await mergeFieldChars(field, partial)
        },
      })

      emit('expandConfigChange', charConfig.value)
    } else {
      const allWords = currentVocab.value
      const unexpanded = allWords.filter(
        (w) => !w.expanded && isInLessonSet(w.lessonNo, lessonSet)
      )
      const totalBatches = Math.ceil(unexpanded.length / EXPAND_BATCH_SIZE)

      await expandVocabulary(unexpanded, vocabConfig.value, grade, {
        onProgress: (done, total) => {
          progress.value = Math.round((done / total) * 100)
          const batchNo = Math.ceil(done / EXPAND_BATCH_SIZE) || 1
          progressDetail.value = `第 ${batchNo}/${totalBatches} 批，已完成 ${done}/${total} 条`
        },
        onBatchComplete: async (partial) => {
          await mergeFieldVocab(partial)
        },
      })

      emit('expandConfigChange', vocabConfig.value)
    }

    progress.value = 100
    progressDetail.value = '拓展完成'
    message.success(`${tableLabel.value}拓展完成`)
  } catch (e) {
    const currentExpandedCount = isCharTable.value
      ? currentChars.value.filter((c) => c.expanded).length
      : currentVocab.value.filter((w) => w.expanded).length
    const newlyExpanded = currentExpandedCount - initialExpandedCount
    const errMsg = e instanceof Error ? e.message : '拓展失败'
    if (newlyExpanded > 0) {
      message.warning(`已保存 ${newlyExpanded} 条拓展结果，后续批次失败：${errMsg}`)
    } else {
      message.error(errMsg)
    }
  } finally {
    expanding.value = false
    progressDetail.value = ''
  }
}

function onCharsUpdate(data: CharacterItem[]) {
  if (props.tableType === 'writing') {
    emit('updateWriting', data)
  } else {
    emit('updateReading', data)
  }
}

function onVocabUpdate(data: WordItem[]) {
  emit('updateVocabulary', data)
}
</script>

<template>
  <div class="import-expand-panel">
    <div class="expand-toolbar">
      <a-button type="primary" :loading="expanding" @click="openExpandModal">
        <ThunderboltOutlined /> 拓展
      </a-button>
      <span v-if="displayCount > 0" class="expand-hint">
        共 {{ displayCount }} 条，待拓展 {{ unexpandedCount }} 条
      </span>
    </div>

    <div v-if="expanding" class="expand-progress">
      <a-progress :percent="progress" />
      <p class="progress-text">
        正在拓展{{ tableLabel }}<template v-if="progressDetail"> — {{ progressDetail }}</template>
      </p>
    </div>

    <a-empty v-if="displayCount === 0" description="暂无数据，请先上传识别" />

    <ExpandedLessonGroupPanel
      v-else
      :table-type="tableType"
      :catalog="catalog"
      :writing-chars="writingChars"
      :reading-chars="readingChars"
      :vocabulary="vocabulary"
      @update-writing="onCharsUpdate"
      @update-reading="onCharsUpdate"
      @update-vocabulary="onVocabUpdate"
    />

    <a-modal
      v-model:open="modalOpen"
      :title="`${tableLabel} — 拓展配置`"
      ok-text="确认拓展"
      cancel-text="取消"
      :width="560"
      @ok="handleConfirmExpand"
    >
      <a-form layout="vertical">
        <a-form-item label="拓展课次">
          <div class="lesson-select-toolbar">
            <a-button type="link" size="small" @click="selectAllLessons">全选</a-button>
            <a-button type="link" size="small" @click="clearLessonSelection">取消全选</a-button>
            <span class="lesson-select-summary">
              已选 {{ selectedLessonNos.length }}/{{ lessonOptions.length }} 课，
              待拓展 {{ selectedLessonUnexpandedCount }} 条
            </span>
          </div>
          <a-checkbox-group v-model:value="selectedLessonNos" class="lesson-checkbox-group">
            <a-row :gutter="[8, 4]">
              <a-col v-for="opt in lessonOptions" :key="opt.lessonNo" :span="12">
                <a-checkbox :value="opt.lessonNo">
                  <span class="lesson-option-label">{{ lessonOptionLabel(opt) }}</span>
                  <span class="lesson-option-count">（{{ opt.unexpanded }}/{{ opt.total }}）</span>
                </a-checkbox>
              </a-col>
            </a-row>
          </a-checkbox-group>
        </a-form-item>

        <template v-if="isCharTable">
          <a-form-item label="拓展字段">
            <a-checkbox-group
              v-model:value="charConfig.charFields"
              :options="charFieldOptions"
            />
          </a-form-item>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="组词数量">
                <a-input-number
                  v-model:value="charConfig.wordCount"
                  :min="1"
                  :max="5"
                  style="width: 100%"
                />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="造句数量">
                <a-input-number
                  v-model:value="charConfig.sentenceCount"
                  :min="1"
                  :max="3"
                  style="width: 100%"
                />
              </a-form-item>
            </a-col>
          </a-row>
        </template>
        <template v-else>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="组词数量">
                <a-input-number
                  v-model:value="vocabConfig.vocabWordCount"
                  :min="1"
                  :max="5"
                  style="width: 100%"
                />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="造句数量">
                <a-input-number
                  v-model:value="vocabConfig.vocabSentenceCount"
                  :min="1"
                  :max="3"
                  style="width: 100%"
                />
              </a-form-item>
            </a-col>
          </a-row>
        </template>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.import-expand-panel {
  margin-top: 4px;
}

.expand-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.expand-hint {
  font-size: 13px;
  color: #666;
}

.expand-progress {
  margin-bottom: 12px;
}

.progress-text {
  color: #666;
  margin-top: 4px;
  font-size: 13px;
}

.lesson-select-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-bottom: 8px;
}

.lesson-select-summary {
  margin-left: auto;
  font-size: 12px;
  color: #888;
}

.lesson-checkbox-group {
  width: 100%;
  max-height: 220px;
  overflow-y: auto;
  padding: 8px 10px;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  background: #fafafa;
}

.lesson-option-label {
  font-size: 13px;
}

.lesson-option-count {
  font-size: 12px;
  color: #999;
}
</style>
