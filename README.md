# 语文教材工具

小学语文教材图片解析、AI 字段拓展、Excel 模板导出工具。

## 功能

1. **图片解析** — 上传目录/写字表/识字表/词语表图片，OpenAI Vision OCR 识别
2. **AI 拓展** — 自动生成读音、音序、部首、结构、组词、造句
3. **Excel 生成** — 内置 3 种模板（组词课课贴、组词造句本、综合课表）+ 自定义模板上传

## 技术栈

Vue 3 + TypeScript + Vite + Ant Design Vue + Pinia + OpenAI + ExcelJS

## 快速开始

```bash
npm install
npm run dev
```

1. 打开终端里 Vite 打印的地址（须含 `/word/` 路径）
2. 进入「设置」页配置 OpenAI API Key
3. 新建工作区，按步骤操作

## 文档

- 设计规格：`docs/superpowers/specs/2026-07-07-chinese-edu-tool-design.md`
- 实现计划：`docs/superpowers/plans/2026-07-07-chinese-edu-tool.md`
