// エージェント（チャット）セッションの結線。
//
// 役割: チャット状態（messages / isRunning / chatInput）と会話永続化（ConversationStore）を所有し、
//       runAgent へ callClaude / toolRegistry / system を注入して実行する。onEvent で
//       「途中経過→チャット」「ツール実行→ログ」を出し分ける。ツールからの postChatMessage
//       （チャートカード）もここで受ける。onFinished で実行完了（status/本文/追加レイヤー）を通知する（音声読み上げ用）。
// 注入: { geeClient, geeState, datasetStore, layerStore, chartStore, addRasterLayer, addVectorLayer,
//         removeLayer, updateLayer, updateLayerSpec, getMapView, fitBounds, layers, datasets,
//         apiKey, model, maxTokens, log }
// 流用元: reference/web-gis-ai-agent/src/hooks/useAgentSession.js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { runAgent } from '../agent/runtime'
import { callClaude } from '../agent/claude-client'
import { composeSystemPrompt } from '../agent/system-prompt'
import { buildSystemBlocks } from '../agent/system-context.js'
import { ConversationStore } from '../agent/conversation-store'
import { createToolRegistry } from '../tools/register-tools'
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
  onFinished,
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
      if (!apiKey || isRunning) return false
      const layersBefore = new Set(layerStore.list().map((l) => l.layerId))
      const chartsBefore = chartStore.list().length
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
          system: buildSystemBlocks({ systemPrompt: SYSTEM_PROMPT, layers, datasets, geeState, mapView: getMapView?.() }),
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
        // 音声セッションなどへ完了を通知（追加されたレイヤー名・チャート数つき）。
        try {
          onFinished?.({
            status: result.status,
            content: result.content ?? '',
            addedLayers: layerStore.list().filter((l) => !layersBefore.has(l.layerId)).map((l) => l.name),
            addedCharts: Math.max(0, chartStore.list().length - chartsBefore),
          })
        } catch {
          // 通知失敗は無視
        }
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
        try {
          onFinished?.({ status: 'error', content: String(e?.message ?? e), addedLayers: [], addedCharts: 0 })
        } catch {
          // 無視
        }
      } finally {
        setIsRunning(false)
        abortRef.current = null
      }
      return true
    },
    [apiKey, isRunning, toolRegistry, layers, datasets, geeState, getMapView, model, maxTokens, log, onFinished, layerStore, chartStore],
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
