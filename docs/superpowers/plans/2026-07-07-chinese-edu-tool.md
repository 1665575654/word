# 语文教材工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建纯前端 Vue3 应用，实现教材图片 OCR 解析 → OpenAI 字段拓展 → Excel 模板导出三步流水线。

**Architecture:** Vue3 + Pinia + IndexedDB 管理状态；OpenAI Vision/Chat 直接浏览器调用（用户 API Key）；ExcelJS 生成内置模板 Excel；自定义模板通过占位符填充。

**Tech Stack:** Vue 3, TypeScript, Vite, Ant Design Vue, Pinia, OpenAI SDK, ExcelJS, pinyin-pro, idb, file-saver

**Design Spec:** `docs/superpowers/specs/2026-07-07-chinese-edu-tool-design.md`

---

## 当前进度

- [x] P1: 项目脚手架、类型定义、Pinia stores、路由、页面骨架
- [x] P1: .jwdata 导入导出 + IndexedDB
- [x] P1: 设置页 API Key 配置
- [x] P2: OpenAI Vision OCR 服务（基础版）
- [x] P3: AI 拓展服务（批量 + 音序本地计算）
- [x] P4: 三个内置 Excel 模板生成器
- [ ] P2: 解析结果可编辑表格（行内编辑、增删）
- [ ] P2: 目录与课次自动关联校验
- [ ] P3: 拓展结果逐条编辑 + 单条重试
- [ ] P4: 模板预览缩略图
- [ ] P5: 自定义模板占位符填充引擎
- [ ] P5: 批量生成全部模板 ZIP 下载

---

## Phase 2 剩余任务

### Task 1: 可编辑解析结果表格

**Files:**
- Create: `src/components/table/EditableCharTable.vue`
- Create: `src/components/table/EditableVocabTable.vue`
- Modify: `src/views/step1/ParseView.vue`

- [ ] **Step 1:** 创建 EditableCharTable，支持行内编辑 char/lessonNo、新增行、删除行
- [ ] **Step 2:** 创建 EditableVocabTable，支持词语编辑
- [ ] **Step 3:** ParseView 替换只读 a-table 为可编辑组件
- [ ] **Step 4:** 编辑后自动调用 workspaceStore.update 保存

### Task 2: 课次关联校验

**Files:**
- Create: `src/utils/validators.ts`
- Modify: `src/views/step1/ParseView.vue`

- [ ] **Step 1:** 实现 validateLessonRefs，检查生字/词语的 lessonNo 是否在目录中存在
- [ ] **Step 2:** ParseView 底部展示校验警告（未匹配课次标黄）

---

## Phase 3 剩余任务

### Task 3: 拓展结果编辑

**Files:**
- Create: `src/components/expand/ExpandResultTable.vue`
- Modify: `src/views/step2/ExpandView.vue`

- [ ] **Step 1:** ExpandResultTable 展示完整拓展数据，支持编辑 words/sentences 数组
- [ ] **Step 2:** 添加「单条重试」按钮，对单字重新调用 aiExpander
- [ ] **Step 3:** 编辑后保存到 workspaceStore

---

## Phase 5 任务

### Task 4: 自定义模板填充引擎

**Files:**
- Create: `src/services/customTemplateEngine.ts`
- Modify: `src/views/step3/ExportView.vue`

- [ ] **Step 1:** 实现占位符解析器，支持 `{{char}}` `{{char:red}}` `{{word1}}` `{{sentence:green}}`
- [ ] **Step 2:** 实现循环区域 `{{#chars}}...{{/chars}}` 展开
- [ ] **Step 3:** ExportView 添加自定义模板选择和生成按钮
- [ ] **Step 4:** 测试用户上传的 xlsx 模板填充

### Task 5: 批量下载

**Files:**
- Modify: `src/views/step3/ExportView.vue`
- Add dependency: `jszip`

- [ ] **Step 1:** 安装 jszip
- [ ] **Step 2:** 实现 generateAllTemplates，遍历所有适用模板生成 ZIP
- [ ] **Step 3:** ExportView 添加「批量生成全部模板」按钮

---

## 运行方式

```bash
npm install
npm run dev      # 开发服务器 http://localhost:5173
npm run build    # 生产构建
```

## 使用流程

1. 设置页填入 OpenAI API Key
2. 新建工作区 → 上传目录/写字表/识字表/词语表图片
3. AI 拓展 → 配置组词造句数量 → 开始拓展
4. 选择模板和课次 → 生成 Excel 下载
