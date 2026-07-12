<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  ThunderboltOutlined,
  ExportOutlined,
  ImportOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons-vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSettingsStore } from '@/stores/settings'
import { exportJwData, importPartialJwDataFromFile, JSON_FILE_ACCEPT } from '@/services/fileIO'
import { expandCharacters, expandVocabulary } from '@/services/aiExpander'
import { getGradeLabel } from '@/utils/exportName'
import ExpandedLessonResults from '@/components/table/ExpandedLessonResults.vue'
import type { CharacterItem, WordItem, CharExpandConfig, VocabExpandConfig } from '@/types'

const router = useRouter()
const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()

const expanding = ref(false)
const progress = ref(0)
const progressText = ref('')

const workspace = computed(() => workspaceStore.current)

const charFieldOptions = [
  { label: '读音', value: 'pinyin' },
  { label: '音序', value: 'phoneticOrder' },
  { label: '部首', value: 'radical' },
  { label: '结构', value: 'structure' },
  { label: '组词', value: 'words' },
  { label: '造句', value: 'sentences' },
]

const hasExpandTask = computed(() => {
  if (!workspace.value) return false
  const config = workspace.value.expandConfig
  const writingCount = config.writing.enabled
    ? workspace.value.writingChars.filter((c) => !c.expanded).length
    : 0
  const readingCount = config.reading.enabled
    ? workspace.value.readingChars.filter((c) => !c.expanded).length
    : 0
  const vocabCount = config.vocabulary.enabled
    ? workspace.value.vocabulary.filter((v) => !v.expanded).length
    : 0
  return writingCount + readingCount + vocabCount > 0
})

async function handleExpand() {
  if (!workspace.value) return
  if (!settingsStore.hasExpandApiKey()) {
    message.warning('请先在设置页配置文本拓展 API Key')
    return
  }

  const config = workspace.value.expandConfig
  if (!config.writing.enabled && !config.reading.enabled && !config.vocabulary.enabled) {
    message.warning('请至少选择一张表进行拓展')
    return
  }

  if (!hasExpandTask.value) {
    message.info('所选表均已拓展，无需重复执行')
    return
  }

  expanding.value = true
  progress.value = 0
  try {
    const grade = getGradeLabel(workspace.value.meta.grade) || '小学'
    const tasks: Array<{ label: string; total: number; run: () => Promise<void> }> = []

    if (config.writing.enabled) {
      const unexpanded = workspace.value.writingChars.filter((c) => !c.expanded)
      if (unexpanded.length > 0) {
        tasks.push({
          label: '写字表',
          total: unexpanded.length,
          run: async () => {
            progressText.value = '正在拓展写字表...'
            const expanded = await expandCharacters(
              unexpanded,
              config.writing,
              grade,
              (done, total) => {
                progress.value = Math.round((done / total) * (100 / tasks.length))
              }
            )
            const map = new Map(expanded.map((c) => [`${c.lessonNo}-${c.char}`, c]))
            const writingChars = workspace.value!.writingChars.map(
              (c) => map.get(`${c.lessonNo}-${c.char}`) ?? c
            )
            await workspaceStore.update({ writingChars })
          },
        })
      }
    }

    if (config.reading.enabled) {
      const unexpanded = workspace.value.readingChars.filter((c) => !c.expanded)
      if (unexpanded.length > 0) {
        tasks.push({
          label: '识字表',
          total: unexpanded.length,
          run: async () => {
            progressText.value = '正在拓展识字表...'
            const expanded = await expandCharacters(
              unexpanded,
              config.reading,
              grade,
              (done, total) => {
                const base = tasks.findIndex((t) => t.label === '识字表') / tasks.length
                progress.value = Math.round(
                  base * 100 + (done / total) * (100 / tasks.length)
                )
              }
            )
            const map = new Map(expanded.map((c) => [`${c.lessonNo}-${c.char}`, c]))
            const readingChars = workspace.value!.readingChars.map(
              (c) => map.get(`${c.lessonNo}-${c.char}`) ?? c
            )
            await workspaceStore.update({ readingChars })
          },
        })
      }
    }

    if (config.vocabulary.enabled) {
      const unexpanded = workspace.value.vocabulary.filter((v) => !v.expanded)
      if (unexpanded.length > 0) {
        tasks.push({
          label: '词语表',
          total: unexpanded.length,
          run: async () => {
            progressText.value = '正在拓展词语表...'
            const expandedVocab = await expandVocabulary(
              unexpanded,
              config.vocabulary,
              grade,
              (done, total) => {
                const taskIndex = tasks.findIndex((t) => t.label === '词语表')
                progress.value = Math.round(
                  (taskIndex / tasks.length) * 100 + (done / total) * (100 / tasks.length)
                )
              }
            )
            const map = new Map(expandedVocab.map((v) => [`${v.lessonNo}-${v.word}`, v]))
            const vocabulary = workspace.value!.vocabulary.map(
              (v) => map.get(`${v.lessonNo}-${v.word}`) ?? v
            )
            await workspaceStore.update({ vocabulary })
          },
        })
      }
    }

    if (tasks.length === 0) {
      message.info('所选表均已拓展，无需重复执行')
      return
    }

    for (let i = 0; i < tasks.length; i++) {
      await tasks[i].run()
      progress.value = Math.round(((i + 1) / tasks.length) * 100)
    }

    await workspaceStore.update({ stage: 'expanded' })
    progress.value = 100
    message.success('拓展完成')
  } catch (e) {
    message.error(e instanceof Error ? e.message : '拓展失败')
  } finally {
    expanding.value = false
    progressText.value = ''
  }
}

function handleExport() {
  if (!workspace.value) return
  exportJwData(workspace.value, 'expanded')
}

async function handleImport(file: File) {
  if (!workspace.value) return false
  try {
    const updates = await importPartialJwDataFromFile(file, workspace.value)
    await workspaceStore.update(updates)
    message.success('拓展数据导入成功')
  } catch (e) {
    message.error(e instanceof Error ? e.message : '导入失败')
  }
  return false
}

async function onWritingUpdate(data: CharacterItem[]) {
  await workspaceStore.update({ writingChars: data })
}

async function onReadingUpdate(data: CharacterItem[]) {
  await workspaceStore.update({ readingChars: data })
}

async function onVocabUpdate(data: WordItem[]) {
  await workspaceStore.update({ vocabulary: data })
}

function goNext() {
  if (!workspace.value) return
  router.push(`/workspace/${workspace.value.id}/export`)
}

async function updateCharConfig(
  table: 'writing' | 'reading',
  patch: Partial<CharExpandConfig>
) {
  if (!workspace.value) return
  await workspaceStore.update({
    expandConfig: {
      ...workspace.value.expandConfig,
      [table]: { ...workspace.value.expandConfig[table], ...patch },
    },
  })
}

async function updateVocabConfig(patch: Partial<VocabExpandConfig>) {
  if (!workspace.value) return
  await workspaceStore.update({
    expandConfig: {
      ...workspace.value.expandConfig,
      vocabulary: { ...workspace.value.expandConfig.vocabulary, ...patch },
    },
  })
}
</script>

<template>
  <div>
    <div class="card-section">
      <a-typography-title :level="5">拓展配置</a-typography-title>
      <a-typography-paragraph type="secondary">
        可使用上一步合并数据，也可上传 JSON 文件。三种表可分别配置是否拓展及拓展字段。
      </a-typography-paragraph>
      <a-upload
        :before-upload="handleImport"
        :show-upload-list="false"
        :accept="JSON_FILE_ACCEPT"
        style="margin-bottom: 16px"
      >
        <a-button><ImportOutlined /> 上传拓展数据</a-button>
      </a-upload>

      <template v-if="workspace">
        <div class="expand-table-config">
          <div class="config-block">
            <div class="config-block-header">
              <a-checkbox
                :checked="workspace.expandConfig.writing.enabled"
                @change="(e: Event) => updateCharConfig('writing', { enabled: (e.target as HTMLInputElement).checked })"
              >
                拓展写字表
              </a-checkbox>
            </div>
            <div v-if="workspace.expandConfig.writing.enabled" class="config-block-body">
              <a-form-item label="拓展字段" :label-col="{ span: 24 }">
                <a-checkbox-group
                  :value="workspace.expandConfig.writing.charFields"
                  :options="charFieldOptions"
                  @change="(v: string[]) => updateCharConfig('writing', { charFields: v })"
                />
              </a-form-item>
              <a-row :gutter="16">
                <a-col :span="12">
                  <a-form-item label="组词数量">
                    <a-input-number
                      :value="workspace.expandConfig.writing.wordCount"
                      :min="1"
                      :max="5"
                      style="width: 100%"
                      @change="(v: number) => updateCharConfig('writing', { wordCount: v })"
                    />
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="造句数量">
                    <a-input-number
                      :value="workspace.expandConfig.writing.sentenceCount"
                      :min="1"
                      :max="3"
                      style="width: 100%"
                      @change="(v: number) => updateCharConfig('writing', { sentenceCount: v })"
                    />
                  </a-form-item>
                </a-col>
              </a-row>
            </div>
          </div>

          <div class="config-block">
            <div class="config-block-header">
              <a-checkbox
                :checked="workspace.expandConfig.reading.enabled"
                @change="(e: Event) => updateCharConfig('reading', { enabled: (e.target as HTMLInputElement).checked })"
              >
                拓展识字表
              </a-checkbox>
            </div>
            <div v-if="workspace.expandConfig.reading.enabled" class="config-block-body">
              <a-form-item label="拓展字段" :label-col="{ span: 24 }">
                <a-checkbox-group
                  :value="workspace.expandConfig.reading.charFields"
                  :options="charFieldOptions"
                  @change="(v: string[]) => updateCharConfig('reading', { charFields: v })"
                />
              </a-form-item>
              <a-row :gutter="16">
                <a-col :span="12">
                  <a-form-item label="组词数量">
                    <a-input-number
                      :value="workspace.expandConfig.reading.wordCount"
                      :min="1"
                      :max="5"
                      style="width: 100%"
                      @change="(v: number) => updateCharConfig('reading', { wordCount: v })"
                    />
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="造句数量">
                    <a-input-number
                      :value="workspace.expandConfig.reading.sentenceCount"
                      :min="1"
                      :max="3"
                      style="width: 100%"
                      @change="(v: number) => updateCharConfig('reading', { sentenceCount: v })"
                    />
                  </a-form-item>
                </a-col>
              </a-row>
            </div>
          </div>

          <div class="config-block">
            <div class="config-block-header">
              <a-checkbox
                :checked="workspace.expandConfig.vocabulary.enabled"
                @change="(e: Event) => updateVocabConfig({ enabled: (e.target as HTMLInputElement).checked })"
              >
                拓展词语表
              </a-checkbox>
            </div>
            <div v-if="workspace.expandConfig.vocabulary.enabled" class="config-block-body">
              <a-row :gutter="16">
                <a-col :span="12">
                  <a-form-item label="组词数量">
                    <a-input-number
                      :value="workspace.expandConfig.vocabulary.vocabWordCount"
                      :min="1"
                      :max="5"
                      style="width: 100%"
                      @change="(v: number) => updateVocabConfig({ vocabWordCount: v })"
                    />
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="造句数量">
                    <a-input-number
                      :value="workspace.expandConfig.vocabulary.vocabSentenceCount"
                      :min="1"
                      :max="3"
                      style="width: 100%"
                      @change="(v: number) => updateVocabConfig({ vocabSentenceCount: v })"
                    />
                  </a-form-item>
                </a-col>
              </a-row>
            </div>
          </div>
        </div>
      </template>

      <a-button
        type="primary"
        size="large"
        :loading="expanding"
        :disabled="!hasExpandTask"
        style="margin-top: 8px"
        @click="handleExpand"
      >
        <ThunderboltOutlined /> 开始 AI 拓展
      </a-button>

      <div v-if="expanding" style="margin-top: 16px">
        <a-progress :percent="progress" />
        <p style="color: #666; margin-top: 4px">{{ progressText }}</p>
      </div>
    </div>

    <div v-if="workspace" class="card-section">
      <a-typography-title :level="5">拓展结果（可编辑）</a-typography-title>
      <a-typography-paragraph type="secondary">
        按课次展示，每课包含写字表、识字表、词语表。
      </a-typography-paragraph>
      <ExpandedLessonResults
        :workspace="workspace"
        @update-writing="onWritingUpdate"
        @update-reading="onReadingUpdate"
        @update-vocab="onVocabUpdate"
      />
    </div>

    <a-space style="margin-top: 16px" wrap>
      <a-button @click="handleExport">
        <ExportOutlined /> 下载拓展数据
      </a-button>
      <a-button type="primary" @click="goNext">
        下一步：生成文件 <ArrowRightOutlined />
      </a-button>
    </a-space>
  </div>
</template>

<style scoped>
.expand-table-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-block {
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px 16px;
  background: #fafafa;
}

.config-block-header {
  font-weight: 600;
}

.config-block-body {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e8e8e8;
}

.config-block-body :deep(.ant-form-item) {
  margin-bottom: 12px;
}
</style>
