// code-runner（禁止 API・コンパイル・実行）のテスト。ee は疑似オブジェクトで代用。
import test from 'node:test'
import assert from 'node:assert/strict'
import { checkForbidden, compileEeCode, resolveResult, runEeCode } from '../src/gee/code-runner.js'

class ComputedObject {
  constructor(v) {
    this.v = v
  }
  evaluate(cb) {
    setTimeout(() => cb(this.v, null), 0)
  }
}
const fakeEe = { ComputedObject, Number: (v) => new ComputedObject(v) }

test('禁止 API を含むコードは弾く', () => {
  assert.throws(() => checkForbidden('fetch("https://x")'), /許可されていない/)
  assert.throws(() => checkForbidden('ee.data.authenticateViaOauth(1)'), /許可されていない/)
  assert.throws(() => compileEeCode(''), /空/)
  assert.throws(() => compileEeCode('return ('), /構文エラー/)
})

test('コードは ee / ctx を受けて return 値を返す', async () => {
  const v = await runEeCode({ ee: fakeEe, code: 'return ee.Number(ctx.n * 2)', ctx: { n: 21 } })
  assert.ok(v instanceof ComputedObject)
  assert.equal(await resolveResult(fakeEe, v), 42)
  assert.deepEqual(await resolveResult(fakeEe, { a: fakeEe.Number(1), b: [fakeEe.Number(2), 3] }), { a: 1, b: [2, 3] })
})

test('実行時例外はメッセージ付きで伝わる', async () => {
  await assert.rejects(runEeCode({ ee: fakeEe, code: 'throw new Error("Too many pixels in the region")' }), /Too many pixels[\s\S]*ヒント/)
})
