// Earth Engine の認証・初期化ステートマシン。
//
// 役割: OAuth クライアント ID + Cloud プロジェクト ID で `ee` を認証・初期化し、状態
//       （idle / loading-lib / authenticating / initializing / ready / expired / error）を
//       購読者（React: useSyncExternalStore）へ通知する。`ee` インスタンスの唯一の保持者。
// 関係: hooks/useGeeClient.js が購読し、ツール層は deps.geeClient.ee / assertReady() を使う。
//
// 注意:
//   - login() は必ずボタンのクリックハンドラから呼ぶ（Google Identity Services の
//     requestAccessToken はポップアップを開くため、ユーザー操作の文脈が必要）。
//   - ee.Reducer / ee.Filter 等の動的クラスは ee.initialize 成功後にしか存在しない。
//   - トークンは約 1 時間で失効する。getAuthToken() が null になったら expired にして
//     UI から再ログインを促す（EE 内部の自動更新も再びポップアップになり得る）。
import { loadEe, preloadGis } from './ee-loader.js'
import { evaluate } from './ee-promise.js'
import { describeGeeAuthError } from './ee-errors.js'

const EXPIRY_POLL_MS = 30_000

export class GeeClient {
  #state = { status: 'idle', clientId: '', project: '', error: '', authenticatedAt: null }
  #listeners = new Set()
  #ee = null
  #timer = null

  subscribe = (listener) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getSnapshot = () => this.#state

  get ee() {
    return this.#ee
  }

  get status() {
    return this.#state.status
  }

  get project() {
    return this.#state.project
  }

  isReady() {
    return this.#state.status === 'ready'
  }

  // ツールから呼ぶ前提チェック。未ログインなら分かりやすいエラーを投げる。
  assertReady() {
    if (this.#state.status === 'expired') {
      throw new Error('GEE の認証トークンが期限切れです。ヘッダーの GEE バッジから再ログインしてください。')
    }
    if (this.#state.status !== 'ready' || !this.#ee) {
      throw new Error('GEE にログインしていません。ヘッダーの「GEE ログイン」から Google アカウントで認証してください。')
    }
    return this.#ee
  }

  // "Bearer xxx" 形式の Authorization ヘッダ値（REST 直叩き用）。
  authHeader() {
    try {
      return this.#ee?.data?.getAuthToken?.() ?? null
    } catch {
      return null
    }
  }

  // ライブラリと GIS を先読みする（設定保存時・起動時に呼ぶ）。
  async preload() {
    try {
      await Promise.all([loadEe(), preloadGis()])
    } catch {
      // 先読み失敗は login 時に再試行する。
    }
  }

  async login({ clientId, project }) {
    const cid = String(clientId ?? '').trim()
    const proj = String(project ?? '').trim()
    if (!cid) throw new Error('GEE OAuth クライアント ID が設定されていません。')
    if (!proj) throw new Error('GEE Cloud プロジェクト ID が設定されていません。')

    this.#set({ status: 'loading-lib', clientId: cid, project: proj, error: '' })
    try {
      const ee = await loadEe()
      this.#ee = ee
      this.#set({ status: 'authenticating' })
      await new Promise((resolve, reject) => {
        ee.data.authenticateViaOauth(
          cid,
          resolve,
          (msg) => reject(new Error(String(msg ?? '認証に失敗しました'))),
          [],
          // 既定のフォールバック（authenticateViaPopup）に任せる。
          undefined,
        )
      })
      this.#set({ status: 'initializing' })
      await new Promise((resolve, reject) => {
        ee.initialize(
          null,
          null,
          resolve,
          (err) => reject(err instanceof Error ? err : new Error(String(err))),
          null,
          proj,
        )
      })
      this.#set({ status: 'ready', authenticatedAt: Date.now(), error: '' })
      this.#watchExpiry()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      this.#set({ status: 'error', error: message })
      throw e
    }
  }

  // 接続テスト: ログイン → ee.Number(1) の評価まで行う。成功すると ready のまま残る。
  async testConnection({ clientId, project }) {
    try {
      await this.login({ clientId, project })
      const value = await evaluate(this.#ee.Number(1), { timeoutMs: 60_000 })
      if (value !== 1) throw new Error(`予期しない評価結果: ${JSON.stringify(value)}`)
      return { ok: true, message: `接続 OK（project: ${project}）` }
    } catch (e) {
      return { ok: false, message: describeGeeAuthError(e) }
    }
  }

  logout() {
    try {
      this.#ee?.data?.authenticateViaOauth?.(null)
    } catch {
      // 無視
    }
    this.#stopWatch()
    this.#set({ status: 'idle', error: '', authenticatedAt: null })
  }

  #watchExpiry() {
    this.#stopWatch()
    this.#timer = setInterval(() => {
      if (this.#state.status !== 'ready') return
      if (!this.authHeader()) this.#set({ status: 'expired' })
    }, EXPIRY_POLL_MS)
  }

  #stopWatch() {
    if (this.#timer) clearInterval(this.#timer)
    this.#timer = null
  }

  #set(patch) {
    this.#state = { ...this.#state, ...patch }
    for (const l of this.#listeners) l()
  }
}
