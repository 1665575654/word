<script setup lang="ts">
import { ref, computed } from 'vue'
import { message } from 'ant-design-vue'
import { ThunderboltOutlined } from '@ant-design/icons-vue'
import ExpandedLessonGroupPanel from '@/components/table/ExpandedLessonGroupPanel.vue'
import { expandCharacters, expandVocabulary } from '@/services/aiExpander'
import { isLessonSlotChar, isLessonSlotWord } from '@/services/dataMerger'
import { useSettingsStore } from '@/stores/settings'
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
const expanding = ref(false)
const progress = ref(0)
const modalOpen = ref(false)

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
  modalOpen.value = true
}

function handleConfirmExpand() {
  if (!settingsStore.hasExpandApiKey()) {
    message.warning('请先在设置页配置文本拓展 API Key')
    return
  }

  if (unexpandedCount.value === 0) {
    message.info('当前表均已拓展，无需重复执行')
    modalOpen.value = false
    return
  }

  if (isCharTable.value && charConfig.value.charFields.length === 0) {
    message.warning('请至少选择一个拓展字段')
    return
  }

  modalOpen.value = false
  void runExpand()
}

async function runExpand() {
  expanding.value = true
  progress.value = 0
  const grade = getGradeLabel(props.grade) || '小学'

  try {
    if (isCharTable.value) {
      const allChars = currentChars.value
      const unexpanded = allChars.filter((c) => !c.expanded)
      const expanded = await expandCharacters(unexpanded, charConfig.value, grade, (done, total) => {
        progress.value = Math.round((done / total) * 100)
      })
      const map = new Map(expanded.map((c) => [`${c.lessonNo}-${c.char}`, c]))
      const merged = allChars.map((c) => map.get(`${c.lessonNo}-${c.char}`) ?? c)

      if (props.tableType === 'writing') {
        emit('updateWriting', merged)
      } else {
        emit('updateReading', merged)
      }
      emit('expandConfigChange', charConfig.value)
    } else {
      const allWords = currentVocab.value
      const unexpanded = allWords.filter((w) => !w.expanded)
      const expanded = await expandVocabulary(unexpanded, vocabConfig.value, grade, (done, total) => {
        progress.value = Math.round((done / total) * 100)
      })
      const map = new Map(expanded.map((w) => [`${w.lessonNo}-${w.word}`, w]))
      const merged = allWords.map((w) => map.get(`${w.lessonNo}-${w.word}`) ?? w)
      emit('updateVocabulary', merged)
      emit('expandConfigChange', vocabConfig.value)
    }

    progress.value = 100
    message.success(`${tableLabel.value}拓展完成`)
  } catch (e) {
    message.error(e instanceof Error ? e.message : '拓展失败')
  } finally {
    expanding.value = false
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
      <p class="progress-text">正在拓展{{ tableLabel }}...</p>
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
      @ok="handleConfirmExpand"
    >
      <template v-if="isCharTable">
        <a-form layout="vertical">
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
        </a-form>
      </template>
      <template v-else>
        <a-form layout="vertical">
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
        </a-form>
      </template>
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
</style>
