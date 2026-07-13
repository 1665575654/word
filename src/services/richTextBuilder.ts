import type ExcelJS from 'exceljs'

type HighlightRange = { start: number; end: number }

function findWordHighlightRanges(text: string, words: string[]): HighlightRange[] {
  const candidates = [...new Set(words.filter((w) => w && text.includes(w)))].sort(
    (a, b) => b.length - a.length
  )
  if (candidates.length === 0) return []

  const used = new Set<number>()
  const ranges: HighlightRange[] = []

  for (const word of candidates) {
    let searchFrom = 0
    while (searchFrom <= text.length - word.length) {
      const idx = text.indexOf(word, searchFrom)
      if (idx === -1) break

      const end = idx + word.length
      let overlaps = false
      for (let i = idx; i < end; i++) {
        if (used.has(i)) {
          overlaps = true
          break
        }
      }

      if (!overlaps) {
        for (let i = idx; i < end; i++) used.add(i)
        ranges.push({ start: idx, end })
      }
      searchFrom = idx + 1
    }
  }

  return ranges
}

function isIndexHighlighted(index: number, ranges: HighlightRange[]): boolean {
  return ranges.some((r) => index >= r.start && index < r.end)
}

/** 造句高亮：优先标亮组词；句中无组词时才仅标目标字 */
export function buildSentenceHighlightedText(
  text: string,
  targetChar: string,
  words: string[] | undefined,
  defaultColor = 'FF000000',
  highlightColor = 'FFFF0000',
  fontSize?: number,
  fontName?: string
): ExcelJS.RichText[] {
  const wordRanges = findWordHighlightRanges(text, words ?? [])
  if (wordRanges.length === 0) {
    return buildHighlightedText(text, targetChar, defaultColor, highlightColor, fontSize, fontName)
  }

  return [...text].map((ch, index) => ({
    text: ch,
    font: {
      ...(fontName ? { name: fontName } : {}),
      ...(fontSize !== undefined ? { size: fontSize } : {}),
      color: { argb: isIndexHighlighted(index, wordRanges) ? highlightColor : defaultColor },
    },
  }))
}

export function buildHighlightedText(
  text: string,
  targetChar: string,
  defaultColor = 'FF000000',
  highlightColor = 'FFFF0000',
  fontSize?: number,
  fontName?: string
): ExcelJS.RichText[] {
  return [...text].map((ch) => ({
    text: ch,
    font: {
      ...(fontName ? { name: fontName } : {}),
      ...(fontSize !== undefined ? { size: fontSize } : {}),
      color: { argb: ch === targetChar ? highlightColor : defaultColor },
    },
  }))
}

export function setHighlightedCell(
  cell: ExcelJS.Cell,
  text: string,
  targetChar: string,
  defaultColor = 'FF000000',
  highlightColor = 'FFFF0000',
  fontSize?: number,
  fontName?: string
) {
  cell.value = {
    richText: buildHighlightedText(text, targetChar, defaultColor, highlightColor, fontSize, fontName),
  }
}

export function setSentenceHighlightedCell(
  cell: ExcelJS.Cell,
  text: string,
  targetChar: string,
  words: string[] | undefined,
  defaultColor = 'FF000000',
  highlightColor = 'FFFF0000',
  fontSize?: number,
  fontName?: string
) {
  cell.value = {
    richText: buildSentenceHighlightedText(
      text,
      targetChar,
      words,
      defaultColor,
      highlightColor,
      fontSize,
      fontName
    ),
  }
}

export function setCellBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  }
}
