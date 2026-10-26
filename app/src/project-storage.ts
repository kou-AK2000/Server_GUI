const databaseName = 'orden-projects'
const databaseVersion = 1
const projectStoreName = 'projects'

export type StoredProjectDocument = {
  id: string
  updatedAt: string
  [key: string]: unknown
}

let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  if (!('indexedDB' in window)) return Promise.reject(new Error('indexeddb-unavailable'))

  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(projectStoreName)) {
        const store = database.createObjectStore(projectStoreName, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexeddb-open-failed'))
    request.onblocked = () => reject(new Error('indexeddb-blocked'))
  })
  return databasePromise
}

export async function readStoredProjects(): Promise<StoredProjectDocument[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(projectStoreName, 'readonly')
    const request = transaction.objectStore(projectStoreName).getAll()
    request.onsuccess = () => resolve((request.result as StoredProjectDocument[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    request.onerror = () => reject(request.error ?? new Error('indexeddb-read-failed'))
  })
}

export async function writeStoredProject(project: StoredProjectDocument): Promise<void> {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(projectStoreName, 'readwrite')
    transaction.objectStore(projectStoreName).put(project)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('indexeddb-write-failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('indexeddb-write-aborted'))
  })
}
