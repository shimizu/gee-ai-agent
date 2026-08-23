// エージェント（チャット）セッションの結線。
//
// 役割: チャット状態（messages / isRunning / chatInput）と会話永続化（ConversationStore）を所有し、
//       runAgent へ callClaude / toolRegistry / system を注入して実行する。onEvent で
//       「途中経過→チャット」「ツール実行→ログ」を出し分ける。ツールからの postChatMessage
//       （チャートカード）もここで受ける。
// 注入: { geeClient, geeState, datasetStore, layerStore, chartStore, addRasterLayer, addVectorLayer,
//         removeLayer, updateLayer, updateLayerSpec, getMapView, fitBounds, layers, datasets,
//         apiKey, model, maxTokens, log }
// 流用元: reference/web-gis-ai-agent/src/hooks/useAgentSession.js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { runAgent } from '../agent/runtime'
import { callClaude } from '../agent/claude-client'
import { composeSystemPrompt } from '../agent/system-prompt'
import { ConversationStore } from '../agent/conversation-store'
import { createToolRegistry } from '../tools/register-tools'
import { summarizeLayer } from '../tools/map/handlers.js'
import { roundBounds } from '../utils/format.js'
import { uuid } from '../utils/ids.js'

const conversationStore = new ConversationStore()
const SYSTEM_PROMPT = composeSystemPrompt()
const agentSession = { originPrompt: '' }
const CHAT_VIEW_STORAGE = 'gee-agent.chat-view'

function loadChatView() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(CHAT_VIEW_STORAGE) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// 安定プレフィックス（BASE+スキル）と揮発ブロック（GEE 状態・レイヤー・データセット・表示範囲）を
// 別ブロックにして、安定部分のプロンプトキャッシュを効かせる。
export function buildSystemBlocks({ layers, datasets, geeState, mapView }) {
  const blocks = [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]
  const parts = []
  parts.push(
    geeState?.status === 'ready'
      ? `## GEE 状態\n- 認証: ready / project: ${geeState.project}`
      : `## GEE 状態\n- 未ログイン（status: ${geeState?.status ?? 'idle'}）。GEE 系ツールは失敗します。ユーザーにヘッダーの「GEE ログイン」を案内してください。PortWatch のツールは使えます。`,
  )
  if (layers?.length) {
    const list = layers
      .map((l) => {
        const s = summarizeLayer(l)
        const extra =
          l.kind === 'ee-raster'
            ? `${s.mode} bands=[${(s.bandNames ?? []).join(',')}]${s.mode === 'raw' ? ` colormap=${s.colormap} rescale=[${(s.rescale ?? []).join(',')}]` : ''} status=${s.status}`
            : `vector ${s.geomType ?? '?'} ${s.featureCount ?? '?'} 地物`
        return `- ${l.layerId} "${l.name}" ${extra}${l.visible === false ? ' (非表示)' : ''}`
      })
      .join('\n')
    parts.push(`## 現在のレイヤー\n${list}`)
  }
  if (datasets?.length) {
    const list = datasets
      .map(
        (d) =>
          `- ${d.id} "${d.title}" ${d.recordCount} 行 cols=[${(d.columns ?? []).slice(0, 12).join(',')}]${d.dateRange ? ` ${d.dateRange.from}〜${d.dateRange.to}` : ''} source=${d.source}`,
      )
      .join('\n')
    parts.push(`## データセット\n${list}`)
  }
  if (mapView?.bounds) {
    parts.push(`## 現在の地図表示範囲\nbounds=[${roundBounds(mapView.bounds, 2).join(', ')}] zoom=${Math.round(mapView.zoom * 10) / 10}`)
  }
  blocks.push({ type: 'text', text: parts.join('\n\n'), cache_control: { type: 'ephemeral' } })
  return blocks
}

function shortInput(input) {
  try {
    const s = JSON.stringify(input)
    return s.length > 100 ? `${s.slice(0, 100)}…` : s
  } catch {
    return ''
  }
}

export function useAgentSession({
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
  apiKey,
  model,
  maxTokens,
  log,
}) {
  const [messages, setMessages] = useState(loadChatView)
  const [isRunning, setIsRunning] = useState(false)
  const abortRef = useRef(null)
  const [chatInput, setChatInput] = useState('')
  const chatInputRef = useRef(null)

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(CHAT_VIEW_STORAGE, JSON.stringify(messages))
    } catch {
      // 容量超過などでも現在の画面上の会話は継続する。
    }
  }, [messages])

  const postChatMessage = useCallback((message) => {
    setMessages((cur) => [...cur, { id: uuid(), role: 'assistant', ...message }])
  }, [])

  const toolRegistry = useMemo(
    () =>
      createToolRegistry({
        geeClient,
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
        postChatMessage,
        getDatasetGeojson: (id) => datasetStore.get(id)?.geojson ?? null,
        session: agentSession,
        log,
      }),
    [
      geeClient,
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
      postChatMessage,
      log,
    ],
  )

  const handleSubmit = useCallback(
    async (content) => {
      if (!apiKey || isRunning) return
      setMessages((cur) => [...cur, { id: uuid(), role: 'user', content }])
      setIsRunning(true)
      const controller = new AbortController()
      abortRef.current = controller
      agentSession.originPrompt = content
      try {
        const result = await runAgent({
          instruction: content,
          messages: conversationStore.getMessages(),
          toolRegistry,
          system: buildSystemBlocks({ layers, datasets, geeState, mapView: getMapView?.() }),
          signal: controller.signal,
          callModel: (req) => callClaude({ ...req, apiKey, model, maxTokens }),
          onEvent: (event) => {
            if (event.type === 'assistant_text') {
              setMessages((cur) => [...cur, { id: uuid(), role: 'assistant', kind: 'progress', content: event.text }])
            } else if (event.type === 'tool_start') {
              log(`▶ ${event.name} ${shortInput(event.input)}`)
            } else if (event.type === 'tool_success') {
              log(`✓ ${event.name}`)
            } else if (event.type === 'tool_error') {
              log(`✗ ${event.name}: ${event.message}`)
            }
          },
        })
        conversationStore.setMessages(result.messages)
        if (result.content && result.status !== 'aborted' && result.status !== 'refused') {
          setMessages((cur) => [...cur, { id: uuid(), role: 'assistant', content: result.content }])
        } else if (result.status === 'aborted') {
          setMessages((cur) => [...cur, { id: uuid(), role: 'assistant', kind: 'notice', content: '中断しました。' }])
        } else if (result.status === 'refused') {
          setMessages((cur) => [...cur, { id: uuid(), role: 'assistant', kind: 'notice', content: '回答が拒否されました。' }])
        }
      } catch (e) {
        setMessages((cur) => [
          ...cur,
          { id: uuid(), role: 'assistant', kind: 'notice', content: `エラー: ${String(e?.message ?? e)}` },
        ])
      } finally {
        setIsRunning(false)
        abortRef.current = null
      }
    },
    [apiKey, isRunning, toolRegistry, layers, datasets, geeState, getMapView, model, maxTokens, log],
  )

  const handleAbort = useCallback(() => abortRef.current?.abort(), [])
  const handleResetChat = useCallback(() => {
    conversationStore.clear()
    setMessages([])
    setChatInput('')
    try {
      globalThis.localStorage?.removeItem(CHAT_VIEW_STORAGE)
    } catch {
      // 無視
    }
  }, [])

  return {
    messages,
    isRunning,
    chatInput,
    setChatInput,
    chatInputRef,
    handleSubmit,
    handleAbort,
    handleResetChat,
    postChatMessage,
  }
}
