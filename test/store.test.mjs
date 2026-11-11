// 单测：档案库（save/list/aggregate/remove）+ 原项目色板完整性（11 套装 × 六元组）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'dsh-brick-mosaic-test-'))
process.env.DSH_HOME = tmp
const store = await import('../lib/store.js')

const SAMPLE_PARTS = [
  [5, 19, 29, 100, 98138, '6284070'],
  [255, 255, 255, 200, 98138, '6284572'],
  [201, 26, 9, 50, 6141, '614121'],
]

test('store: 存档/清单/详情/删除', () => {
  const rec = store.saveProject({ title: '测试猫', width: 48, height: 48, sets: { Elvis: 1, Batman: 0.5 }, parts: SAMPLE_PARTS, filename: 'cat.png' })
  assert.ok(rec.id)
  assert.equal(rec.sets.Batman, 0.5)
  const all = store.listProjects()
  assert.equal(all.length, 1)
  assert.equal(all[0].total_parts, 350)
  const got = store.getProject(rec.id)
  assert.equal(got.parts[0][5], '6284070')
  assert.equal(store.removeProject(rec.id), true)
  assert.equal(store.listProjects().length, 0)
  assert.throws(() => store.saveProject({ title: 'x', width: 0, height: 48, parts: SAMPLE_PARTS }), /width\/height/)
  assert.throws(() => store.saveProject({ title: 'x', width: 48, height: 48, parts: [] }), /parts/)
})

test('store: 跨作品零件聚合（采购清单）', () => {
  store.saveProject({ title: 'A', width: 48, height: 48, parts: [[0, 0, 0, 100, 98138, 'X1'], [255, 0, 0, 30, 6141, 'R1']] })
  store.saveProject({ title: 'B', width: 48, height: 48, parts: [[0, 0, 0, 50, 98138, 'X1'], [0, 255, 0, 10, 6141, 'G1']] })
  const agg = store.aggregateParts()
  assert.equal(agg.projects.length, 2)
  assert.equal(agg.total, 190)
  const x1 = agg.parts.find((p) => p.element === 'X1')
  assert.equal(x1.count, 150) // 100 + 50 聚合
  const onlyA = store.aggregateParts([store.listProjects().find((p) => p.title === 'A').id])
  assert.equal(onlyA.total, 130)
  store.clearAll?.()
})

test('store: 存档带马赛克 PNG（读回 / 列表标记 / 删除清理）', () => {
  // 1×1 透明 PNG
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const rec = store.saveProject({ title: '带图作品', width: 32, height: 32, parts: SAMPLE_PARTS, image: png, imageWidth: 960, imageHeight: 960 })
  assert.equal(rec.image.mime, 'image/png')
  assert.equal(rec.image.width, 960)
  const all = store.listProjects()
  const item = all.find((p) => p.id === rec.id)
  assert.equal(item.has_image, true)
  const img = store.readImage(rec.id)
  assert.ok(img && img.mime === 'image/png')
  const bytes = readFileSync(img.file)
  assert.equal(bytes[0], 0x89) // PNG magic
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG')
  // 删除时缩略图一起清掉
  assert.equal(store.removeProject(rec.id), true)
  assert.equal(store.readImage(rec.id), null)
  // 非法的 image 字段不会写文件
  const rec2 = store.saveProject({ title: '无图', width: 32, height: 32, parts: SAMPLE_PARTS, image: 'not-a-data-url' })
  assert.equal(rec2.image, undefined)
  store.removeProject(rec2.id)
})

test('原项目色板完整性：11 套装，全部六元组', () => {
  const src = readFileSync(new URL('../lab/brickMosaic.js', import.meta.url), 'utf8')
  const cases = [...src.matchAll(/case "(Beatles|Monroe|IronMan|Sith|Hogwarts|Portrait|Mickey|World|ArtProject|Elvis|Batman)":\s*var partList = \[([\s\S]*?)\];/g)]
  assert.equal(cases.length, 11, `应找到 11 个套装色板，实际 ${cases.length}`)
  for (const [, id, body] of cases) {
    const rows = [...body.matchAll(/\[(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]/g)]
    assert.ok(rows.length >= 5, `${id} 色板应至少 5 种颜色，实际 ${rows.length}`)
    for (const row of rows) {
      const [, r, g, b] = row
      assert.ok(Number(r) >= 0 && Number(r) <= 255 && Number(g) >= 0 && Number(g) <= 255 && Number(b) >= 0 && Number(b) <= 255, `${id} 有非法 RGB`)
    }
  }
})

test.after ?? test.after(() => rmSync(tmp, { recursive: true, force: true }))
