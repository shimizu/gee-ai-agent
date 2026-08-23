// Earth Engine のコールバック API を Promise 化する薄いラッパ。
//
// 役割: evaluate / getMap / getMapId のコールバックを await できるようにし、タイムアウトを
//       付ける。EE の XHR は中断できないため、タイムアウトは「待つのをやめる」だけ。
// 関係: code-runner.js / map-service.js / layer-factory.js が使う。
export function withTimeout(promise, ms, message) {
  if (!ms || ms <= 0) return promise
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message ?? `タイムアウト（${ms}ms）`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// ee.ComputedObject#evaluate の Promise 版。
export function evaluate(obj, { timeoutMs = 180_000 } = {}) {
  return withTimeout(
    new Promise((resolve, reject) => {
      try {
        obj.evaluate((value, error) => {
          if (error) reject(new Error(String(error)))
          else resolve(value)
        })
      } catch (e) {
        reject(e)
      }
    }),
    timeoutMs,
    'Earth Engine の計算がタイムアウトしました。scale を粗くする・region を狭める・期間を短くするなどして再試行してください。',
  )
}

// ee.data.getMapId の Promise 版。params は { image, format?, bands?, min?, max?, palette?, ... }。
export function getMapIdAsync(ee, params, { timeoutMs = 120_000 } = {}) {
  return withTimeout(
    new Promise((resolve, reject) => {
      try {
        ee.data.getMapId(params, (mapId, error) => {
          if (error || !mapId) reject(new Error(String(error ?? 'getMapId が空を返しました')))
          else resolve(mapId)
        })
      } catch (e) {
        reject(e)
      }
    }),
    timeoutMs,
    'マップタイルの作成（getMapId）がタイムアウトしました。',
  )
}
