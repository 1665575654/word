import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

const LLM_PROXY_TIMEOUT_MS = 300_000

const llmProxy = {
  target: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  changeOrigin: true,
  secure: true,
  timeout: LLM_PROXY_TIMEOUT_MS,
  proxyTimeout: LLM_PROXY_TIMEOUT_MS,
  router: (req: { headers: Record<string, string | string[] | undefined> }) => {
    const raw = req.headers['x-llm-target']
    const target = Array.isArray(raw) ? raw[0] : raw
    if (typeof target === 'string' && target.startsWith('http')) {
      return target.replace(/\/$/, '')
    }
    return 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  },
  rewrite: (path: string) => path.replace(/^\/llm-proxy/, ''),
}

const timedProxy = (target: string, rewrite: (path: string) => string) => ({
  target,
  changeOrigin: true,
  secure: true,
  timeout: LLM_PROXY_TIMEOUT_MS,
  proxyTimeout: LLM_PROXY_TIMEOUT_MS,
  rewrite,
})

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    strictPort: false,
    proxy: {
      '/deepseek': timedProxy('https://api.deepseek.com', (path) => path.replace(/^\/deepseek/, '')),
      '/openai': timedProxy('https://api.openai.com', (path) => path.replace(/^\/openai/, '')),
      '/dashscope': timedProxy(
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
        (path) => path.replace(/^\/dashscope/, '')
      ),
      '/llm-proxy': llmProxy,
    },
  },
  preview: {
    host: true,
    port: 4173,
    proxy: {
      '/deepseek': timedProxy('https://api.deepseek.com', (path) => path.replace(/^\/deepseek/, '')),
      '/openai': timedProxy('https://api.openai.com', (path) => path.replace(/^\/openai/, '')),
      '/dashscope': timedProxy(
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
        (path) => path.replace(/^\/dashscope/, '')
      ),
      '/llm-proxy': llmProxy,
    },
  },
})
