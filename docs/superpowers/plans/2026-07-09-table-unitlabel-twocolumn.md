# 写字/识字/词语表 unitLabel 与左右分栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 写字/识字/词语表识别支持左右分栏阅读顺序、行上单元标识拼成 `阅读-5` 课次，并与目录对齐补齐跳号占位。

**Architecture:** Vision 提示词约束分栏顺序与 `unitLabel` 输出；`mapGroupedCharLessons` / `mapGroupedWordLessons` 用 `formatPrefixedLessonNo` 映射课次并继承标识；跳号占位沿用现有 `alignCharsWithCatalog` / `alignWordsWithCatalog`（merge 路径已调用）。

**Tech Stack:** TypeScript, Vue 3, 现有 `ocrParser` / `tableOcrParser` / `lessonNoUtils` / `dataMerger`

**Design Spec:** `docs/superpowers/specs/2026-07-09-table-unitlabel-twocolumn-design.md`

**Note:** 仓库无单元测试框架；各 Task 用 `npm run build`（含 `vue-tsc`）做类型验收，并用下方「验收片段」在 Node/浏览器控制台或临时脚本中核对纯函数行为。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `src/services/ocrParser.ts` | 三类表 Vision 提示词：分栏、`unitLabel`、跳号 |
| `src/services/lessonNoUtils.ts` | 可选：`findCatalogLessonNoByPrefixed` 精确匹配目录课次 |
| `src/services/tableOcrParser.ts` | `mapGrouped*`：`unitLabel` 继承 + 前缀课次映射 |
| `src/services/dataMerger.ts` | 不改代码；确认 align 与前缀课次兼容（已支持字符串 `lessonNo`） |

---

### Task 1: Vision 提示词增加分栏与 unitLabel

**Files:**
- Modify: `src/services/ocrParser.ts`（`TABLE_LESSON_NO_RULES` 附近、`VISION_PROMPTS.writing/reading/vocabulary`）

- [x] **Step 1: 新增共用规则常量**

在 `TABLE_LESSON_NO_RULES` 之后插入：

```ts
const TABLE_LAYOUT_AND_UNIT_RULES = `页面若左右排布且中间有竖线：须先读完左栏从上到下，再读右栏从上到下，勿按同一横行合并左右栏。
unitLabel：取自该行上方印刷的单元类型标识（如「阅读」「识字」「汉语拼音」）；标识出现后，该行及后续每行均继承同一 unitLabel，直到出现新标识。
lessonNo 仍为行前印刷整数序号；最终课次由后处理拼成「阅读-5」等形式，模型不要直接输出带前缀的课次字符串。
语文园地组无印刷整数序号，title 填「语文园地」，unitLabel 可填「语文园地」。`
```

- [x] **Step 2: 更新三类表 JSON 示例与要求**

将 `writing` / `reading` 提示改为（词语表把 `chars` 换成 `words`）：

```ts
  writing: `识别小学语文写字表，返回 JSON：
{"lessons":[{"index":1,"lessonNo":5,"unitLabel":"阅读","title":"","chars":[{"char":"船"}]}]}
要求：${TABLE_LESSON_NO_RULES} ${TABLE_LAYOUT_AND_UNIT_RULES} ${TABLE_CHAR_CONTENT_RULES} chars 顺序与图片一致。
也接受 {"chars":[{"char":"字","lessonNo":1,"index":1}]}。只返回 JSON。`,

  reading: `识别小学语文识字表，返回 JSON：
{"lessons":[{"index":1,"lessonNo":5,"unitLabel":"阅读","title":"","chars":[{"char":"船"}]}]}
要求：${TABLE_LESSON_NO_RULES} ${TABLE_LAYOUT_AND_UNIT_RULES} ${TABLE_CHAR_CONTENT_RULES} chars 顺序与图片一致。
也接受 {"chars":[{"char":"字","lessonNo":1,"index":1}]}。只返回 JSON。`,

  vocabulary: `识别小学语文词语表，返回 JSON：
{"lessons":[{"index":1,"lessonNo":5,"unitLabel":"阅读","title":"","words":[{"word":"小小的船"}]}]}
要求：${TABLE_LESSON_NO_RULES} ${TABLE_LAYOUT_AND_UNIT_RULES} ${VOCAB_WORD_RULES}
也接受 {"words":[{"word":"词语","lessonNo":1,"index":1}]}。只返回 JSON。`,
```

- [x] **Step 3: 类型检查**

Run: `npm run build`  
Expected: 编译通过（或仅有与本次无关的既有错误）

- [ ] **Step 4: Commit**（仅当用户要求提交时执行）

```bash
git add src/services/ocrParser.ts
git commit -m "feat(ocr): 写字/识字/词语表提示词支持分栏与 unitLabel"
```

---

### Task 2: 目录前缀课次精确匹配工具

**Files:**
- Modify: `src/services/lessonNoUtils.ts`（`nthNonGardenLesson` 附近）

- [x] **Step 1: 新增 `findCatalogLessonNoExact`**

在 `nthNonGardenLesson` 之后添加：

```ts
/** 在目录中精确匹配课次号（如「阅读-5」）；找不到返回空串 */
export function findCatalogLessonNoExact(
  catalog: LessonMeta[],
  lessonNo: string
): string {
  const target = normalizeLessonNo(lessonNo)
  if (!isValidLessonNo(target) || catalog.length === 0) return ''
  const hit = [...catalog]
    .sort((a, b) => a.index - b.index)
    .find((l) => normalizeLessonNo(l.lessonNo) === target)
  return hit ? normalizeLessonNo(hit.lessonNo) : ''
}
```

确保文件顶部已从本模块导出/定义 `normalizeLessonNo`、`isValidLessonNo`（已有）。

- [x] **Step 2: 验收片段**

在临时 Node 环境或 Vite 应用中调用（逻辑预期）：

```ts
findCatalogLessonNoExact(
  [
    { index: 1, lessonNo: '识字-5', title: 'a' },
    { index: 2, lessonNo: '阅读-5', title: 'b' },
  ],
  '阅读-5'
) // → '阅读-5'

findCatalogLessonNoExact(
  [{ index: 1, lessonNo: '阅读-5', title: 'b' }],
  '识字-5'
) // → ''
```

- [ ] **Step 3: Commit**（仅当用户要求提交时执行）

```bash
git add src/services/lessonNoUtils.ts
git commit -m "feat: 增加目录课次精确匹配"
```

---

### Task 3: mapGroupedCharLessons 支持 unitLabel

**Files:**
- Modify: `src/services/tableOcrParser.ts`
  - import：增加 `formatPrefixedLessonNo`、`normalizeUnitLabel`、`findCatalogLessonNoExact`、`isGardenTitle`（若尚未导入）
  - `mapGroupedCharLessons` 及 `createGroupedParseState` / 映射分支

- [x] **Step 1: 扩展 import**

将文件顶部 from `@/services/lessonNoUtils` 的 import 改为包含：

```ts
import {
  formatGardenLessonNo,
  formatIntegerLessonNo,
  formatPrefixedLessonNo,
  findCatalogLessonNoExact,
  inferSequentialPrintedNo,
  isGardenTitle,
  isValidLessonNo,
  normalizeLessonNo,
  normalizeUnitLabel,
  nthNonGardenLesson,
  resolveGroupedPrintedNo,
} from '@/services/lessonNoUtils'
```

（删除未使用的旧符号时保持与文件其余引用一致；`formatGardenLessonNo` 等若本文件未用则不要强行加入。）

- [x] **Step 2: 在 createParseState 增加 currentUnitLabel**

找到 `createParseState`（约 551 行），在返回对象中增加：

```ts
currentUnitLabel: '' as string,
```

- [x] **Step 3: 新增映射辅助函数**

在 `mapNumberedLessonNo` 之后、`isTableTitleLine` 之前插入：

```ts
/** 有 unitLabel 时拼前缀课次并优先精确匹配目录；否则回退印刷序号映射 */
export function mapPrintedWithUnitLabel(
  printedNo: number,
  unitLabel: string,
  gardensSeen: number,
  catalog: LessonMeta[]
): string {
  const label = normalizeUnitLabel(unitLabel)
  if (label && printedNo > 0) {
    const prefixed = formatPrefixedLessonNo(label, printedNo)
    if (catalog.length > 0) {
      const exact = findCatalogLessonNoExact(catalog, prefixed)
      if (exact) return exact
    }
    return prefixed
  }
  return mapNumberedLessonNo(printedNo, gardensSeen, catalog)
}
```

- [x] **Step 4: 改写 mapGroupedCharLessons 课次解析**

将函数签名中 lessons 元素类型扩展为含 `unitLabel?: string`：

```ts
lessons: Array<{ lessonNo?: number; title?: string; unitLabel?: string; chars?: unknown[] }>,
```

在 `for` 循环内、`const resolved = resolveGroupedPrintedNo(lesson)` 之后增加标识解析：

```ts
    const rawUnit = normalizeUnitLabel((lesson as { unitLabel?: string }).unitLabel)
    if (rawUnit) state.currentUnitLabel = rawUnit
    // title 为语文园地时也视为园地（兼容 unitLabel=语文园地）
    const unitIsGarden =
      isGardenTitle(rawUnit || state.currentUnitLabel) ||
      normalizeUnitLabel(state.currentUnitLabel) === '语文园地'
```

将原 `const isGarden = isGardenCatalogTitle(title)` 改为：

```ts
    const isGarden = isGardenCatalogTitle(title) || (!printedNo && unitIsGarden)
```

将 `else if (printedNo > 0)` 分支中的映射改为：

```ts
    } else if (printedNo > 0) {
      printedNo = inferSequentialPrintedNo(state.prevPrintedNo, printedNo)
      lessonNo = mapPrintedWithUnitLabel(
        printedNo,
        state.currentUnitLabel,
        state.gardensSeen,
        catalogLessons
      )
      state.prevPrintedNo = printedNo
      state.currentMappedLessonNo = lessonNo
```

- [x] **Step 5: 验收片段**

```ts
mapGroupedCharLessons(
  [
    { index: 1, lessonNo: 5, unitLabel: '阅读', chars: [{ char: '船' }] },
    { index: 2, lessonNo: 6, chars: [{ char: '月' }] }, // 继承 阅读
  ],
  [
    { index: 1, lessonNo: '识字-5', title: '其他' },
    { index: 2, lessonNo: '阅读-5', title: '小小的船' },
    { index: 3, lessonNo: '阅读-6', title: '下一课' },
  ]
)
// 期望：船 → 阅读-5，月 → 阅读-6
```

- [ ] **Step 6: Commit**（仅当用户要求提交时执行）

```bash
git add src/services/tableOcrParser.ts src/services/lessonNoUtils.ts
git commit -m "feat(table): 分组映射支持 unitLabel 前缀课次"
```

---

### Task 4: mapGroupedWordLessons 与无目录回退路径

**Files:**
- Modify: `src/services/tableOcrParser.ts`（`mapGroupedWordLessons`）
- Modify: `src/services/ocrParser.ts`（`flattenLessonGroupedChars` / `flattenLessonGroupedWords` 无目录分支，若仍被调用）

- [x] **Step 1: 同步改写 mapGroupedWordLessons**

与 Task 3 Step 4 相同逻辑：扩展 `unitLabel`、继承 `currentUnitLabel`、园地判定、`mapPrintedWithUnitLabel` 替换 `mapNumberedLessonNo`。

签名：

```ts
lessons: Array<{ lessonNo?: number; title?: string; unitLabel?: string; words?: unknown[] }>,
```

- [x] **Step 2: 无目录时 flatten 回退也拼前缀（ocrParser.ts）**

在 `flattenLessonGroupedChars` 的无目录循环中：

1. `LessonGroupedRow` 增加 `unitLabel?: string`
2. 维护 `let currentUnitLabel = ''`
3. 每组：`const u = normalizeUnitLabel(lesson.unitLabel); if (u) currentUnitLabel = u`
4. 有印刷序号且非园地时：

```ts
lessonNo = formatPrefixedLessonNo(currentUnitLabel, printedNo)
// 无目录时 formatPrefixedLessonNo 在 label 为空时退回纯数字
```

对 `flattenLessonGroupedWords` 做同样修改。  
需从 `lessonNoUtils` 增加 import：`formatPrefixedLessonNo`、`normalizeUnitLabel`（若尚未导入）。

- [x] **Step 3: 类型检查**

Run: `npm run build`  
Expected: 通过

- [ ] **Step 4: Commit**（仅当用户要求提交时执行）

```bash
git add src/services/tableOcrParser.ts src/services/ocrParser.ts
git commit -m "feat(table): 词语表与无目录路径支持 unitLabel"
```

---

### Task 5: 确认目录补齐与端到端核对

**Files:**
- Read-only 确认: `src/services/dataMerger.ts`（`alignCharsWithCatalog` / `alignWordsWithCatalog`）
- Read-only 确认: `src/views/step2/TablesView.vue`（merge 调用）

- [x] **Step 1: 确认 merge 路径已 align**

`TablesView` / `ImportView` 写入写字/识字/词语时调用 `mergeCharsWithCatalog` / `mergeWordsWithCatalog`。  
`alignCharsWithCatalog` 对目录中缺失课次补 `LESSON_SLOT_CHAR`。  
**无需改代码**，除非发现 merge 未传 `catalogLessons`——若未传则补上：

```ts
mergeCharsWithCatalog(existing, incoming, catalogLessons)
```

- [x] **Step 2: 跳号补齐验收片段**

```ts
alignCharsWithCatalog(
  [
    { char: '甲', lessonNo: '阅读-2' },
    { char: '乙', lessonNo: '阅读-4' },
  ],
  [
    { index: 1, lessonNo: '阅读-2', title: '二' },
    { index: 2, lessonNo: '阅读-3', title: '三' },
    { index: 3, lessonNo: '阅读-4', title: '四' },
  ]
)
// 期望：阅读-2 有「甲」；阅读-3 为占位；阅读-4 有「乙」
```

- [x] **Step 3: 全量 build**

Run: `npm run build`  
Expected: 成功

- [ ] **Step 4: 手工抽查（可选）**

上传一张左右分栏、带「阅读/识字」标识的写字表页，确认课次为 `阅读-N` / `识字-N`，跳号课有空行。

---

## Spec Coverage Checklist

| Spec 要求 | Task |
|-----------|------|
| Vision 左右分栏顺序 | Task 1 |
| Vision `unitLabel` 继承说明 | Task 1 |
| 跳号不编造字词（提示词） | Task 1 |
| `formatPrefixedLessonNo` 映射 | Task 2–3 |
| 精确匹配目录 + 回退 | Task 2–3 |
| 后处理标识继承 | Task 3–4 |
| 词语表对称 | Task 4 |
| 目录补齐占位 | Task 5（现有 align） |
| 无 unitLabel 回退 | Task 3（`mapPrintedWithUnitLabel`） |

## Self-Review Notes

- 无 TBD/占位步骤
- 不引入 vitest（仓库无测试框架）；验收用 build + 纯函数片段
- Commit 步骤仅在用户明确要求提交时执行（遵循用户 git 规则）
