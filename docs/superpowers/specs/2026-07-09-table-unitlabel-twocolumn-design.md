# 写字/识字/词语表：左右分栏、单元标识与目录补齐

> 版本 1.0 | 2026-07-09

## 背景

写字表、识字表、词语表与目录页类似，常为左右双栏（中间竖线分隔）。当前：

- 目录 Vision 提示词已要求「先左栏上→下，再右栏上→下」
- 三类表的提示词尚未要求分栏阅读顺序
- 表内课次映射仍按「印刷序号 → 目录第 N 个非园地课」，未使用行上方「阅读 / 识字」等标识
- 目录课次已支持 `阅读-5` / `识字-5` 前缀；表识别若忽略标识，会把不同单元的同号课次弄混
- 跳号课次（如图片从 2 直接到 4）需按目录补占位；合并路径已有 `alignCharsWithCatalog` / `alignWordsWithCatalog`

## 目标

1. 三类表识别时，左右有竖线则按左栏→右栏顺序读
2. 行上方单元标识（阅读 / 识字 / 语文园地等）向下继承，并与印刷序号拼成目录课次（如 `阅读-5`）
3. 图片跳号的课次，按目录补空占位（`LESSON_SLOT`），不编造字词

## 非目标

- 不做基于几何/坐标的本地分栏重排（本期仅靠 Vision 提示词约束顺序）
- 不改变目录识别逻辑（目录已具备分栏与 `unitLabel`）
- 不改变 Excel / 拓展流程

## 决策摘要

| 项 | 选择 |
|----|------|
| 课次拼法 | `unitLabel` + 印刷序号 → `阅读-5`（方案 A） |
| 左右分栏 | 主要改 Vision 提示词（方案 A） |
| 跳号补齐 | 按目录补课次占位，字词为空（方案 A） |
| 实现路径 | 提示词 + 课次映射后处理（方案 2） |

## 设计

### 1. Vision 提示词（`ocrParser.ts` → `VISION_PROMPTS`）

对 `writing` / `reading` / `vocabulary` 共用规则（可抽成常量，与现有 `TABLE_LESSON_NO_RULES` 并列）：

**左右分栏**

- 若页面左右排布且中间有竖线：必须先读完左栏从上到下，再读右栏从上到下
- 禁止按同一横行合并左右栏内容

**单元标识 `unitLabel`**

- JSON 每组增加可选字段 `unitLabel`
- 取值来自行上方印刷标识：`阅读`、`识字`、`汉语拼音`、`语文园地` 等
- 标识出现后，该行及后续行均继承该 `unitLabel`，直到出现新标识
- 「语文园地」组：`title` 填「语文园地」，`unitLabel` 可填「语文园地」或留空（后处理按园地规则处理）；无印刷整数序号

**印刷序号 `lessonNo`**

- 仍为行前印刷整数（只计课文、不计语文园地）
- 最终课次由后处理拼成 `unitLabel-lessonNo`（如 `阅读-5`），模型不要直接输出带前缀的课次字符串

**跳号**

- 图片中未出现的课次不要输出字词
- 跳号（如 2 后直接 4）表示中间课文在本书该表中无字词，不要编造内容
- 缺失课次由后处理按目录补占位

示例形状：

```json
{
  "lessons": [
    {
      "index": 1,
      "lessonNo": 5,
      "unitLabel": "阅读",
      "title": "",
      "chars": [{ "char": "船" }]
    }
  ]
}
```

词语表同理，字段为 `words`。

### 2. 课次映射后处理（`tableOcrParser.ts`）

扩展分组行类型，接受 `unitLabel?: string`。

在 `mapGroupedCharLessons` / `mapGroupedWordLessons`（及无目录时的 `flattenLessonGrouped*` 回退路径，若需要）中：

1. **园地**：`title` / `unitLabel` 判定为语文园地时，沿用现有园地映射（`resolveGroupedGardenLessonNo` 等）
2. **有 `unitLabel` 且有印刷序号**：
   - `lessonNo = formatPrefixedLessonNo(unitLabel, printedNo)`（如 `阅读-5`）
   - 若目录非空：优先在目录中精确匹配该课次；匹配失败时可回退到现有 `mapNumberedLessonNo`（兼容标识 OCR 错误）
3. **无 `unitLabel`**：保持现有行为（`mapNumberedLessonNo` / 第 N 个非园地课）
4. **标识继承**：若模型未在每组重复填写，后处理维护 `currentUnitLabel`，对后续无 `unitLabel` 的组沿用上一组标识（与提示词「向下继承」一致，双保险）

`inferSequentialPrintedNo` 仍用于纠正相邻行合并误识（如 2+3→23）；跳号本身信任图片数字，不强制连续。

### 3. 目录补齐占位

合并写入工作区时已调用：

- `mergeCharsWithCatalog` → `alignCharsWithCatalog`
- `mergeWordsWithCatalog` → `alignWordsWithCatalog`

行为保持不变：目录中有、当前表结果中无（或仅占位）的课次，补一条 `LESSON_SLOT_CHAR` / `LESSON_SLOT_WORD`。

本期需确认：表识别结果的 `lessonNo` 已带前缀后，能与目录 `阅读-5` 等精确对齐；否则跳号补齐会落到错误课次或重复补全目录。

可选加固（实现时按需）：在 `parseImage` 单次识别返回前，若已有 `catalogLessons`，对本次结果也跑一遍 align（即使尚未 merge）。优先保证 merge 路径正确即可，因 Step2 上传均走 merge。

### 4. 本地 OCR 文本解析（次要）

`parseCharTableFromOcrText` / `parseWordTableFromOcrText` 若仍被使用：

- 本期可不做左右分栏重排（与「分栏靠提示词」一致）
- 若行内能识别「阅读」「识字」等标签，可同样写入继承的 `unitLabel` 再映射；否则保持旧逻辑

以 Vision 路径为验收主路径。

## 涉及文件

| 文件 | 变更 |
|------|------|
| `src/services/ocrParser.ts` | 三类表 Vision 提示词：分栏、`unitLabel`、跳号说明 |
| `src/services/tableOcrParser.ts` | `mapGrouped*` 支持 `unitLabel` 前缀映射与继承 |
| `src/services/lessonNoUtils.ts` | 必要时抽小工具（如按前缀匹配目录）；优先复用 `formatPrefixedLessonNo` |
| `src/services/dataMerger.ts` | 原则上不改；确认 align 与前缀课次兼容 |

## 验收标准

1. 左右双栏写字/识字/词语表：识别顺序为左栏上→下，再右栏上→下（抽查典型教材页）
2. 行上方为「阅读」、序号为 5 时，结果课次为 `阅读-5`，且与目录同课合并
3. 「识字」单元下同号课次为 `识字-N`，不与「阅读-N」混淆
4. 印刷序号跳号时，中间目录课次出现占位空行，且不编造字词
5. 无 `unitLabel` 的旧式识别结果仍可按「第 N 个非园地课」回退映射

## 风险与兼容

- 模型漏填 `unitLabel`：靠后处理继承 + 无标识回退缓解
- 标识 OCR 成错字：精确匹配失败时回退序号映射，可能仍偶发错课；可后续加模糊匹配
- 全书补齐：`align*WithCatalog` 会对**整本目录**补占位；若用户只识别了部分页，未识别页的课次也会出现空占位——此为现有 merge 行为，本期不改变范围语义
