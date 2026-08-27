import {
  AlignmentType,
  convertMillimetersToTwip,
  Document,
  LineRuleType,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
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
    case 'standalone-list-word':
      return packDocument(buildStandaloneListDoc(opts), getStandaloneDocTitle(opts))
    case 'combined-list-word':
      return packDocument(buildCombinedListDoc(opts), getCombinedDocTitle(opts.workspace))
    default:
      throw new Error(`未知 Word 模板: ${opts.templateId}`)
  }
}

async function packDocument(children: Paragraph[], title: string): Promise<ArrayBuffer> {
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
            },
            margin: {
              top: convertMillimetersToTwip(25.4),
              bottom: convertMillimetersToTwip(25.4),
              left: convertMillimetersToTwip(31.8),
              right: convertMillimetersToTwip(31.8),
            },
          },
        },
        children,
      },
    ],
  })
  return Packer.toArrayBuffer(doc)
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
