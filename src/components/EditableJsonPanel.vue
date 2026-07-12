<script setup lang="ts">
import { ref, watch } from 'vue'
import { message } from 'ant-design-vue'

const props = defineProps<{
  modelValue: string
  rows?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  apply: [value: unknown]
}>()

const text = ref(props.modelValue)

watch(
  () => props.modelValue,
  (val) => {
    if (val !== text.value) text.value = val
  }
)

function onInput() {
  emit('update:modelValue', text.value)
}

function handleApply() {
  try {
    const parsed = JSON.parse(text.value)
    emit('apply', parsed)
  } catch {
    message.error('JSON 格式错误，请检查语法')
  }
}

function handleFormat() {
  try {
    const parsed = JSON.parse(text.value)
    text.value = JSON.stringify(parsed, null, 2)
    emit('update:modelValue', text.value)
    message.success('已格式化')
  } catch {
    message.error('JSON 格式错误，无法格式化')
  }
}
</script>

<template>
  <div>
    <a-textarea
      v-model:value="text"
      :rows="rows ?? 16"
      style="font-family: 'Consolas', 'Monaco', monospace; font-size: 13px"
      @input="onInput"
    />
    <a-space style="margin-top: 8px">
      <a-button type="primary" @click="handleApply">应用 JSON 修改</a-button>
      <a-button @click="handleFormat">格式化</a-button>
    </a-space>
  </div>
</template>
