import type ExcelJS from 'exceljs'

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

export function setCellBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  }
}
