import { useSettingsStore } from '@/stores/settings'



class ApiError extends Error {

  status: number

  constructor(status: number, message: string) {

    super(message)

    this.status = status

  }

}



interface ChatCompletionResponse {

  choices: Array<{ message?: { content?: string | null } }>

}



export interface ApiCredentials {

  apiKey: string

  baseUrl: string

}



const OCR_REQUEST_TIMEOUT_MS = 180_000



/** 是否应走本地 Vite 代理（开发模式下始终走代理，含局域网 IP 访问） */

export function shouldUseProxy(): boolean {

  if (import.meta.env.DEV) return true

  if (typeof window === 'undefined') return false

  const host = window.location.hostname

  return host === 'localhost' || host === '127.0.0.1'

}



/** 是否在本地开发服务器上运行 */

export function isLocalDevServer(): boolean {

  if (import.meta.env.DEV) return true

  if (typeof window === 'undefined') return false

  const host = window.location.hostname

  return host === 'localhost' || host === '127.0.0.1'

}



interface ResolvedBaseUrl {

  path: string

  proxyTarget?: string

}



/** 解析实际请求地址，本地开发自动走 Vite 代理 */

export function resolveBaseUrl(baseUrl: string): ResolvedBaseUrl {

  let trimmed = baseUrl.trim().replace(/\/$/, '')



  if (trimmed.startsWith('/')) return { path: trimmed }



  if (trimmed.includes('deepseek.com') && trimmed.endsWith('/v1')) {

    trimmed = trimmed.replace(/\/v1$/, '')

  }



  if (shouldUseProxy()) {

    if (trimmed.includes('dashscope.aliyuncs.com')) return { path: '/dashscope' }

    if (trimmed.includes('deepseek.com') || trimmed.includes('deepseek')) return { path: '/deepseek' }

    if (trimmed.includes('openai.com')) return { path: '/openai/v1' }

    if (!trimmed || trimmed === 'https://api.deepseek.com') return { path: '/deepseek' }

    if (trimmed.startsWith('http')) return { path: '/llm-proxy', proxyTarget: trimmed }

  }



  return { path: trimmed || 'https://api.deepseek.com' }

}



/** @deprecated 使用 resolveBaseUrl */

export function getEffectiveBaseUrl(baseUrl: string): string {

  return resolveBaseUrl(baseUrl).path

}



export function getChatCompletionsUrl(baseUrl?: string): string {

  const settings = useSettingsStore().settings

  const { path } = resolveBaseUrl(baseUrl ?? settings.openaiBaseUrl)

  return `${path}/chat/completions`

}



export function getExpandCredentials(): ApiCredentials {

  const settings = useSettingsStore().settings

  return {

    apiKey: settings.openaiApiKey,

    baseUrl: settings.openaiBaseUrl,

  }

}



export function getOcrCredentials(): ApiCredentials {

  const settings = useSettingsStore().settings

  return {

    apiKey: settings.ocrApiKey.trim() || settings.openaiApiKey,

    baseUrl: settings.ocrBaseUrl.trim() || settings.openaiBaseUrl,

  }

}



function resolveOcrModel(model?: string): string {

  const settings = useSettingsStore().settings

  const resolved = (model ?? settings.ocrModel).trim()

  if (!resolved) throw new Error('请先在设置页填写图片识别模型')

  return resolved

}







function isOpenAiBaseUrl(baseUrl: string): boolean {

  return /openai\.com/i.test(baseUrl)

}



function isQwenCompatibleBaseUrl(baseUrl: string): boolean {

  return /dashscope\.aliyuncs\.com|maas\.aliyuncs\.com/i.test(baseUrl)

}



function parseJSONContent<T>(content: string): T {

  try {

    return JSON.parse(content) as T

  } catch {

    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/)

    if (match) return JSON.parse(match[1].trim()) as T

    throw new Error('AI 返回的内容不是有效 JSON')

  }

}



export function formatOpenAIError(error: unknown): string {

  if (error instanceof ApiError) {

    if (error.status === 401) return 'API Key 无效，请检查 Key 是否正确'

    if (error.status === 403) return 'API 访问被拒绝，请检查 Key 权限或账户余额'

    if (error.status === 429) return '请求过于频繁或额度不足，请稍后重试'

    if (error.status === 400 && /image|vision|multimodal/i.test(error.message)) {

      return '当前 API 不支持图片识别，请检查图片识别模型是否支持 Vision（多模态）。'

    }

    return `API 错误 (${error.status}): ${error.message}`

  }

  if (error instanceof DOMException && error.name === 'AbortError') {

    return '图片识别请求超时。请确认 Base URL 是否为 MaaS/百炼兼容地址，并尝试缩小图片。'

  }

  if (error instanceof TypeError && /fetch|network|Failed/i.test(error.message)) {

    const hint = import.meta.env.DEV

      ? '请确认终端中 npm run dev 正在运行，并刷新页面重试。'

      : '请用 npm run dev 启动后访问，不要直接打开 html 文件。'

    return `网络请求失败：${error.message}。${hint}`

  }

  if (error instanceof Error) return error.message

  return '未知错误'

}







function getQwenOcrExtraParams(baseUrl: string): Record<string, unknown> {

  if (!isQwenCompatibleBaseUrl(baseUrl)) return {}

  return { enable_thinking: false }

}



function buildProxyHeaders(baseUrl: string): Record<string, string> {

  const { proxyTarget } = resolveBaseUrl(baseUrl)

  if (proxyTarget) return { 'X-LLM-Target': proxyTarget }

  return {}

}



function buildVisionUserContent(

  prompt: string,

  imageDataUrl: string,

  baseUrl: string

): Array<Record<string, unknown>> {

  const imagePart = {

    type: 'image_url',

    image_url: isOpenAiBaseUrl(baseUrl)

      ? { url: imageDataUrl, detail: 'high' }

      : { url: imageDataUrl },

  }

  const textPart = { type: 'text', text: prompt }



  if (isQwenCompatibleBaseUrl(baseUrl)) {

    return [imagePart, textPart]

  }

  return [textPart, imagePart]

}



async function requestChatCompletion(

  body: Record<string, unknown>,

  credentials: ApiCredentials,

  options?: {
    missingKeyMessage?: string
    includeQwenOcrParams?: boolean
    timeoutMs?: number
  }
): Promise<ChatCompletionResponse> {
  if (!credentials.apiKey.trim()) {
    throw new Error(options?.missingKeyMessage ?? '请先填写 API Key')
  }

  const url = getChatCompletionsUrl(credentials.baseUrl)
  const requestBody = {
    ...body,
    ...(options?.includeQwenOcrParams ? getQwenOcrExtraParams(credentials.baseUrl) : {}),
  }



  const controller = new AbortController()

  const timeoutMs = options?.timeoutMs ?? OCR_REQUEST_TIMEOUT_MS

  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)



  try {

    const response = await fetch(url, {

      method: 'POST',

      headers: {

        'Content-Type': 'application/json',

        Authorization: `Bearer ${credentials.apiKey}`,

        ...buildProxyHeaders(credentials.baseUrl),

      },

      body: JSON.stringify(requestBody),

      signal: controller.signal,

    })



    const text = await response.text()

    if (!response.ok) {

      let msg = text

      try {

        const json = JSON.parse(text) as { error?: { message?: string } }

        msg = json.error?.message ?? text

      } catch {

        // keep raw text

      }

      throw new ApiError(response.status, msg)

    }



    return JSON.parse(text) as ChatCompletionResponse

  } finally {

    window.clearTimeout(timeoutId)

  }

}



export async function chatJSON<T>(
  prompt: string,
  model?: string,
  options?: { api?: 'expand' | 'ocr' }
): Promise<T> {
  const settings = useSettingsStore().settings
  const credentials = options?.api === 'ocr' ? getOcrCredentials() : getExpandCredentials()
  const defaultModel = options?.api === 'ocr' ? resolveOcrModel(model) : settings.expandModel
  const missingKeyMessage =
    options?.api === 'ocr' ? '请先填写图片识别 API Key' : '请先填写文本拓展 API Key'

  try {
    const data = await requestChatCompletion(
      {
        model: model ?? defaultModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: options?.api === 'expand' ? 8192 : undefined,
      },
      credentials,
      {
        missingKeyMessage,
        includeQwenOcrParams: options?.api === 'ocr',
      }
    )

    const content = data.choices[0]?.message?.content

    if (!content) throw new Error('AI 返回为空')

    return parseJSONContent<T>(content)

  } catch (error) {

    throw new Error(formatOpenAIError(error))

  }

}



export async function visionJSON<T>(

  imageBase64: string,

  prompt: string,

  mimeType = 'image/jpeg',

  model?: string

): Promise<T> {

  const credentials = getOcrCredentials()

  const ocrModel = resolveOcrModel(model)

  const imageDataUrl = `data:${mimeType};base64,${imageBase64}`



  try {

    const data = await requestChatCompletion(

      {

        model: ocrModel,

        messages: [

          {

            role: 'user',

            content: buildVisionUserContent(prompt, imageDataUrl, credentials.baseUrl),

          },

        ],

        response_format: { type: 'json_object' },

        temperature: 0.1,

        max_tokens: 4096,

      },

      credentials,

      {

        missingKeyMessage: '请先填写图片识别 API Key',

        includeQwenOcrParams: true,

      }

    )

    const content = data.choices[0]?.message?.content

    if (!content) throw new Error('OCR 返回为空')

    return parseJSONContent<T>(content)

  } catch (error) {

    throw new Error(formatOpenAIError(error))

  }

}



export async function testExpandConnection(): Promise<string> {

  const settings = useSettingsStore().settings

  const credentials = getExpandCredentials()

  const url = getChatCompletionsUrl(credentials.baseUrl)

  try {

    const data = await requestChatCompletion(

      {

        model: settings.expandModel,

        messages: [{ role: 'user', content: '回复 OK' }],

        max_tokens: 10,

      },

      credentials,

      {
        missingKeyMessage: '请先填写文本拓展 API Key',
        timeoutMs: 30_000,
      }
    )

    const text = data.choices[0]?.message?.content?.trim()
    const proxyHint = url.startsWith('/') ? '（经本地代理）' : '（直连）'
    return text
      ? `文本拓展连接成功${proxyHint}，模型回复: ${text}`
      : `文本拓展连接成功${proxyHint}`
  } catch (error) {

    throw new Error(formatOpenAIError(error))

  }

}



export async function testOcrConnection(): Promise<string> {

  const credentials = getOcrCredentials()

  const ocrModel = resolveOcrModel()

  const url = getChatCompletionsUrl(credentials.baseUrl)

  try {

    const data = await requestChatCompletion(

      {

        model: ocrModel,

        messages: [{ role: 'user', content: '回复 OK' }],

        max_tokens: 10,

      },

      credentials,

      {

        missingKeyMessage: '请先填写图片识别 API Key',

        includeQwenOcrParams: true,

        timeoutMs: 30_000,

      }

    )

    const text = data.choices[0]?.message?.content?.trim()

    const proxyHint = url.startsWith('/') ? '（经本地代理）' : '（直连）'

    return text

      ? `图片识别 API 连接成功${proxyHint}，模型 ${ocrModel} 回复: ${text}`

      : `图片识别 API 连接成功${proxyHint}，模型 ${ocrModel}`

  } catch (error) {

    throw new Error(formatOpenAIError(error))

  }

}



/** @deprecated 使用 testExpandConnection */

export async function testConnection(): Promise<string> {

  return testExpandConnection()

}


