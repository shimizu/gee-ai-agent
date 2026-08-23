// IndexedDB の薄いラッパ（データセットの行・ベクターレイヤーの GeoJSON の永続化）。
//
// 役割: localStorage に入らない大きめのデータを store ごとに保存する。IndexedDB 不在
//       （Node テスト等）なら全て no-op にする。
// 関係: dataset-store.js / layer-store.js が使う。
// 流用元: reference/portwatch-dashboard/src/data/idb.js（複数 store 対応に拡張）
const DB_NAME = 'gee-ai-agent'
const DB_VERSION = 1
export const STORES = { datasets: 'datasets', layers: 'layers', charts: 'charts' }

function resolveIndexedDB() {
  try {
    return globalThis.indexedDB ?? null
  } catch {
    return null
  }
}

function openDb() {
  const idb = resolveIndexedDB()
  if (!idb) return Promise.resolve(null)
  return new Promise((resolve) => {
    let request
    try {
      request = idb.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

function runWrite(storeName, action) {
  return openDb().then((db) => {
    if (!db) return undefined
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      action(tx.objectStore(storeName))
      tx.oncomplete = () => resolve(undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  })
}

export function idbPut(storeName, record) {
  return runWrite(storeName, (store) => store.put(record))
}

export function idbDelete(storeName, id) {
  return runWrite(storeName, (store) => store.delete(id))
}

export function idbClear(storeName) {
  return runWrite(storeName, (store) => store.clear())
}

export function idbGetAll(storeName) {
  return openDb().then((db) => {
    if (!db) return []
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly')
      const request = tx.objectStore(storeName).getAll()
      request.onsuccess = () => resolve(request.result ?? [])
      request.onerror = () => resolve([])
    })
  })
}
