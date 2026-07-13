import type { BuiltinTemplateConfig } from '@/types'

export const BUILTIN_TEMPLATES: BuiltinTemplateConfig[] = [
  {
    id: 'char-word-sticker',
    name: '组词课课贴',
    description: '按课次排列，每课生字一行排开，两个组词各占一行独立单元格，无生字课次不输出，目标字红色高亮，字号12',
    category: '识字表/写字表',
    dataSource: ['writing', 'reading'],
    options: { wordCount: 2 },
  },
  {
    id: 'char-word-sentence-book',
    name: '生字组词造句本',
    description: '每字一行：红色生字、黑色组词、绿色造句（带下划线）',
    category: '识字表/写字表',
    dataSource: ['writing', 'reading'],
    options: { wordCount: 3, sentenceCount: 1 },
  },
  {
    id: 'lesson-summary-table',
    name: '综合课表',
    description: '写字表+识字表+词语表三合一，含读音/音序/部首/结构/组词/造句，全部课次合并在一个 sheet，组词以竖线分隔合并为一列，可在模板管理中配置字体、颜色与组词数量（默认3个）',
    category: '三表合并',
    dataSource: ['combined'],
    options: { wordCount: 3 },
  },
  {
    id: 'char-expand-grid',
    name: '生字组词小结',
    description: '按课次横向排列（每行最多5课，课间空一列），每字两行三列：拼音/音序/组词 + 结构/部首/组词，含课文标题，组词内目标字红色高亮',
    category: '识字表/写字表',
    dataSource: ['writing', 'reading'],
    options: { wordCount: 2 },
  },
]
