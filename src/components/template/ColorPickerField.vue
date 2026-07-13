<script setup lang="ts">
import { computed } from 'vue'
import { ColorPicker } from 'vue3-colorpicker'
import { fromPickerColor, toPickerColor } from '@/utils/colorUtils'

const props = defineProps<{
  modelValue: string
  label?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const pickerColor = computed({
  get: () => toPickerColor(props.modelValue),
  set: (val: string) => emit('update:modelValue', fromPickerColor(val)),
})
</script>

<template>
  <div class="color-picker-field">
    <span v-if="label" class="color-picker-label">{{ label }}</span>
    <color-picker
      v-model:pureColor="pickerColor"
      format="hex"
      shape="square"
      :disable-alpha="true"
      :disable-history="true"
    />
    <a-input
      :value="modelValue"
      size="small"
      style="width: 88px"
      maxlength="6"
      @update:value="(v: string) => emit('update:modelValue', fromPickerColor(v))"
    />
  </div>
</template>

<style scoped>
.color-picker-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-picker-label {
  min-width: 72px;
  color: rgba(0, 0, 0, 0.65);
  font-size: 13px;
}
</style>
