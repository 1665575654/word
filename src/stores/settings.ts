import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppSettings } from '@/types'
import { DEFAULT_SETTINGS, normalizeExpandConfig } from '@/types'

const SETTINGS_KEY = 'jing-app-settings'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>(loadSettings())

  function loadSettings(): AppSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        // 迁移旧版设置：去掉已废弃字段
        delete parsed.provider
        delete parsed.thinkingEnabled
        delete parsed.reasoningEffort
        if (!parsed.ocrBaseUrl) {
          parsed.ocrBaseUrl = DEFAULT_SETTINGS.ocrBaseUrl
        }
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          expandConfig: normalizeExpandConfig(parsed.expandConfig ?? DEFAULT_SETTINGS.expandConfig),
        }
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_SETTINGS }
  }

  function saveSettings(partial: Partial<AppSettings>) {
    settings.value = { ...settings.value, ...partial }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value))
  }

  function hasExpandApiKey(): boolean {
    return settings.value.openaiApiKey.trim().length > 0
  }

  function hasOcrApiKey(): boolean {
    const ocrKey = settings.value.ocrApiKey.trim()
    if (ocrKey.length > 0) return true
    return settings.value.openaiApiKey.trim().length > 0
  }

  /** @deprecated 使用 hasExpandApiKey */
  function hasApiKey(): boolean {
    return hasExpandApiKey()
  }

  return { settings, saveSettings, hasApiKey, hasExpandApiKey, hasOcrApiKey }
})
