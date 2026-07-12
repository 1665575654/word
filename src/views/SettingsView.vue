<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { message } from 'ant-design-vue'
import { useSettingsStore } from '@/stores/settings'
import {
  testExpandConnection,
  testOcrConnection,
  getChatCompletionsUrl,
} from '@/services/openai'
import type { ExpandConfig } from '@/types'

const settingsStore = useSettingsStore()
const testingExpand = ref(false)
const testingOcr = ref(false)

const ocrEffectiveUrl = computed(() => getChatCompletionsUrl(form.ocrBaseUrl))

const form = reactive({
  openaiApiKey: settingsStore.settings.openaiApiKey,
  openaiBaseUrl: settingsStore.settings.openaiBaseUrl,
  ocrApiKey: settingsStore.settings.ocrApiKey,
  ocrBaseUrl: settingsStore.settings.ocrBaseUrl,
  ocrModel: settingsStore.settings.ocrModel,
  expandModel: settingsStore.settings.expandModel,
  expandConfig: JSON.parse(JSON.stringify(settingsStore.settings.expandConfig)) as ExpandConfig,
})

const charFieldOptions = [
  { label: '读音', value: 'pinyin' },
  { label: '音序', value: 'phoneticOrder' },
  { label: '部首', value: 'radical' },
  { label: '结构', value: 'structure' },
  { label: '组词', value: 'words' },
  { label: '造句', value: 'sentences' },
]

function buildSettingsPayload() {
  return {
    openaiApiKey: form.openaiApiKey,
    openaiBaseUrl: form.openaiBaseUrl,
    ocrApiKey: form.ocrApiKey,
    ocrBaseUrl: form.ocrBaseUrl,
    ocrModel: form.ocrModel,
    expandModel: form.expandModel,
    expandConfig: JSON.parse(JSON.stringify(form.expandConfig)) as ExpandConfig,
  }
}

function handleSave() {
  settingsStore.saveSettings(buildSettingsPayload())
  message.success('设置已保存')
}

async function handleTestExpand() {
  settingsStore.saveSettings(buildSettingsPayload())
  testingExpand.value = true
  try {
    const result = await testExpandConnection()
    message.success(result, 5)
  } catch (e) {
    message.error(e instanceof Error ? e.message : '连接失败', 8)
  } finally {
    testingExpand.value = false
  }
}

async function handleTestOcr() {
  settingsStore.saveSettings(buildSettingsPayload())
  testingOcr.value = true
  try {
    const result = await testOcrConnection()
    message.success(result, 5)
  } catch (e) {
    message.error(e instanceof Error ? e.message : '连接失败', 8)
  } finally {
    testingOcr.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <div class="settings-header">
      <a-typography-title :level="3" style="margin: 0">设置</a-typography-title>
      <a-button type="primary" size="large" @click="handleSave">保存设置</a-button>
    </div>

    <div class="card-section">
      <a-typography-title :level="5">图片识别 API</a-typography-title>
      <a-typography-paragraph type="secondary">
        用于目录、写字表、识字表、词语表的图片识别，与文本拓展使用独立的 API Key 和模型（如通义千问 Qwen VL）。
      </a-typography-paragraph>

      <a-form layout="vertical" style="max-width: 640px; margin-top: 16px">
        <a-form-item label="图片识别 API Key" required>
          <a-input-password v-model:value="form.ocrApiKey" placeholder="sk-..." />
          <template #extra>仅存储在本地浏览器，可与文本拓展 Key 不同</template>
        </a-form-item>
        <a-form-item label="图片识别 API Base URL">
          <a-input
            v-model:value="form.ocrBaseUrl"
            placeholder="https://ws-xxx.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
          />
          <template #extra>
            百炼/MaaS 填工作空间地址，如
            <code>https://ws-xxx.cn-beijing.maas.aliyuncs.com/compatible-mode/v1</code>；
            公共 API 填 <code>https://dashscope.aliyuncs.com/compatible-mode/v1</code>。
            本地开发会自动走代理 {{ ocrEffectiveUrl }}
          </template>
        </a-form-item>
        <a-form-item label="图片识别模型">
          <a-input
            v-model:value="form.ocrModel"
            placeholder="例如 qwen3.6-plus"
            allow-clear
          />
          <template #extra>
            填写支持 Vision 的多模态模型名称，用于直接识别目录、生字表、识字表、词语表图片
          </template>
        </a-form-item>
        <a-space style="margin-bottom: 16px">
          <a-button :loading="testingOcr" @click="handleTestOcr">测试图片识别连接</a-button>
        </a-space>
      </a-form>
    </div>

    <div class="card-section">
      <a-typography-title :level="5">文本拓展 API</a-typography-title>
      <a-typography-paragraph type="secondary">
        用于生字、词语的 AI 拓展（读音、组词、造句等），与图片识别配置相互独立。
      </a-typography-paragraph>

      <a-form layout="vertical" style="max-width: 640px; margin-top: 16px">
        <a-form-item label="文本拓展 API Key" required>
          <a-input-password v-model:value="form.openaiApiKey" placeholder="sk-..." />
          <template #extra>仅存储在本地浏览器</template>
        </a-form-item>
        <a-form-item label="文本拓展 API Base URL">
          <a-input
            v-model:value="form.openaiBaseUrl"
            placeholder="https://api.deepseek.com"
          />
          <template #extra>
            填写兼容 OpenAI 协议的 Base URL。
          </template>
        </a-form-item>
        <a-form-item label="AI 拓展模型">
          <a-input
            v-model:value="form.expandModel"
            placeholder="例如 deepseek-v4-pro、gpt-4o-mini"
            allow-clear
          />
        </a-form-item>
        <a-space style="margin-bottom: 16px">
          <a-button :loading="testingExpand" @click="handleTestExpand">测试文本拓展连接</a-button>
        </a-space>
      </a-form>
    </div>

    <div class="card-section">
      <a-typography-title :level="5">默认拓展配置</a-typography-title>
      <a-typography-paragraph type="secondary">
        新建工作区时将使用以下默认配置，可在 AI 拓展步骤中按表单独调整。
      </a-typography-paragraph>

      <div class="default-expand-config">
        <div class="config-block">
          <a-checkbox v-model:checked="form.expandConfig.writing.enabled">默认拓展写字表</a-checkbox>
          <template v-if="form.expandConfig.writing.enabled">
            <a-form-item label="拓展字段" style="margin-top: 12px">
              <a-checkbox-group
                v-model:value="form.expandConfig.writing.charFields"
                :options="charFieldOptions"
              />
            </a-form-item>
            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item label="组词数量">
                  <a-input-number
                    v-model:value="form.expandConfig.writing.wordCount"
                    :min="1"
                    :max="5"
                    style="width: 100%"
                  />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="造句数量">
                  <a-input-number
                    v-model:value="form.expandConfig.writing.sentenceCount"
                    :min="1"
                    :max="3"
                    style="width: 100%"
                  />
                </a-form-item>
              </a-col>
            </a-row>
          </template>
        </div>

        <div class="config-block">
          <a-checkbox v-model:checked="form.expandConfig.reading.enabled">默认拓展识字表</a-checkbox>
          <template v-if="form.expandConfig.reading.enabled">
            <a-form-item label="拓展字段" style="margin-top: 12px">
              <a-checkbox-group
                v-model:value="form.expandConfig.reading.charFields"
                :options="charFieldOptions"
              />
            </a-form-item>
            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item label="组词数量">
                  <a-input-number
                    v-model:value="form.expandConfig.reading.wordCount"
                    :min="1"
                    :max="5"
                    style="width: 100%"
                  />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="造句数量">
                  <a-input-number
                    v-model:value="form.expandConfig.reading.sentenceCount"
                    :min="1"
                    :max="3"
                    style="width: 100%"
                  />
                </a-form-item>
              </a-col>
            </a-row>
          </template>
        </div>

        <div class="config-block">
          <a-checkbox v-model:checked="form.expandConfig.vocabulary.enabled">默认拓展词语表</a-checkbox>
          <template v-if="form.expandConfig.vocabulary.enabled">
            <a-row :gutter="16" style="margin-top: 12px">
              <a-col :span="12">
                <a-form-item label="组词数量">
                  <a-input-number
                    v-model:value="form.expandConfig.vocabulary.vocabWordCount"
                    :min="1"
                    :max="5"
                    style="width: 100%"
                  />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="造句数量">
                  <a-input-number
                    v-model:value="form.expandConfig.vocabulary.vocabSentenceCount"
                    :min="1"
                    :max="3"
                    style="width: 100%"
                  />
                </a-form-item>
              </a-col>
            </a-row>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.default-expand-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 640px;
  margin-top: 16px;
}

.config-block {
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px 16px;
  background: #fafafa;
}
</style>
