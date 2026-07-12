import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Workspace, CharacterItem, WordItem } from '@/types'
import { DEFAULT_EXPAND_CONFIG, normalizeExpandConfig } from '@/types'
import { getWorkspaceDisplayName, type GradeValue, type SemesterValue } from '@/utils/exportName'
import * as storage from '@/utils/storage'

export interface CreateWorkspaceOptions {
  grade: GradeValue
  semester: SemesterValue
}

function createEmptyWorkspace(options: CreateWorkspaceOptions): Workspace {
  const now = new Date().toISOString()
  const name = getWorkspaceDisplayName({ grade: options.grade, semester: options.semester, title: '', createdAt: now, updatedAt: now })
  return {
    id: crypto.randomUUID(),
    name,
    meta: {
      grade: options.grade,
      semester: options.semester,
      title: name,
      createdAt: now,
      updatedAt: now,
    },
    catalog: { lessons: [] },
    writingChars: [],
    readingChars: [],
    vocabulary: [],
    expandConfig: normalizeExpandConfig(DEFAULT_EXPAND_CONFIG),
    stage: 'parsed',
  }
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const workspaces = ref<Workspace[]>([])
  const currentId = ref<string | null>(null)
  const loaded = ref(false)

  const current = computed(() =>
    workspaces.value.find((w) => w.id === currentId.value) ?? null
  )

  async function init() {
    workspaces.value = await storage.getAllWorkspaces()
    loaded.value = true
  }

  async function create(options: CreateWorkspaceOptions) {
    const ws = createEmptyWorkspace(options)
    workspaces.value.unshift(ws)
    currentId.value = ws.id
    await storage.saveWorkspace(ws)
    return ws
  }

  async function select(id: string) {
    currentId.value = id
  }

  async function remove(id: string) {
    workspaces.value = workspaces.value.filter((w) => w.id !== id)
    await storage.deleteWorkspace(id)
    if (currentId.value === id) {
      currentId.value = workspaces.value[0]?.id ?? null
    }
  }

  async function update(partial: Partial<Workspace>) {
    if (!current.value) {
      console.warn('[workspace] update skipped: no current workspace selected')
      return false
    }
    const updated: Workspace = {
      ...current.value,
      ...partial,
      catalog: partial.catalog
        ? { ...current.value.catalog, ...partial.catalog }
        : current.value.catalog,
      meta: {
        ...current.value.meta,
        ...(partial.meta ?? {}),
        updatedAt: new Date().toISOString(),
      },
      expandConfig: partial.expandConfig
        ? {
            writing: {
              ...current.value.expandConfig.writing,
              ...partial.expandConfig.writing,
            },
            reading: {
              ...current.value.expandConfig.reading,
              ...partial.expandConfig.reading,
            },
            vocabulary: {
              ...current.value.expandConfig.vocabulary,
              ...partial.expandConfig.vocabulary,
            },
          }
        : current.value.expandConfig,
    }
    const idx = workspaces.value.findIndex((w) => w.id === updated.id)
    if (idx >= 0) workspaces.value[idx] = updated
    await storage.saveWorkspace(updated)
    return true
  }

  function getCharsByLesson(chars: CharacterItem[], lessonNo: string) {
    return chars.filter((c) => c.lessonNo === lessonNo)
  }

  function getWordsByLesson(words: WordItem[], lessonNo: string) {
    return words.filter((w) => w.lessonNo === lessonNo)
  }

  return {
    workspaces,
    currentId,
    current,
    loaded,
    init,
    create,
    select,
    remove,
    update,
    getCharsByLesson,
    getWordsByLesson,
  }
})
