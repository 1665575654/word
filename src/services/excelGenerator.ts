import ExcelJS from 'exceljs'
import type {CharacterItem, DataSourceType, WordItem, Workspace} from '@/types'
import type {LessonSummaryStyleConfig} from '@/types/templateStyles'
import {DEFAULT_LESSON_SUMMARY_STYLE} from '@/types/templateStyles'
import {hexToArgb} from '@/utils/colorUtils'
import {isLessonSlotChar, isLessonSlotWord} from '@/services/dataMerger'
import {formatLessonOrdinalLabel, normalizeLessonNo} from '@/services/lessonNoUtils'
import {setCellBorder, setHighlightedCell, setSentenceHighlightedCell} from '@/services/richTextBuilder'

interface GenerateOptions {
  templateId: string
  workspace: Workspace
  dataSource: DataSourceType
  lessonNos: string[]
  options: Record<string, unknown>
}

export async function generateBuiltinExcel(opts: GenerateOptions): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  switch (opts.templateId) {
    case 'char-word-sticker':
      await generateCharWordSticker(workbook, opts)
      break
    case 'char-word-sentence-book':
      await generateCharWordSentenceBook(workbook, opts)
      break
    case 'lesson-summary-table':
      await generateLessonSummaryTable(workbook, opts)
      break
    case 'char-expand-grid':
      await generateCharExpandGrid(workbook, opts)
      break
    case 'char-pinyin-word-grid':
      await generateCharPinyinWordGrid(workbook, opts)
      break
    default:
      throw new Error(`未知模板: ${opts.templateId}`)
  }

  return workbook.xlsx.writeBuffer()
}

function isRealChar(item: CharacterItem): boolean {
  const char = String(item.char ?? '').trim()
  return char.length === 1 && !isLessonSlotChar(char)
}

function isRealWord(item: WordItem): boolean {
  const word = String(item.word ?? '').trim()
  return word.length > 0 && !isLessonSlotWord(word)
}

function getWritingChars(workspace: Workspace, lessonNo: string): CharacterItem[] {
  const no = normalizeLessonNo(lessonNo)
  return workspace.writingChars.filter((c) => normalizeLessonNo(c.lessonNo) === no && isRealChar(c))
}

function getReadingChars(workspace: Workspace, lessonNo: string): CharacterItem[] {
  const no = normalizeLessonNo(lessonNo)
  return workspace.readingChars.filter((c) => normalizeLessonNo(c.lessonNo) === no && isRealChar(c))
}

function getLessonVocab(workspace: Workspace, lessonNo: string): WordItem[] {
  const no = normalizeLessonNo(lessonNo)
  return workspace.vocabulary.filter((v) => normalizeLessonNo(v.lessonNo) === no && isRealWord(v))
}

function getChars(workspace: Workspace, dataSource: DataSourceType, lessonNo: string): CharacterItem[] {
  const no = normalizeLessonNo(lessonNo)
  if (dataSource === 'writing') {
    return workspace.writingChars.filter((c) => normalizeLessonNo(c.lessonNo) === no && isRealChar(c))
  }
  if (dataSource === 'reading') {
    return workspace.readingChars.filter((c) => normalizeLessonNo(c.lessonNo) === no && isRealChar(c))
  }
  return [
    ...workspace.writingChars.filter((c) => normalizeLessonNo(c.lessonNo) === no && isRealChar(c)),
    ...workspace.readingChars.filter((c) => normalizeLessonNo(c.lessonNo) === no && isRealChar(c)),
  ]
}

function getLessonTitle(workspace: Workspace, lessonNo: string): string {
  const lesson = workspace.catalog.lessons.find((l) => l.lessonNo === lessonNo)
  const label = formatLessonOrdinalLabel(lesson?.lessonNo ?? lessonNo)
  return lesson ? `${label} ${lesson.title}` : label
}

const STICKER_FONT = '华文楷体'
const STICKER_FONT_SIZE = 12
const STICKER_COLS_PER_CHAR = 2
/** 空值保留缺少词语时的固定位置，避免空格文本被渲染为异常字符。 */
const STICKER_PLACEHOLDER = null

async function generateCharWordSticker(workbook: ExcelJS.Workbook, opts: GenerateOptions) {
  const lessonsWithChars = opts.lessonNos
    .map((lessonNo) => ({
      lessonNo,
      chars: getChars(opts.workspace, opts.dataSource, lessonNo),
    }))
    .filter(({ chars }) => chars.length > 0)

  if (lessonsWithChars.length === 0) {
    throw new Error('所选课次均无生字，无法生成课贴')
  }

  const maxCharsInRow = Math.max(...lessonsWithChars.map(({ chars }) => chars.length))
  const maxCols = maxCharsInRow * STICKER_COLS_PER_CHAR
  const sheet = workbook.addWorksheet('组词课课贴')
  sheet.properties.defaultRowHeight = 22
  let row = 1

  sheet.mergeCells(row, 1, row, maxCols)
  const titleCell = sheet.getCell(row, 1)
  titleCell.value = opts.workspace.meta.title || '组词课课贴'
  titleCell.font = { name: STICKER_FONT, size: 16, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  row += 2

  for (const { lessonNo, chars } of lessonsWithChars) {
    sheet.mergeCells(row, 1, row, maxCols)
    const headerCell = sheet.getCell(row, 1)
    headerCell.value = getLessonTitle(opts.workspace, lessonNo)
    headerCell.font = { name: STICKER_FONT, size: 14, bold: true, color: { argb: 'FF0000FF' } }
    headerCell.alignment = { horizontal: 'left', vertical: 'middle' }
    row++

    chars.forEach((char, idx) => {
      writeStickerWordBlock(sheet, row, idx * STICKER_COLS_PER_CHAR + 1, char)
    })
    row += 2
    row++
  }

  for (let c = 1; c <= maxCols; c++) {
    sheet.getColumn(c).width = 12
  }
}

function buildStickerRichLine(text: string, targetChar: string): ExcelJS.RichText[] {
  return [...text].map((ch) => ({
    text: ch,
    font: {
      name: STICKER_FONT,
      size: STICKER_FONT_SIZE,
      color: { argb: ch === targetChar ? 'FFFF0000' : 'FF000000' },
    },
  }))
}

function writeStickerWordBlock(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  char: CharacterItem
) {
  // Do not filter empty entries: an empty first or second word must keep its slot.
  const words = (char.words ?? []).map((word) => String(word ?? '').trim())
  const word1 = words[0] ?? ''
  const word2 = words[1] ?? ''
  const word3 = words[2] ?? ''

  setStickerWordCell(sheet.getCell(startRow, startCol), word1, char.char)
  setStickerWordCell(sheet.getCell(startRow, startCol + 1), word2, char.char)

  sheet.mergeCells(startRow + 1, startCol, startRow + 1, startCol + 1)
  setStickerWordCell(sheet.getCell(startRow + 1, startCol), word3, char.char)
  setCellBorder(sheet.getCell(startRow + 1, startCol + 1))
}

function setStickerWordCell(
  cell: ExcelJS.Cell,
  text: string,
  targetChar: string
) {
  cell.value = text
    ? { richText: buildStickerRichLine(text, targetChar) }
    : STICKER_PLACEHOLDER
  if (!text) {
    cell.font = { name: STICKER_FONT, size: STICKER_FONT_SIZE }
  }
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  setCellBorder(cell)
}

async function generateCharWordSentenceBook(workbook: ExcelJS.Workbook, opts: GenerateOptions) {
  const sheet = workbook.addWorksheet('组词造句本')
  let row = 1

  sheet.mergeCells(row, 1, row, 3)
  sheet.getCell(row, 1).value = opts.workspace.meta.title || '生字组词造句本'
  sheet.getCell(row, 1).font = { size: 16, bold: true }
  sheet.getCell(row, 1).alignment = { horizontal: 'center' }
  row += 2

  sheet.getColumn(1).width = 8
  sheet.getColumn(2).width = 30
  sheet.getColumn(3).width = 50

  for (const lessonNo of opts.lessonNos) {
    const chars = getChars(opts.workspace, opts.dataSource, lessonNo)
    if (chars.length === 0) continue

    sheet.mergeCells(row, 1, row, 3)
    const lessonCell = sheet.getCell(row, 1)
    lessonCell.value = getLessonTitle(opts.workspace, lessonNo)
    lessonCell.font = { size: 14, bold: true, color: { argb: 'FF008000' } }
    row++

    for (const char of chars) {
      const charCell = sheet.getCell(row, 1)
      charCell.value = char.char
      charCell.font = { size: 14, bold: true, color: { argb: 'FFFF0000' } }
      charCell.alignment = { horizontal: 'center' }

      const wordsCell = sheet.getCell(row, 2)
      wordsCell.value = (char.words ?? []).join('、')
      wordsCell.alignment = { vertical: 'middle' }

      const sentenceCell = sheet.getCell(row, 3)
      sentenceCell.value = char.sentences?.[0] ?? ''
      sentenceCell.font = { color: { argb: 'FF008000' } }
      sentenceCell.border = { bottom: { style: 'thin' } }
      sentenceCell.alignment = { vertical: 'middle' }

      row++
    }
    row++
  }
}

function getLessonSummaryStyle(opts: GenerateOptions): LessonSummaryStyleConfig {
  const raw = opts.options.lessonSummaryStyle
  if (raw && typeof raw === 'object') {
    return raw as LessonSummaryStyleConfig
  }
  return DEFAULT_LESSON_SUMMARY_STYLE
}

function baseFont(style: LessonSummaryStyleConfig, extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> {
  return {
    name: style.fontFamily,
    ...extra,
  }
}

function solidFill(hex: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(hex) } }
}

interface LessonSummaryLayout {
  wordCount: number
  wordsCol: number
  sentenceCol: number
  totalCols: number
}

function getLessonSummaryLayout(style: LessonSummaryStyleConfig): LessonSummaryLayout {
  const wordsCol = 7
  const sentenceCol = 8
  return {
    wordCount: style.wordCount,
    wordsCol,
    sentenceCol,
    totalCols: sentenceCol,
  }
}

function formatWordsCell(words: string[] | undefined, wordCount: number): string {
  return (words ?? [])
    .slice(0, wordCount)
    .map((w) => w.trim())
    .filter((w) => w.length > 0)
    .join(' | ')
}

async function generateLessonSummaryTable(workbook: ExcelJS.Workbook, opts: GenerateOptions) {
  const style = getLessonSummaryStyle(opts)
  const layout = getLessonSummaryLayout(style)
  const sheet = workbook.addWorksheet('综合课表')
  const fixedHeaders: Array<{ col: number; label: string }> = [
    { col: 1, label: '' },
    { col: 2, label: '生字' },
    { col: 3, label: '读音' },
    { col: 4, label: '音序' },
    { col: 5, label: '部首' },
    { col: 6, label: '结构' },
  ]
  let row = 1
  let hasContent = false

  for (const lessonNo of opts.lessonNos) {
    const lesson = opts.workspace.catalog.lessons.find((l) => l.lessonNo === lessonNo)
    const label = formatLessonOrdinalLabel(lesson?.lessonNo ?? lessonNo)
    const title = lesson ? `${label} 《${lesson.title}》` : label

    const writingChars = getWritingChars(opts.workspace, lessonNo)
    const readingChars = getReadingChars(opts.workspace, lessonNo)
    const vocab = getLessonVocab(opts.workspace, lessonNo)

    if (writingChars.length === 0 && readingChars.length === 0 && vocab.length === 0) continue

    hasContent = true

    sheet.mergeCells(row, 1, row, layout.totalCols)
    const titleCell = sheet.getCell(row, 1)
    titleCell.value = title
    titleCell.font = baseFont(style, {
      size: style.lessonTitle.fontSize,
      bold: style.lessonTitle.bold,
      color: { argb: hexToArgb(style.lessonTitle.color) },
    })
    titleCell.fill = solidFill(style.fill.lessonTitle)
    titleCell.alignment = { horizontal: 'center' }
    row++

    const headerRow = sheet.getRow(row)
    fixedHeaders.forEach(({ col, label: headerLabel }) => {
      const cell = headerRow.getCell(col)
      cell.value = headerLabel
      cell.font = baseFont(style, { bold: true, size: style.words.fontSize })
      cell.alignment = { horizontal: 'center' }
      setCellBorder(cell)
    })
    const wordsHeaderCell = headerRow.getCell(layout.wordsCol)
    wordsHeaderCell.value = '组词'
    wordsHeaderCell.font = baseFont(style, { bold: true, size: style.words.fontSize })
    wordsHeaderCell.alignment = { horizontal: 'center' }
    setCellBorder(wordsHeaderCell)
    const sentenceHeaderCell = headerRow.getCell(layout.sentenceCol)
    sentenceHeaderCell.value = '造句'
    sentenceHeaderCell.font = baseFont(style, { bold: true, size: style.words.fontSize })
    sentenceHeaderCell.alignment = { horizontal: 'center' }
    setCellBorder(sentenceHeaderCell)
    row++

    if (writingChars.length > 0) {
      row = addCharSection(sheet, '写字表', writingChars, row, style.fill.writingTable, style, layout)
    }

    if (readingChars.length > 0) {
      row = addCharSection(sheet, '识字表', readingChars, row, style.fill.readingTable, style, layout)
    }

    if (vocab.length > 0) {
      const vocabRow = sheet.getRow(row)
      vocabRow.getCell(1).value = '词语表'
      vocabRow.getCell(1).fill = solidFill(style.fill.vocabTable)
      vocabRow.getCell(1).font = baseFont(style, { size: style.words.fontSize })
      sheet.mergeCells(row, 2, row, layout.totalCols)
      vocabRow.getCell(2).value = vocab.map((v) => v.word).join('  ')
      vocabRow.getCell(2).font = baseFont(style, {
        size: style.words.fontSize,
        color: { argb: hexToArgb(style.words.color) },
      })
      setCellBorder(vocabRow.getCell(1))
      setCellBorder(vocabRow.getCell(2))
      row++
    }

    row++
  }

  if (!hasContent) {
    throw new Error('所选课次均无内容，无法生成综合课表')
  }

  sheet.getColumn(1).width = 10
  sheet.getColumn(2).width = 8
  sheet.getColumn(3).width = 10
  sheet.getColumn(4).width = 6
  sheet.getColumn(5).width = 8
  sheet.getColumn(6).width = 10
  sheet.getColumn(layout.wordsCol).width = 36
  sheet.getColumn(layout.sentenceCol).width = 40
}

function addCharSection(
  sheet: ExcelJS.Worksheet,
  label: string,
  chars: CharacterItem[],
  startRow: number,
  labelFillHex: string,
  style: LessonSummaryStyleConfig,
  layout: LessonSummaryLayout
): number {
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]
    const row = sheet.getRow(startRow + i)

    if (i === 0) {
      row.getCell(1).value = label
      row.getCell(1).fill = solidFill(labelFillHex)
      row.getCell(1).font = baseFont(style, { size: style.words.fontSize })
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
      if (chars.length > 1) {
        sheet.mergeCells(startRow, 1, startRow + chars.length - 1, 1)
      }
    }

    row.getCell(2).value = char.char
    row.getCell(2).font = baseFont(style, {
      size: style.char.fontSize,
      color: { argb: hexToArgb(style.char.color) },
    })
    row.getCell(3).value = char.pinyin ?? ''
    row.getCell(4).value = char.phoneticOrder ?? ''
    row.getCell(5).value = char.radical ?? ''
    row.getCell(6).value = char.structure ?? ''

    for (let col = 3; col <= 6; col++) {
      row.getCell(col).font = baseFont(style, { size: style.words.fontSize })
    }

    const wordsCell = row.getCell(layout.wordsCol)
    wordsCell.value = formatWordsCell(char.words, layout.wordCount)
    wordsCell.font = baseFont(style, {
      size: style.words.fontSize,
      color: { argb: hexToArgb(style.words.color) },
    })

    const sentenceCell = row.getCell(layout.sentenceCol)
    const sentence = char.sentences?.[0] ?? ''
    if (sentence) {
      setSentenceHighlightedCell(
        sentenceCell,
        sentence,
        char.char,
        char.words,
        hexToArgb(style.words.color),
        hexToArgb(style.sentence.highlightColor),
        style.sentence.fontSize,
        style.fontFamily
      )
    } else {
      sentenceCell.font = baseFont(style, { size: style.sentence.fontSize })
    }

    row.eachCell((cell) => {
      const col = Number(cell.col)
      const horizontal =
        col === layout.wordsCol || col === layout.sentenceCol ? 'left' : 'center'
      cell.alignment = { ...cell.alignment, horizontal, vertical: 'middle' }
      setCellBorder(cell)
    })
  }

  return startRow + chars.length
}

const EXPAND_GRID_FONT_SIZE = 11
const COLS_PER_LESSON = 3
const GAP_COLS = 1
const MAX_LESSONS_PER_ROW = 5

function getBandTotalCols(lessonCount: number): number {
  if (lessonCount <= 0) return 0
  return lessonCount * COLS_PER_LESSON + (lessonCount - 1) * GAP_COLS
}

function getLessonStartCol(lessonIndexInBand: number): number {
  return lessonIndexInBand * (COLS_PER_LESSON + GAP_COLS) + 1
}

function getCharExpandLessonHeader(workspace: Workspace, lessonNo: string): string {
  const lesson = workspace.catalog.lessons.find((l) => l.lessonNo === lessonNo)
  const label = formatLessonOrdinalLabel(lesson?.lessonNo ?? lessonNo)
  if (lesson?.title) {
    return `${label}、${lesson.title}`
  }
  return `${label}、`
}

function chunkLessons<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function generateCharExpandGrid(workbook: ExcelJS.Workbook, opts: GenerateOptions) {
  const lessonsWithChars = opts.lessonNos
    .map((lessonNo) => ({
      lessonNo,
      chars: getChars(opts.workspace, opts.dataSource, lessonNo),
    }))
    .filter(({ chars }) => chars.length > 0)

  if (lessonsWithChars.length === 0) {
    throw new Error('所选课次均无生字，无法生成生字组词小结')
  }

  const sheet = workbook.addWorksheet('生字组词小结')
  const bands = chunkLessons(lessonsWithChars, MAX_LESSONS_PER_ROW)
  const maxBandCols = Math.max(...bands.map((band) => getBandTotalCols(band.length)))

  sheet.mergeCells(1, 1, 1, maxBandCols)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = opts.workspace.meta.title || '生字组词小结'
  titleCell.font = { size: 14, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }

  let row = 2
  for (let bandIdx = 0; bandIdx < bands.length; bandIdx++) {
    const band = bands[bandIdx]

    band.forEach(({ lessonNo }, idx) => {
      const startCol = getLessonStartCol(idx)
      sheet.mergeCells(row, startCol, row, startCol + COLS_PER_LESSON - 1)
      const headerCell = sheet.getCell(row, startCol)
      headerCell.value = getCharExpandLessonHeader(opts.workspace, lessonNo)
      headerCell.font = { size: 12, bold: true, color: { argb: 'FF0000FF' } }
      headerCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      setCellBorder(headerCell)
    })
    row++

    const contentStartRow = row
    band.forEach(({ chars }, idx) => {
      const startCol = getLessonStartCol(idx)
      let charRow = contentStartRow

      for (const char of chars) {
        writeExpandGridRow1(sheet, charRow, startCol, char)
        writeExpandGridRow2(sheet, charRow + 1, startCol, char)
        charRow += 2
      }
    })

    const maxRowsInBand = Math.max(...band.map(({ chars }) => chars.length * 2), 0)
    row = contentStartRow + maxRowsInBand

    if (bandIdx < bands.length - 1) {
      row += 1
    }
  }

  for (let c = 1; c <= maxBandCols; c++) {
    const posInCycle = ((c - 1) % (COLS_PER_LESSON + GAP_COLS)) + 1
    if (posInCycle === COLS_PER_LESSON + GAP_COLS) {
      sheet.getColumn(c).width = 1.5
    } else if (posInCycle === COLS_PER_LESSON) {
      sheet.getColumn(c).width = 10
    } else {
      sheet.getColumn(c).width = 6
    }
  }
}

function writeExpandGridRow1(
  sheet: ExcelJS.Worksheet,
  row: number,
  startCol: number,
  char: CharacterItem
) {
  const pinyinCell = sheet.getCell(row, startCol)
  pinyinCell.value = char.pinyin ?? ''
  pinyinCell.font = { size: EXPAND_GRID_FONT_SIZE, color: { argb: 'FFFF0000' } }

  const orderCell = sheet.getCell(row, startCol + 1)
  orderCell.value = char.phoneticOrder ?? ''
  orderCell.font = { size: EXPAND_GRID_FONT_SIZE, color: { argb: 'FF800080' } }

  const word1Cell = sheet.getCell(row, startCol + 2)
  const word1 = char.words?.[0] ?? ''
  if (word1) {
    setHighlightedCell(word1Cell, word1, char.char, 'FF000080', 'FFFF0000', EXPAND_GRID_FONT_SIZE)
  }

  for (let col = startCol; col < startCol + COLS_PER_LESSON; col++) {
    const cell = sheet.getCell(row, col)
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    setCellBorder(cell)
  }
}

function writeExpandGridRow2(
  sheet: ExcelJS.Worksheet,
  row: number,
  startCol: number,
  char: CharacterItem
) {
  const structureCell = sheet.getCell(row, startCol)
  structureCell.value = char.structure ?? ''
  structureCell.font = { size: EXPAND_GRID_FONT_SIZE, color: { argb: 'FF0070C0' } }

  const radicalCell = sheet.getCell(row, startCol + 1)
  radicalCell.value = char.radical ?? ''
  radicalCell.font = { size: EXPAND_GRID_FONT_SIZE, color: { argb: 'FF008000' } }

  const word2Cell = sheet.getCell(row, startCol + 2)
  const word2 = char.words?.[1] ?? ''
  if (word2) {
    setHighlightedCell(word2Cell, word2, char.char, 'FF000080', 'FFFF0000', EXPAND_GRID_FONT_SIZE)
  }

  for (let col = startCol; col < startCol + COLS_PER_LESSON; col++) {
    const cell = sheet.getCell(row, col)
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    setCellBorder(cell)
  }
}

const PINYIN_WORD_KAITI = '华文楷体'
const PINYIN_WORD_FONT_SIZE = 12
const PINYIN_WORD_COLS_PER_CHAR = 2
/** 每行最多排几个生字（每个生字占两列） */
const PINYIN_WORD_CHARS_PER_ROW = 5

function getPinyinWordGridTitle(opts: GenerateOptions): string {
  if (opts.workspace.meta.title) return opts.workspace.meta.title
  return opts.dataSource === 'reading' ? '识字表' : '生字表'
}

async function generateCharPinyinWordGrid(workbook: ExcelJS.Workbook, opts: GenerateOptions) {
  console.log(44)
  const lessonsWithChars = opts.lessonNos
    .map((lessonNo) => ({
      lessonNo,
      chars: getChars(opts.workspace, opts.dataSource, lessonNo),
    }))
    .filter(({ chars }) => chars.length > 0)

  if (lessonsWithChars.length === 0) {
    throw new Error('所选课次均无生字，无法生成生字表/识字表')
  }

  const maxCharsInRow = Math.min(
    PINYIN_WORD_CHARS_PER_ROW,
    Math.max(...lessonsWithChars.map(({ chars }) => chars.length))
  )
  const maxCols = maxCharsInRow * PINYIN_WORD_COLS_PER_CHAR
  const sheet = workbook.addWorksheet(opts.dataSource === 'reading' ? '识字表' : '生字表')
  sheet.properties.defaultRowHeight = 22

  let row = 1
  sheet.mergeCells(row, 1, row, maxCols)
  const titleCell = sheet.getCell(row, 1)
  titleCell.value = getPinyinWordGridTitle(opts)
  titleCell.font = { name: PINYIN_WORD_KAITI, size: 16, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  row += 2

  for (const { lessonNo, chars } of lessonsWithChars) {
    if (maxCols > 1) {
      sheet.mergeCells(row, 1, row, maxCols)
    }
    const headerCell = sheet.getCell(row, 1)
    headerCell.value = getLessonTitle(opts.workspace, lessonNo)
    headerCell.font = { name: PINYIN_WORD_KAITI, size: 14, bold: true }
    headerCell.alignment = { horizontal: 'left', vertical: 'middle' }
    row++

    const bands = chunkLessons(chars, PINYIN_WORD_CHARS_PER_ROW)
    for (const band of bands) {
      band.forEach((char, idx) => {
        writePinyinWordCharBlock(sheet, row, idx * PINYIN_WORD_COLS_PER_CHAR + 1, char)
      })
      row += 2
    }
    row++
  }

  for (let c = 1; c <= maxCols; c++) {
    sheet.getColumn(c).width = 12
  }
}

function writePinyinWordCharBlock(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  char: CharacterItem
) {
  const words = (char.words ?? []).map((w) => w.trim()).filter((w) => w.length > 0)
  const word1 = words[0] ?? ''
  const word2 = words[1] ?? ''
  const word3 = words[2] ?? ''

  const pinyinCell = sheet.getCell(startRow, startCol)
  pinyinCell.value = char.pinyin ?? ''
  pinyinCell.font = { name: PINYIN_WORD_KAITI, size: PINYIN_WORD_FONT_SIZE }

  const word1Cell = sheet.getCell(startRow, startCol + 1)
  if (word1) {
    setHighlightedCell(
      word1Cell,
      word1,
      char.char,
      'FF000000',
      'FFFF0000',
      PINYIN_WORD_FONT_SIZE,
      PINYIN_WORD_KAITI
    )
  }

  const word2Cell = sheet.getCell(startRow + 1, startCol)
  if (word2) {
    setHighlightedCell(
      word2Cell,
      word2,
      char.char,
      'FF000000',
      'FFFF0000',
      PINYIN_WORD_FONT_SIZE,
      PINYIN_WORD_KAITI
    )
  }

  const word3Cell = sheet.getCell(startRow + 1, startCol + 1)
  if (word3) {
    setHighlightedCell(
      word3Cell,
      word3,
      char.char,
      'FF000000',
      'FFFF0000',
      PINYIN_WORD_FONT_SIZE,
      PINYIN_WORD_KAITI
    )
  }

  for (let r = startRow; r <= startRow + 1; r++) {
    for (let c = startCol; c <= startCol + 1; c++) {
      const cell = sheet.getCell(r, c)
      const isRichText =
        cell.value !== null &&
        typeof cell.value === 'object' &&
        'richText' in cell.value
      if (!isRichText) {
        cell.font = { name: PINYIN_WORD_KAITI, size: PINYIN_WORD_FONT_SIZE }
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      setCellBorder(cell)
    }
  }
}
