// 実行ログパネル。
// 流用元: reference/web-gis-ai-agent/src/components/ExecutionLog.jsx
//
// 役割: 取込・SQL 実行・（Phase B では）エージェントのツール実行やエラー自己修正の経過を
//       時系列で表示する（UI.md §3.3）。
// 関係: logs は App が保持する [{ id, message }] 配列。新しいものを末尾に積む。
function ExecutionLog({ logs }) {
  if (!logs || logs.length === 0) {
    return <p className="empty-state">操作ログはまだありません。</p>
  }
  return (
    <ul className="execution-log">
      {logs.map((entry) => (
        <li key={entry.id}>{entry.message}</li>
      ))}
    </ul>
  )
}

export default ExecutionLog
