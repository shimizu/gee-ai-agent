// バンド配列 → GPU テクスチャ用データの整形（純関数）と、luma.gl テクスチャの生成。
//
// 役割: 1 バンドは r32float、2〜4 バンドは rgba32float にインターリーブ（不足チャネルは 0、
//       alpha は 1）して、deck.gl-raster の CreateTexture が読める形にする。
// 関係: layer-factory.js の getTileData が使う。packBands は node --test 対象。

// bands: Float32Array[]（同じ長さ）。戻り値 { format, data, channels }。
export function packBands(bands, width, height) {
  if (!Array.isArray(bands) || bands.length === 0) throw new Error('bands が空です。')
  const n = width * height
  for (const b of bands) {
    if (b.length !== n) throw new Error(`バンド長が不一致です: ${b.length} != ${n}`)
  }
  if (bands.length === 1) {
    return { format: 'r32float', data: bands[0], channels: 1 }
  }
  if (bands.length > 4) throw new Error('バンド数は最大 4 です。')
  const data = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    data[o] = bands[0][i]
    data[o + 1] = bands[1][i]
    data[o + 2] = bands[2] ? bands[2][i] : 0
    data[o + 3] = bands[3] ? bands[3][i] : 1
  }
  return { format: 'rgba32float', data, channels: bands.length }
}

// luma.gl Device に float テクスチャを作る（nearest / clamp、mip 無し）。
export function createRasterTexture(device, packed, width, height) {
  return device.createTexture({
    format: packed.format,
    width,
    height,
    data: packed.data,
    mipLevels: 1,
    sampler: {
      minFilter: 'nearest',
      magFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    },
  })
}
