# 语文教材工具

小学语文教材图片解析、AI 字段拓展、Excel 模板导出工具。

## 功能

1. **上传识别** — 上传目录 / 写字表 / 识字表 / 词语表图片，OpenAI Vision OCR 识别；同页可表格/JSON 编辑，并对三表做 AI 拓展（读音、音序、部首、结构、组词、造句）
2. **生成文件** — 内置 3 种模板（组词课课贴、组词造句本、综合课表）+ 自定义模板上传

工作区内导航为两步：`上传识别` → `生成文件`。

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

## 部署（GitHub Pages）

源码分支 `main` 只保留源码，**不提交** `dist/` 和 `node_modules/`。

推送到 `main` 后，GitHub Actions（`.github/workflows/deploy.yml`）会自动：

1. `npm ci` 安装依赖
2. `npm run build` 构建
3. 将 `dist/` 发布到 `gh-pages` 分支

访问地址：`https://<username>.github.io/word/`（Vite `base` 为 `/word/`）

手动触发：GitHub 仓库 → Actions → Deploy to GitHub Pages → Run workflow

**Pages 设置**：仓库 Settings → Pages → Source 选 `Deploy from a branch`，Branch 选 `gh-pages` / `/ (root)`。

