// EE エラー文言の正規化テスト。
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEeError } from '../src/gee/ee-errors.js'

test('既知のエラーにはヒントが付く', () => {
  assert.match(normalizeEeError(new Error('User memory limit exceeded.')), /ヒント:.*scale/)
  assert.match(normalizeEeError('Image.select: Pattern \'B9\' did not match any bands.'), /ヒント/)
  assert.match(normalizeEeError('Computation timed out.'), /タイムアウト/)
})

test('未知のエラーは原文のまま', () => {
  assert.equal(normalizeEeError('something odd'), 'something odd')
})

import { describeGeeAuthError } from '../src/gee/ee-errors.js'

test('認証エラーには設定見直しのヒントが付く', () => {
  assert.match(describeGeeAuthError('Error: origin_mismatch'), /JavaScript 生成元/)
  assert.match(describeGeeAuthError('Earth Engine API has not been used in project 123 before or it is disabled'), /未登録|有効化/)
  assert.match(describeGeeAuthError('popup_closed_by_user'), /ポップアップ/)
  assert.equal(describeGeeAuthError('plain'), 'plain')
})
