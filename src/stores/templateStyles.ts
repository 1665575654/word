import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  DEFAULT_LESSON_SUMMARY_STYLE,
  normalizeLessonSummaryStyle,
  type LessonSummaryStyleConfig,
} from '@/types/templateStyles'

const STORAGE_KEY = 'jing-template-styles'

interface TemplateStylesState {
  lessonSummary: LessonSummaryStyleConfig
}

function loadState(): TemplateStylesState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TemplateStylesState>
      return {
        lessonSummary: normalizeLessonSummaryStyle(parsed.lessonSummary),
      }
    }
  } catch {
    // ignore
  }
  return {
    lessonSummary: normalizeLessonSummaryStyle(DEFAULT_LESSON_SUMMARY_STYLE),
  }
}

export const useTemplateStylesStore = defineStore('templateStyles', () => {
  const state = ref<TemplateStylesState>(loadState())

  function saveLessonSummaryStyle(config: LessonSummaryStyleConfig) {
    state.value.lessonSummary = normalizeLessonSummaryStyle(config)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
  }

  function resetLessonSummaryStyle() {
    state.value.lessonSummary = normalizeLessonSummaryStyle(DEFAULT_LESSON_SUMMARY_STYLE)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
  }

  return {
    state,
    saveLessonSummaryStyle,
    resetLessonSummaryStyle,
  }
})
