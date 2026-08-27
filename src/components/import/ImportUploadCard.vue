<script setup lang="ts">
import { UploadOutlined } from '@ant-design/icons-vue'
import type { UploadType } from '@/composables/importTableConfig'

defineProps<{
  uploadType: UploadType
  uploadTypeLabel: string
  parsing: boolean
  dataTypes: { value: UploadType; label: string }[]
}>()

const emit = defineEmits<{
  'update:uploadType': [value: UploadType]
  upload: [file: File]
}>()

function beforeUpload(file: File) {
  emit('upload', file)
  return false
}
</script>

<template>
  <div class="card-section">
    <a-typography-title :level="5">上传识别</a-typography-title>
    <a-typography-paragraph type="secondary">
      选择数据类型后上传图片进行识别，可多次上传，识别结果会自动合并。下方可预览、编辑，也可在各 tab 中上传/下载对应 JSON。
    </a-typography-paragraph>

    <div class="upload-type-row">
      <span class="upload-type-label">数据类型：</span>
      <a-radio-group
        :value="uploadType"
        button-style="solid"
        @update:value="emit('update:uploadType', $event)"
      >
        <a-radio-button v-for="opt in dataTypes" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </a-radio-button>
      </a-radio-group>
    </div>

    <div class="upload-area">
      <a-upload
        :before-upload="beforeUpload"
        :show-upload-list="false"
        accept="image/*"
        :disabled="parsing"
      >
        <a-button size="large" :disabled="parsing">
          <UploadOutlined /> 上传{{ uploadTypeLabel }}图片
        </a-button>
      </a-upload>
    </div>
    <a-spin v-if="parsing" tip="正在识别..." style="margin-top: 16px; display: block" />
  </div>
</template>

<style scoped>
.upload-type-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.upload-type-label {
  font-size: 14px;
  color: #666;
}

.upload-area {
  margin-top: 12px;
}
</style>
