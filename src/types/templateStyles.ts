/** 综合课表（三表合并）样式配置 */
export interface LessonSummaryStyleConfig {
  /** 整表字体 */
  fontFamily: string
  /** 组词列数（默认 3） */
  wordCount: number
  lessonTitle: {
    fontSize: number
    bold: boolean
    color: string
  }
  char: {
    fontSize: number
    color: string
  }
  words: {
    fontSize: number
    color: string
  }
  sentence: {
    fontSize: number
    /** 造句中组词目标色（句中无组词时仅标目标字） */
    highlightColor: string
  }
  fill: {
    lessonTitle: string
    writingTable: string
    readingTable: string
    vocabTable: string
  }
}

export const DEFAULT_LESSON_SUMMARY_WORD_COUNT = 3

/** 小二 ≈ 18pt */
export const DEFAULT_LESSON_SUMMARY_STYLE: LessonSummaryStyleConfig = {
  fontFamily: '华文楷体',
  wordCount: DEFAULT_LESSON_SUMMARY_WORD_COUNT,
  lessonTitle: {
    fontSize: 18,
    bold: true,
    color: 'C00000',
  },
  char: {
    fontSize: 16,
    color: 'C00000',
  },
  words: {
    fontSize: 14,
    color: '000000',
  },
  sentence: {
    fontSize: 14,
    highlightColor: 'C00000',
  },
  fill: {
    lessonTitle: 'EBF5F6',
    writingTable: 'DAEEF3',
    readingTable: 'F6DFD6',
    vocabTable: 'CBE4B1',
  },
}

function normalizeWordCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(5, Math.max(1, Math.round(value)))
  }
  return DEFAULT_LESSON_SUMMARY_WORD_COUNT
}

export function normalizeLessonSummaryStyle(raw: unknown): LessonSummaryStyleConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_LESSON_SUMMARY_STYLE, lessonTitle: { ...DEFAULT_LESSON_SUMMARY_STYLE.lessonTitle }, char: { ...DEFAULT_LESSON_SUMMARY_STYLE.char }, words: { ...DEFAULT_LESSON_SUMMARY_STYLE.words }, sentence: { ...DEFAULT_LESSON_SUMMARY_STYLE.sentence }, fill: { ...DEFAULT_LESSON_SUMMARY_STYLE.fill } }
  }
  const r = raw as Partial<LessonSummaryStyleConfig>
  const d = DEFAULT_LESSON_SUMMARY_STYLE
  return {
    fontFamily: typeof r.fontFamily === 'string' ? r.fontFamily : d.fontFamily,
    wordCount: normalizeWordCount(r.wordCount),
    lessonTitle: { ...d.lessonTitle, ...(r.lessonTitle as object) },
    char: { ...d.char, ...(r.char as object) },
    words: { ...d.words, ...(r.words as object) },
    sentence: { ...d.sentence, ...(r.sentence as object) },
    fill: { ...d.fill, ...(r.fill as object) },
  }
}
