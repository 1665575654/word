<script setup lang="ts">
import { reactive, watch } from 'vue'
import { message } from 'ant-design-vue'
import ColorPickerField from '@/components/template/ColorPickerField.vue'
import { useTemplateStylesStore } from '@/stores/templateStyles'
import { DEFAULT_LESSON_SUMMARY_STYLE, type LessonSummaryStyleConfig } from '@/types/templateStyles'

const templateStylesStore = useTemplateStylesStore()

const form = reactive<LessonSummaryStyleConfig>(
  JSON.parse(JSON.stringify(templateStylesStore.state.lessonSummary))
)

watch(
  () => templateStylesStore.state.lessonSummary,
  (val) => {
    Object.assign(form, JSON.parse(JSON.stringify(val)))
  },
  { deep: true }
)

function reloadFromStore() {
  Object.assign(form, JSON.parse(JSON.stringify(templateStylesStore.state.lessonSummary)))
}

function save() {
  templateStylesStore.saveLessonSummaryStyle(JSON.parse(JSON.stringify(form)))
  message.success('综合课表样式已保存')
}

function reset() {
  Object.assign(form, JSON.parse(JSON.stringify(DEFAULT_LESSON_SUMMARY_STYLE)))
  templateStylesStore.resetLessonSummaryStyle()
  message.success('已恢复默认样式')
}

defineExpose({ save, reset, reloadFromStore })
</script>

<template>
  <div class="style-panel">
    <a-form layout="vertical">
<!--      <a-form-item label="整表字体">-->
<!--        <a-input v-model:value="form.fontFamily" placeholder="华文楷体" style="max-width: 240px" />-->
<!--      </a-form-item>-->

      <a-divider orientation="left">文字样式</a-divider>

      <a-row :gutter="[16, 8]">
        <a-col :span="24">
          <a-typography-text strong>每课标题</a-typography-text>
        </a-col>
        <a-col :xs="24" :sm="8">
          <a-form-item label="字号（小二=18）">
            <a-input-number v-model:value="form.lessonTitle.fontSize" :min="8" :max="72" style="width: 100%" />
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="8">
          <a-form-item label="加粗">
            <a-switch v-model:checked="form.lessonTitle.bold" />
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="8">
          <a-form-item label="颜色">
            <ColorPickerField v-model="form.lessonTitle.color" />
          </a-form-item>
        </a-col>

        <a-col :span="24">
          <a-typography-text strong>每课生字</a-typography-text>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="字号">
            <a-input-number v-model:value="form.char.fontSize" :min="8" :max="72" style="width: 100%" />
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="颜色">
            <ColorPickerField v-model="form.char.color" />
          </a-form-item>
        </a-col>

        <a-col :span="24">
          <a-typography-text strong>组词</a-typography-text>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="字号">
            <a-input-number v-model:value="form.words.fontSize" :min="8" :max="72" style="width: 100%" />
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="颜色">
            <ColorPickerField v-model="form.words.color" />
          </a-form-item>
        </a-col>

        <a-col :span="24">
          <a-typography-text strong>造句</a-typography-text>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="字号">
            <a-input-number v-model:value="form.sentence.fontSize" :min="8" :max="72" style="width: 100%" />
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="组词目标字颜色">
            <ColorPickerField v-model="form.sentence.highlightColor" />
          </a-form-item>
        </a-col>
      </a-row>

      <a-divider orientation="left">单元格填充色</a-divider>

      <a-row :gutter="[16, 8]">
        <a-col :xs="24" :sm="12">
          <a-form-item label="每课标题">
            <ColorPickerField v-model="form.fill.lessonTitle" />
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="写字表">
            <ColorPickerField v-model="form.fill.writingTable" />
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="识字表">
            <ColorPickerField v-model="form.fill.readingTable" />
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="词语表">
            <ColorPickerField v-model="form.fill.vocabTable" />
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
  </div>
</template>

<style scoped>
.style-panel {
  max-width: 100%;
}
</style>
