import {
  AlignmentType,
  BorderStyle,
  convertMillimetersToTwip,
  Document,
  HeightRule,
  LineRuleType,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import type { FileChild } from 'docx'
import type { CharacterItem, DataSourceType, WordItem, Workspace } from '@/types'
import { isLessonSlotChar, isLessonSlotWord } from '@/services/dataMerger'
import {
  cnOrdinal,
  formatLessonOrdinalLabel,
  isGardenLessonNo,
  isGardenTitle,
  normalizeLessonNo,
  parseLessonNoParts,
} from '@/services/lessonNoUtils'
import { getWorkspaceDisplayName } from '@/utils/exportName'

interface GenerateOptions {
  templateId: string
  workspace: Workspace
  dataSource: DataSourceType
  lessonNos: string[]
}

const LESSON_TITLE_COLOR = '0070C0'
const LESSON_TITLE_SIZE = 40 // 20pt
const DOC_TITLE_SIZE = 36 // 18pt
const BODY_SIZE = 36 // 三表合并内容 小二 18pt
const STANDALONE_SIZE = 40 // 独立表标题 20pt
const STANDALONE_BODY_SIZE = 36 // 独立表字词 小二 18pt
const TWO_WORD_STICKER_TITLE_SIZE = 32 // 16pt
const TWO_WORD_STICKER_LESSON_SIZE = 28 // 14pt
const TWO_WORD_STICKER_BODY_SIZE = 24 // 12pt
const TWO_WORD_STICKER_PAGE_WIDTH_MM = 297
const TWO_WORD_STICKER_PAGE_MARGIN_MM = 10
const TWO_WORD_STICKER_MAX_CELL_WIDTH_MM = 20
/** 字词之间空一格（全角，约一个汉字格子） */
const GRID_SPACE = '\u3000'
const TABLE_NAME_PREFIX_RE = /^(写字表|生字表|识字表|词语表)\s*/
const NO_INDENT = { left: 0, firstLine: 0, firstLineChars: 0 } as const
/** 1.3 倍行距，无段前段后（240 = 单倍，312 = 1.3 倍） */
const LINE_SPACING_130 = {
  before: 0,
  after: 0,
  line: 312,
  lineRule: LineRuleType.AUTO,
} as const

const KAITI_FONT = {
  ascii: '华文楷体',
  eastAsia: '华文楷体',
  hAnsi: '华文楷体',
  hint: 'eastAsia',
} as const

const SONG_FONT = {
  ascii: '宋体',
  eastAsia: '宋体',
  hAnsi: '宋体',
  hint: 'eastAsia',
} as const

const HEITI_FONT = {
  ascii: '黑体',
  eastAsia: '黑体',
  hAnsi: '黑体',
  hint: 'eastAsia',
} as const

const TABLE_TITLE_SUFFIX: Record<Exclude<DataSourceType, 'combined'>, string> = {
  writing: '生字表',
  reading: '识字表',
  vocabulary: '词语表',
}

export async function generateBuiltinWord(opts: GenerateOptions): Promise<ArrayBuffer> {
  switch (opts.templateId) {
    case 'char-two-word-sticker-word':
      return packDocument(buildTwoWordStickerDoc(opts), getTwoWordStickerDocTitle(opts), {
        landscape: true,
        marginMm: TWO_WORD_STICKER_PAGE_MARGIN_MM,
      })
    case 'standalone-list-word':
      return packDocument(buildStandaloneListDoc(opts), getStandaloneDocTitle(opts))
    case 'combined-list-word':
      return packDocument(buildCombinedListDoc(opts), getCombinedDocTitle(opts.workspace))
    default:
      throw new Error(`未知 Word 模板: ${opts.templateId}`)
  }
}

interface DocumentLayout {
  landscape?: boolean
  marginMm?: number
}

async function packDocument(
  children: readonly FileChild[],
  title: string,
  layout: DocumentLayout = {}
): Promise<ArrayBuffer> {
  const landscape = layout.landscape ?? false
  const margin = layout.marginMm === undefined
    ? {
        top: convertMillimetersToTwip(25.4),
        bottom: convertMillimetersToTwip(25.4),
        left: convertMillimetersToTwip(31.8),
        right: convertMillimetersToTwip(31.8),
      }
    : {
        top: convertMillimetersToTwip(layout.marginMm),
        bottom: convertMillimetersToTwip(layout.marginMm),
        left: convertMillimetersToTwip(layout.marginMm),
        right: convertMillimetersToTwip(layout.marginMm),
      }

  const doc = new Document({
    title,
    creator: '语文教材工具',
    styles: {
      default: {
        document: {
          run: {
            font: '宋体',
            size: BODY_SIZE,
          },
          paragraph: {
            indent: NO_INDENT,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
              orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin,
          },
        },
        children,
      },
    ],
  })
  return Packer.toArrayBuffer(doc)
}

function getTwoWordStickerDocTitle(opts: GenerateOptions): string {
  return opts.workspace.meta.title || '两个词课课贴'
}

function buildTwoWordStickerDoc(opts: GenerateOptions): FileChild[] {
  const lessonsWithChars = opts.lessonNos
    .map((lessonNo) => ({
      lessonNo,
      chars: getTwoWordStickerChars(opts.workspace, opts.dataSource, lessonNo),
    }))
    .filter(({ chars }) => chars.length > 0)

  if (lessonsWithChars.length === 0) {
    throw new Error('所选课次均无生字，无法生成两个词课贴')
  }

  const maxCharsInRow = Math.max(...lessonsWithChars.map(({ chars }) => chars.length))
  const availableWidth = convertMillimetersToTwip(
    TWO_WORD_STICKER_PAGE_WIDTH_MM - TWO_WORD_STICKER_PAGE_MARGIN_MM * 2
  )
  const maxCellWidth = convertMillimetersToTwip(TWO_WORD_STICKER_MAX_CELL_WIDTH_MM)
  const cellWidth = Math.min(maxCellWidth, Math.floor(availableWidth / maxCharsInRow))
  const children: FileChild[] = [createTwoWordStickerTitle(getTwoWordStickerDocTitle(opts))]

  lessonsWithChars.forEach(({ lessonNo, chars }, lessonIndex) => {
    children.push(
      createTwoWordStickerLessonTitle(
        getCombinedLessonHeader(opts.workspace, lessonNo),
        lessonIndex > 0
      ),
      createTwoWordStickerTable(chars, cellWidth)
    )
  })

  return children
}

function createTwoWordStickerTitle(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    indent: NO_INDENT,
    spacing: { before: 0, after: 200 },
    children: [
      new TextRun({
        text,
        font: SONG_FONT,
        size: TWO_WORD_STICKER_TITLE_SIZE,
        bold: true,
        snapToGrid: false,
      }),
    ],
  })
}

function createTwoWordStickerLessonTitle(text: string, hasPreviousLesson: boolean): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: NO_INDENT,
    spacing: { before: hasPreviousLesson ? 240 : 0, after: 80 },
    keepNext: true,
    children: [
      new TextRun({
        text,
        font: SONG_FONT,
        size: TWO_WORD_STICKER_LESSON_SIZE,
        bold: true,
        color: '0000FF',
        snapToGrid: false,
      }),
    ],
  })
}

function createTwoWordStickerTable(chars: CharacterItem[], cellWidth: number): Table {
  const border = { style: BorderStyle.SINGLE, size: 8, color: '000000' } as const
  const rows = [0, 1].map(
    (wordIndex) =>
      new TableRow({
        cantSplit: true,
        height: {
          value: convertMillimetersToTwip(9),
          rule: HeightRule.ATLEAST,
        },
        children: chars.map((char) => {
          const words = char.words ?? []
          const text = wordIndex === 0 ? (words[0] ?? char.char) : (words[1] ?? '')
          return createTwoWordStickerCell(text, char.char, cellWidth)
        }),
      })
  )

  return new Table({
    rows,
    width: { size: cellWidth * chars.length, type: WidthType.DXA },
    columnWidths: chars.map(() => cellWidth),
    indent: { size: 0, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.LEFT,
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
  })
}

function createTwoWordStickerCell(
  text: string,
  targetChar: string,
  cellWidth: number
): TableCell {
  const runs = [...text].map(
    (char) =>
      new TextRun({
        text: char,
        font: SONG_FONT,
        size: TWO_WORD_STICKER_BODY_SIZE,
        color: char === targetChar ? 'FF0000' : '000000',
        snapToGrid: false,
      })
  )

  return new TableCell({
    width: { size: cellWidth, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        indent: NO_INDENT,
        spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
        children: runs.length > 0 ? runs : [new TextRun({ text: '' })],
      }),
    ],
  })
}

function getStandaloneDocTitle(opts: GenerateOptions): string {
  if (opts.dataSource === 'combined') {
    throw new Error('独立表模板请选择写字表、识字表或词语表')
  }
  return `${getWorkspaceDisplayName(opts.workspace.meta)}${TABLE_TITLE_SUFFIX[opts.dataSource]}`
}

function getCombinedDocTitle(workspace: Workspace): string {
  return `${getWorkspaceDisplayName(workspace.meta)}三表`
}

function buildStandaloneListDoc(opts: GenerateOptions): Paragraph[] {
  const title = getStandaloneDocTitle(opts)
  const children: Paragraph[] = [createStandaloneDocTitle(title)]

  let hasContent = false
  for (const lessonNo of opts.lessonNos) {
    const items = getStandaloneItems(opts.workspace, opts.dataSource, lessonNo)
    if (items.length === 0) continue
    hasContent = true
    children.push(createStandaloneLessonTitle(getIndependentLessonHeader(opts.workspace, lessonNo)))
    children.push(createStandaloneBodyLine(items.join(GRID_SPACE)))
  }

  if (!hasContent) {
    throw new Error('所选课次均无内容，无法生成独立表')
  }

  return children
}

function buildCombinedListDoc(opts: GenerateOptions): Paragraph[] {
  const title = getCombinedDocTitle(opts.workspace)
  const children: Paragraph[] = [createDocTitle(title)]

  let hasContent = false
  for (const lessonNo of opts.lessonNos) {
    const writing = getWritingChars(opts.workspace, lessonNo).map((c) => c.char)
    const reading = getReadingChars(opts.workspace, lessonNo).map((c) => c.char)
    const vocab = getLessonVocab(opts.workspace, lessonNo).map((v) => v.word)
    if (writing.length === 0 && reading.length === 0 && vocab.length === 0) continue

    hasContent = true
    children.push(createLessonTitle(getCombinedLessonHeader(opts.workspace, lessonNo)))
    children.push(createBodyLine('生字：'))
    children.push(createBodyLine(writing.join(GRID_SPACE)))
    children.push(createBodyLine('识字：'))
    children.push(createBodyLine(reading.join(GRID_SPACE)))
    children.push(createBodyLine('词语：'))
    children.push(createBodyLine(vocab.join(GRID_SPACE)))
    children.push(createBlankLine())
  }

  if (!hasContent) {
    throw new Error('所选课次均无内容，无法生成三表合并表')
  }

  return children
}

function createDocTitle(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    indent: NO_INDENT,
    spacing: LINE_SPACING_130,
    children: [
      new TextRun({
        text,
        font: HEITI_FONT,
        size: DOC_TITLE_SIZE,
        bold: true,
        snapToGrid: false,
      }),
    ],
  })
}

function createStandaloneDocTitle(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    indent: NO_INDENT,
    spacing: LINE_SPACING_130,
    children: [
      new TextRun({
        text,
        font: HEITI_FONT,
        size: STANDALONE_SIZE,
        bold: true,
        snapToGrid: false,
      }),
    ],
  })
}

function createStandaloneLessonTitle(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: NO_INDENT,
    spacing: LINE_SPACING_130,
    children: [
      new TextRun({
        text,
        font: KAITI_FONT,
        size: STANDALONE_SIZE,
        color: LESSON_TITLE_COLOR,
        snapToGrid: false,
      }),
    ],
  })
}

function createStandaloneBodyLine(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: NO_INDENT,
    spacing: LINE_SPACING_130,
    children: [
      new TextRun({
        text,
        font: SONG_FONT,
        size: STANDALONE_BODY_SIZE,
        snapToGrid: false,
      }),
    ],
  })
}

function createLessonTitle(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: NO_INDENT,
    spacing: LINE_SPACING_130,
    children: [
      new TextRun({
        text,
        font: KAITI_FONT,
        size: LESSON_TITLE_SIZE,
        color: LESSON_TITLE_COLOR,
        snapToGrid: false,
      }),
    ],
  })
}

function createBodyLine(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: NO_INDENT,
    spacing: LINE_SPACING_130,
    children: [
      new TextRun({
        text,
        font: SONG_FONT,
        size: BODY_SIZE,
        snapToGrid: false,
      }),
    ],
  })
}

function createBlankLine(): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: NO_INDENT,
    spacing: LINE_SPACING_130,
    children: [new TextRun({ text: '', snapToGrid: false })],
  })
}

/** 独立表课标题：第N课 + 课文名，不加识字/阅读/生字表等前缀 */
function getIndependentLessonHeader(workspace: Workspace, lessonNo: string): string {
  const lesson = workspace.catalog.lessons.find((l) => l.lessonNo === lessonNo)
  const title = stripTableNamePrefix(lesson?.title?.trim() ?? '')
  const rawNo = lesson?.lessonNo ?? lessonNo
  const parts = parseLessonNoParts(rawNo)

  if (parts?.isGarden || isGardenLessonNo(rawNo) || isGardenTitle(title)) {
    if (title) return title
    return parts ? `语文园地${cnOrdinal(parts.number)}` : '语文园地'
  }

  const label = parts ? `第${parts.number}课` : formatLessonOrdinalLabel(rawNo)
  return title ? `${label} ${title}` : label
}

function stripTableNamePrefix(title: string): string {
  return title.replace(TABLE_NAME_PREFIX_RE, '')
}

/** 图2：课标题为「第1课 课文名」 */
function getCombinedLessonHeader(workspace: Workspace, lessonNo: string): string {
  const lesson = workspace.catalog.lessons.find((l) => l.lessonNo === lessonNo)
  const label = formatLessonOrdinalLabel(lesson?.lessonNo ?? lessonNo)
  const title = lesson?.title?.trim() ?? ''
  return title ? `${label} ${title}` : label
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

function getTwoWordStickerChars(
  workspace: Workspace,
  dataSource: DataSourceType,
  lessonNo: string
): CharacterItem[] {
  if (dataSource === 'writing') return getWritingChars(workspace, lessonNo)
  if (dataSource === 'reading') return getReadingChars(workspace, lessonNo)
  return []
}

function getLessonVocab(workspace: Workspace, lessonNo: string): WordItem[] {
  const no = normalizeLessonNo(lessonNo)
  return workspace.vocabulary.filter((v) => normalizeLessonNo(v.lessonNo) === no && isRealWord(v))
}

function getStandaloneItems(
  workspace: Workspace,
  dataSource: DataSourceType,
  lessonNo: string
): string[] {
  if (dataSource === 'writing') {
    return getWritingChars(workspace, lessonNo).map((c) => c.char)
  }
  if (dataSource === 'reading') {
    return getReadingChars(workspace, lessonNo).map((c) => c.char)
  }
  if (dataSource === 'vocabulary') {
    return getLessonVocab(workspace, lessonNo).map((v) => v.word)
  }
  return []
}
