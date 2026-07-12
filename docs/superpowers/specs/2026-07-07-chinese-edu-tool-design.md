# 小学语文教材工具 — 设计规格

> 版本 1.0 | 2026-07-07

## 概述

纯前端 Vue3 应用，帮助小学语文教师从教材图片中提取生字/词语，经 OpenAI 拓展教学字段，再按模板生成 Excel 教学资料。

## 技术决策

| 决策项 | 选择 |
|--------|------|
| 部署 | 纯前端 + 用户自填 OpenAI API Key |
| 框架 | Vue 3 + TypeScript + Vite |
| UI | Ant Design Vue 4.x |
| 状态 | Pinia + IndexedDB |
| OCR | OpenAI Vision (gpt-4o) |
| AI 拓展 | OpenAI Chat (gpt-4o-mini) |
| Excel | ExcelJS (浏览器端) |
| 模板 | 3 个内置 + 自定义占位符上传 |

## 三步工作流

### Step 1: 图片解析

- 上传：目录、写字表、识字表、词语表（分类 Tab）
- OCR：OpenAI Vision 识别 → 结构化 JSON
- 编辑：可编辑表格修正 OCR 错误
- 导入/导出：`.jwdata` (type: `parsed`)

### Step 2: AI 拓展

- 写字表/识字表：读音、音序、部首、结构、组词、造句
- 词语表：拓展组词、造句
- 配置：组词数（默认2）、造句数（默认1）
- 音序本地计算（pinyin-pro），减少 AI 调用
- 多音字分行展示
- 导入/导出：`.jwdata` (type: `expanded`)

### Step 3: Excel 生成

- 选择数据源、课次、模板
- 内置模板或自定义模板
- 下载 .xlsx

## 数据模型

```typescript
interface Workspace {
  id: string;
  name: string;
  meta: { grade: string; title: string; createdAt: string; updatedAt: string };
  catalog: { lessons: LessonMeta[] };
  writingChars: CharacterItem[];
  readingChars: CharacterItem[];
  vocabulary: WordItem[];
  expandConfig: ExpandConfig;
  stage: 'parsed' | 'expanded';
}

interface LessonMeta { lessonNo: number; title: string; }

interface CharacterItem {
  char: string;
  lessonNo: number;
  pinyin?: string;
  phoneticOrder?: string;
  radical?: string;
  structure?: string;
  words?: string[];
  sentences?: string[];
  readings?: Array<{
    pinyin: string;
    phoneticOrder: string;
    words: string[];
    sentences: string[];
  }>;
}

interface WordItem {
  word: string;
  lessonNo: number;
  relatedWords?: string[];
  sentences?: string[];
}

interface ExpandConfig {
  wordCount: number;      // 默认 2
  sentenceCount: number;  // 默认 1
  charFields: string[];   // 拓展字段勾选
}
```

## 内置模板

### 1. 组词课课贴 (char-word-sticker)

- 数据源：写字表/识字表
- 按课次分段，蓝色标题行
- 网格布局，每字一格，上下两行组词
- 目标字在组词中红色高亮
- 默认每行 7 列

### 2. 生字组词造句本 (char-word-sentence-book)

- 数据源：写字表/识字表
- 每字一行：红色生字 | 黑色组词 | 绿色造句（下划线）
- 组词/造句数量可配置

### 3. 综合课表 (lesson-summary-table)

- 数据源：三表合并
- 写字表/识字表/词语表分区
- 列：生字、读音、音序、部首、结构、组词×2、造句
- 多音字分行，造句中目标字红色

## 自定义模板

- 上传 .xlsx，单元格内写 Mustache 风格占位符
- 支持 `:red` `:green` 颜色修饰符
- 支持 `{{#chars}}...{{/chars}}` 循环区域
- 扫描占位符 → 自动映射 → 保存 IndexedDB

## 页面路由

```
/                     工作区列表
/settings             API Key 与默认配置
/workspace/:id/parse  Step 1
/workspace/:id/expand Step 2
/workspace/:id/export Step 3
/templates            模板管理
```

## 安全与成本

- API Key 存 localStorage，仅个人使用
- 图片压缩（最长边 ≤ 1500px）再送 Vision
- 拓展用 gpt-4o-mini，已拓展项跳过
- 支持自定义 OpenAI Base URL（代理）
