// アプリの唯一の結線点。
//
// 役割: 設定・GEE 認証・地図（MapLibre + deck.gl）・レイヤー・データセット・チャート・エージェントの
//       各フックを依存順に結線する。UI コンポーネントは表示と入力のみを担い、推論・EE 実行・
//       データ管理は agent/* ・gee/* ・tools/* ・data/* のモジュールが行う。
// 関係: hooks/*（結線フック）、components/*、Layers/index.js。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useSettings } from './hooks/useSettings'
import { useGeeClient } from './hooks/useGeeClient'
import { useLayerActions } from './hooks/useLayerActions'
import { useDatasetActions } from './hooks/useDatasetActions'
import { useChartActions } from './hooks/useChartActions'
import { useAgentSession } from './hooks/useAgentSession'
import { useMapHover } from './hooks/useMapHover'
import { useVoiceSession } from './hooks/useVoiceSession'

import { RawTileCache } from './gee/tile-cache.js'
import { getColormapTexture } from './gee/colormap-registry.js'
import { loadSetting, saveSetting, SETTINGS_KEYS } from './data/settings.js'
import { uuid } from './utils/ids.js'
import { downloadBlob } from './utils/download.js'
import { buildDatasetExport, layerToGeoJson, safeFilename } from './data/export-formats.js'

import Header from './components/Header'
import GeeAuthBadge from './components/GeeAuthBadge'
import ApiSettings from './components/ApiSettings'
import Sidebar from './components/Sidebar'
import TabbedPanel from './components/TabbedPanel'
import MapView from './components/MapView'
import ChatPanel from './components/ChatPanel'
import VoiceButton from './components/VoiceButton'
import ChartDialog from './components/ChartDialog'
import LayerPanel from './components/LayerPanel'
import DatasetPanel from './components/DatasetPanel'
import ExecutionLog from './components/ExecutionLog'
import AboutModal from './components/AboutModal'

import './styles/app.css'

const LOG_STORAGE = 'gee-agent.operation-log'
const tileCache = new RawTileCache()

function loadLogs() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(LOG_STORAGE) ?? '[]')
    return Array.isArray(parsed) ? parsed.slice(-300) : []
  } catch {
    return []
  }
}

function App() {
  // --- ログ ---
  const [logs, setLogs] = useState(loadLogs)
  const log = useCallback((message) => {
    setLogs((cur) => [...cur, { id: uuid(), message: `${new Date().toLocaleTimeString('ja-JP')} ${message}` }].slice(-300))
  }, [])
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(LOG_STORAGE, JSON.stringify(logs))
    } catch {
      // 無視
    }
  }, [logs])

  // --- 設定 ---
  const { settings, setField, save, deleteKeys, settingsOpen, setSettingsOpen, tests, testClaude, testGemini, runGeeTest } = useSettings()

  // --- GEE 認証 ---
  const { geeClient, geeState, login: geeLogin, logout: geeLogout, testConnection: geeTest } = useGeeClient({
    geeClientId: settings.geeClientId,
    geeProject: settings.geeProject,
    log,
  })
  const geeReady = geeState.status === 'ready'

  const [rightOpen, setRightOpen] = useState(true)

  // --- 地図（MapLibre の ref を保持し、fitBounds / getMapView を提供） ---
  const mapRef = useRef(null)
  const handleMapReady = useCallback((ref) => {
    mapRef.current = ref
  }, [])

  const getMapView = useCallback(() => {
    const map = mapRef.current
    if (!map) return null
    try {
      const b = map.getBounds()
      const c = map.getCenter()
      return {
        bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
      }
    } catch {
      return null
    }
  }, [])

  const fitBounds = useCallback((bounds) => {
    const map = mapRef.current
    if (!map || !Array.isArray(bounds) || bounds.length !== 4) return
    let [w, s, e, n] = bounds
    // 点 1 つなどの退化した範囲は少し広げて都市スケールで見せる。
    if (e - w < 0.02) {
      w -= 0.05
      e += 0.05
    }
    if (n - s < 0.02) {
      s -= 0.05
      n += 0.05
    }
    try {
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: 60, duration: 700, maxZoom: 15 },
      )
    } catch {
      // 無視
    }
  }, [])

  // deck.gl の Device → カラーマップテクスチャ（raw レイヤー用）。
  const [device, setDevice] = useState(null)
  const [colormapTexture, setColormapTexture] = useState(null)
  useEffect(() => {
    if (!device) return
    let cancelled = false
    getColormapTexture(device)
      .then((tex) => {
        if (!cancelled) setColormapTexture(tex)
      })
      .catch((e) => log(`カラーマップ読込失敗: ${String(e?.message ?? e)}`))
    return () => {
      cancelled = true
    }
  }, [device, log])

  // --- レイヤー ---
  const {
    layerStore,
    layers,
    addRasterLayer,
    addVectorLayer,
    removeLayer,
    updateLayer,
    updateLayerSpec,
    toggleLayer,
    zoomToLayer,
    rebuildLayer,
    markLayerStale,
    clearLayers,
    exportLayerViaEE,
    exportLayerTiles,
  } = useLayerActions({ geeClient, geeReady, tileCache, getMapView, fitBounds, log })

  // タイル取得エラー（mapid 失効など）。同じレイヤーで連続したら stale にする。
  const tileErrorCountRef = useRef(new Map())
  const handleTileError = useCallback(
    (layerId, error) => {
      const n = (tileErrorCountRef.current.get(layerId) ?? 0) + 1
      tileErrorCountRef.current.set(layerId, n)
      if (n === 6) {
        log(`レイヤー ${layerId} のタイル取得が連続で失敗（期限切れの可能性）。レイヤータブの ↻ で再作成できます。`)
        markLayerStale(layerId, error)
        tileErrorCountRef.current.set(layerId, 0)
      }
    },
    [log, markLayerStale],
  )
  const handleTileUnload = useCallback((layerId, index) => {
    if (index) tileCache.delete(layerId, index)
  }, [])

  // --- データセット / チャート ---
  const { datasetStore, datasets, removeDataset, clearDatasets } = useDatasetActions({ log })
  const { chartStore, chartsById, openChartId, openChart, closeChart, clearCharts } = useChartActions()

  // --- エクスポート（ベクター GeoJSON / データセット CSV・JSON・GeoJSON） ---
  const handleExportVector = useCallback(
    (layerId) => {
      const layer = layerStore.get(layerId)
      const text = layerToGeoJson(layer)
      if (!text) {
        log(`GeoJSON を作れません: ${layerId}`)
        return
      }
      downloadBlob(new Blob([text], { type: 'application/geo+json' }), safeFilename(layer.name || layerId, 'geojson'))
      log(`GeoJSON 保存: ${layer.name}`)
    },
    [layerStore, log],
  )
  const handleExportDataset = useCallback(
    (datasetId, format) => {
      try {
        const ds = datasetStore.get(datasetId)
        const { text, mime, filename } = buildDatasetExport(ds, format)
        downloadBlob(new Blob([text], { type: mime }), filename)
        log(`データセット保存: ${ds.id} (${format})`)
      } catch (e) {
        log(`データセット保存失敗: ${String(e?.message ?? e)}`)
        window.alert(String(e?.message ?? e))
      }
    },
    [datasetStore, log],
  )

  // --- ホバー（raw の実値） ---
  const { hoverItems, handleMouseMove, clearHover } = useMapHover({ layers, tileCache })

  // --- エージェント ---
  // 完了通知は音声セッション（後段で作る）へ ref 経由で転送する（フックの依存順の都合）。
  const agentFinishedRef = useRef(null)
  const handleAgentFinished = useCallback((result) => agentFinishedRef.current?.(result), [])
  const { messages, isRunning, chatInput, setChatInput, chatInputRef, handleSubmit, handleAbort, handleResetChat } =
    useAgentSession({
      geeClient,
      geeState,
      datasetStore,
      layerStore,
      chartStore,
      addRasterLayer,
      addVectorLayer,
      removeLayer,
      updateLayer,
      updateLayerSpec,
      getMapView,
      fitBounds,
      layers,
      datasets,
      apiKey: settings.apiKey,
      model: settings.model,
      maxTokens: settings.maxTokens,
      log,
      onFinished: handleAgentFinished,
    })

  // 開発専用: DevTools / ヘッドレス検証からストアを触れるようにする（本番バンドルには含めない）。
  useEffect(() => {
    if (!import.meta.env.DEV) return
    import('./gee/spike.js').then((m) => {
      window.__geeDev = {
        geeClient,
        layerStore,
        datasetStore,
        chartStore,
        tileCache,
        addSyntheticRawLayer: () => {
          const layer = m.makeSyntheticRawLayer({ tileCache })
          if (layerStore.get(layer.layerId)) layerStore.update(layer.layerId, layer)
          else layerStore.add(layer)
        },
      }
    })
  }, [geeClient, layerStore, datasetStore, chartStore])

  // --- 音声セッション（Gemini Live）---
  // Gemini には run_prompt（入力＋送信）と capture_map だけを渡す。分析は Claude の担当。
  const [activeTab, setActiveTab] = useState('chat')
  const runPromptFromVoice = useCallback(
    async (text) => {
      setActiveTab('chat')
      setRightOpen(true)
      return handleSubmit(text)
    },
    [handleSubmit],
  )
  const {
    voiceState,
    transcript: voiceTranscript,
    error: voiceError,
    elapsed: voiceElapsed,
    start: startVoice,
    stop: stopVoice,
    notifyAgentFinished,
  } = useVoiceSession({
    apiKey: settings.geminiApiKey,
    model: settings.voiceModel,
    layers,
    datasets,
    geeState,
    isAgentRunning: isRunning,
    runPrompt: runPromptFromVoice,
    setChatInput,
    enableSearch: Boolean(settings.voiceSearch),
    voiceName: settings.voiceName,
    log,
  })
  useEffect(() => {
    agentFinishedRef.current = notifyAgentFinished
  }, [notifyAgentFinished])

  // 「新しい会話」= 会話・レイヤー・データセット・チャート・ログを全消去。
  const handleNewConversation = useCallback(() => {
    handleAbort()
    clearLayers()
    clearDatasets()
    clearCharts()
    handleResetChat()
    setLogs([])
  }, [handleAbort, clearLayers, clearDatasets, clearCharts, handleResetChat])

  // --- About / パネル ---
  const [aboutOpen, setAboutOpen] = useState(() => !loadSetting(SETTINGS_KEYS.introSeen))
  const handleCloseAbout = useCallback(() => {
    setAboutOpen(false)
    saveSetting(SETTINGS_KEYS.introSeen, '1')
  }, [])
  const [rightWidth, setRightWidth] = useState(420)
  const [rightHeight, setRightHeight] = useState(null)

  const handleSaveSettings = useCallback(() => {
    save()
    geeClient.preload()
  }, [save, geeClient])
  // GEE 接続テストはクリックハンドラから同期的に開始する（ポップアップ許可のため await を挟まない）。
  const handleTestGee = useCallback(() => {
    runGeeTest(geeTest)
  }, [runGeeTest, geeTest])

  const chatDisabled = !settings.apiKey
  const chatDisabledReason = '⚙ 設定 から Claude API キーを設定してください。'
  const geeConfigured = Boolean(settings.geeClientId && settings.geeProject)

  const tabs = useMemo(
    () => [
      {
        id: 'chat',
        label: 'チャット',
        content: (
          <ChatPanel
            messages={messages}
            isRunning={isRunning}
            disabled={chatDisabled}
            disabledReason={chatDisabledReason}
            input={chatInput}
            onInputChange={setChatInput}
            inputRef={chatInputRef}
            onSubmit={handleSubmit}
            onAbort={handleAbort}
            onReset={handleNewConversation}
            chartsById={chartsById}
            onOpenChart={openChart}
            voiceSlot={
              <VoiceButton
                state={voiceState}
                transcript={voiceTranscript}
                error={voiceError}
                elapsed={voiceElapsed}
                disabled={!settings.geminiApiKey}
                disabledReason="⚙ 設定 から Gemini API キーを設定すると音声で相談できます。"
                onStart={startVoice}
                onStop={stopVoice}
              />
            }
          />
        ),
      },
      {
        id: 'layers',
        label: `レイヤー${layers.length ? ` (${layers.length})` : ''}`,
        content: (
          <div className="layers-tab">
            <LayerPanel
              layers={layers}
              onToggle={toggleLayer}
              onZoom={zoomToLayer}
              onRemove={removeLayer}
              onRebuild={rebuildLayer}
              onOpacity={(id, opacity) => updateLayer(id, { opacity })}
              onSpecChange={updateLayerSpec}
              onExportVector={handleExportVector}
              onExportViaEE={exportLayerViaEE}
              onExportTiles={exportLayerTiles}
              getMapView={getMapView}
            />
            <DatasetPanel datasets={datasets} onRemove={removeDataset} onExport={handleExportDataset} />
          </div>
        ),
      },
      { id: 'log', label: 'ログ', content: <ExecutionLog logs={logs} /> },
    ],
    [
      messages,
      isRunning,
      chatDisabled,
      chatInput,
      setChatInput,
      chatInputRef,
      handleSubmit,
      handleAbort,
      handleNewConversation,
      chartsById,
      openChart,
      voiceState,
      voiceTranscript,
      voiceError,
      voiceElapsed,
      settings.geminiApiKey,
      startVoice,
      stopVoice,
      layers,
      toggleLayer,
      zoomToLayer,
      removeLayer,
      rebuildLayer,
      updateLayer,
      updateLayerSpec,
      datasets,
      removeDataset,
      handleExportVector,
      handleExportDataset,
      exportLayerViaEE,
      exportLayerTiles,
      getMapView,
      logs,
    ],
  )

  return (
    <div className="app-shell">
      <Header
        rightOpen={rightOpen}
        onToggleRight={() => setRightOpen((v) => !v)}
        onShowAbout={() => setAboutOpen(true)}
        geeSlot={
          <GeeAuthBadge
            state={geeState}
            configured={geeConfigured}
            onLogin={geeLogin}
            onLogout={geeLogout}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        }
        settingsSlot={
          <ApiSettings
            settings={settings}
            isOpen={settingsOpen}
            onToggle={() => setSettingsOpen((v) => !v)}
            onFieldChange={setField}
            onSave={handleSaveSettings}
            onDeleteKeys={deleteKeys}
            tests={tests}
            onTestClaude={testClaude}
            onTestGee={handleTestGee}
            onTestGemini={testGemini}
          />
        }
      />
      <div className="workspace">
        <MapView
          layers={layers}
          colormapTexture={colormapTexture}
          hoverItems={hoverItems}
          onMapReady={handleMapReady}
          onDeviceInitialized={setDevice}
          onMouseMove={handleMouseMove}
          onMouseLeave={clearHover}
          onTileError={handleTileError}
          onTileUnload={handleTileUnload}
        />
        <Sidebar
          side="right"
          open={rightOpen}
          width={rightWidth}
          onWidthChange={setRightWidth}
          height={rightHeight}
          onHeightChange={setRightHeight}
          minWidth={300}
          maxWidth={760}
        >
          <TabbedPanel tabs={tabs} activeId={activeTab} onTabChange={setActiveTab} />
        </Sidebar>
      </div>

      <ChartDialog chart={openChartId ? chartsById.get(openChartId) : null} onClose={closeChart} />
      {aboutOpen && <AboutModal onClose={handleCloseAbout} />}
    </div>
  )
}

export default App
