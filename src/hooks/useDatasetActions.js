// データセットストアの結線フック。
//
// 役割: DatasetStore の単一インスタンスを所有し、一覧を購読して返す。削除/全消去を提供。
import { useCallback, useSyncExternalStore } from 'react'
import { DatasetStore } from '../data/dataset-store.js'

const datasetStore = new DatasetStore()

export function useDatasetActions({ log } = {}) {
  const datasets = useSyncExternalStore(datasetStore.subscribe, datasetStore.getSnapshot)

  const removeDataset = useCallback(
    (id) => {
      datasetStore.remove(id)
      log?.(`データセット削除: ${id}`)
    },
    [log],
  )

  const clearDatasets = useCallback(() => datasetStore.clear(), [])

  return { datasetStore, datasets, removeDataset, clearDatasets }
}
