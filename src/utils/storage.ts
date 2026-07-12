import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { toRaw } from 'vue'
import type { Workspace, CustomTemplate } from '@/types'
import { normalizeExpandConfig } from '@/types'

/** IndexedDB 无法克隆 Vue 响应式 Proxy，写入前转为纯 JSON 对象 */
function cloneForStorage<T>(value: T): T {
  return JSON.parse(JSON.stringify(toRaw(value))) as T
}

function cloneCustomTemplate(tpl: CustomTemplate): CustomTemplate {
  const raw = toRaw(tpl)
  return {
    ...raw,
    fileData: raw.fileData.slice(0),
    placeholders: [...raw.placeholders],
  }
}

interface JingDB extends DBSchema {
  workspaces: {
    key: string
    value: Workspace
  }
  customTemplates: {
    key: string
    value: CustomTemplate
  }
}

let dbPromise: Promise<IDBPDatabase<JingDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<JingDB>('jing-edu-tool', 1, {
      upgrade(db) {
        db.createObjectStore('workspaces', { keyPath: 'id' })
        db.createObjectStore('customTemplates', { keyPath: 'id' })
      },
    })
  }
  return dbPromise
}

export async function getAllWorkspaces(): Promise<Workspace[]> {
  const db = await getDB()
  const all = await db.getAll('workspaces')
  return all
    .map(normalizeWorkspace)
    .sort(
      (a, b) => new Date(b.meta.updatedAt).getTime() - new Date(a.meta.updatedAt).getTime()
    )
}

function normalizeWorkspace(ws: Workspace): Workspace {
  return {
    ...ws,
    meta: {
      ...ws.meta,
      semester: ws.meta.semester ?? '',
    },
    expandConfig: normalizeExpandConfig(ws.expandConfig),
  }
}

export async function saveWorkspace(ws: Workspace): Promise<void> {
  const db = await getDB()
  await db.put('workspaces', cloneForStorage(ws))
}

export async function deleteWorkspace(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('workspaces', id)
}

export async function getAllCustomTemplates(): Promise<CustomTemplate[]> {
  const db = await getDB()
  return db.getAll('customTemplates')
}

export async function saveCustomTemplate(tpl: CustomTemplate): Promise<void> {
  const db = await getDB()
  await db.put('customTemplates', cloneCustomTemplate(tpl))
}

export async function deleteCustomTemplate(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('customTemplates', id)
}
