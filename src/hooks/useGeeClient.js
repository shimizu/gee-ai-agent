// GEE 認証クライアントの結線フック。
//
// 役割: GeeClient の単一インスタンスを所有し、状態を購読して React へ渡す。login/logout を提供。
// 関係: App が Header の GeeAuthBadge へ状態と操作を渡し、ツール層へ geeClient を注入する。
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { GeeClient } from '../gee/ee-client.js'

const geeClient = new GeeClient()

export function useGeeClient({ geeClientId, geeProject, log }) {
  const geeState = useSyncExternalStore(geeClient.subscribe, geeClient.getSnapshot)

  // 設定があれば起動時にライブラリと GIS を先読みする（クリック時のポップアップを確実にするため）。
  useEffect(() => {
    if (geeClientId && geeProject) geeClient.preload()
  }, [geeClientId, geeProject])

  const login = useCallback(async () => {
    try {
      await geeClient.login({ clientId: geeClientId, project: geeProject })
      log?.(`GEE ログイン成功（project: ${geeProject}）`)
    } catch (e) {
      log?.(`GEE ログイン失敗: ${String(e?.message ?? e)}`)
    }
  }, [geeClientId, geeProject, log])

  // 入力中（未保存でも可）の値で接続テストを行う。
  const testConnection = useCallback(
    async ({ clientId, project }) => {
      const result = await geeClient.testConnection({ clientId, project })
      // 失敗時は接続診断まで含んだ全文を残す（1 行目だけでは原因が分からないため）。
      log?.(`GEE 接続テスト: ${result.ok ? `OK ${result.message.split('\n')[0]}` : `NG\n${result.message}`}`)
      return result
    },
    [log],
  )

  const logout = useCallback(() => {
    geeClient.logout()
    log?.('GEE ログアウト')
  }, [log])

  return { geeClient, geeState, login, logout, testConnection }
}
