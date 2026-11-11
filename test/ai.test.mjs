// 单测：ai.js 的 JPEG 尺寸探测与输出档位选择（离线，无网络）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jpegSize, pickSize, DEFAULT_AI_KEY } from '../lib/ai.js'

// 构造最小 JPEG：SOI + 完整 APP0(16B) + SOF0(17B, 含 w/h) + EOI
function fakeJpeg(width, height) {
  const sof = Buffer.from([
    0xFF, 0xC0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xFF, height & 0xFF, // height 在前
    (width >> 8) & 0xFF, width & 0xFF,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ])
  return Buffer.concat([
    Buffer.from([0xFF, 0xD8]), // SOI
    Buffer.from([0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]), // APP0 len=16
    sof,
    Buffer.from([0xFF, 0xD9]), // EOI
  ])
}

test('ai: jpegSize 读出宽高（SOF 标记）', () => {
  const dim = jpegSize(fakeJpeg(640, 480))
  assert.deepEqual(dim, { width: 640, height: 480 })
  assert.deepEqual(jpegSize(fakeJpeg(100, 300)), { width: 100, height: 300 })
})
test('ai: jpegSize 容错（非 JPEG/截断）', () => {
  assert.equal(jpegSize(Buffer.from('not a jpeg')), null)
  assert.equal(jpegSize(Buffer.from([0xFF, 0xD8])), null)
})
test('ai: pickSize 按比例选档（横/方/竖）', () => {
  assert.equal(pickSize(fakeJpeg(1024, 512)), '1024x768') // ratio 2.0 → 横
  assert.equal(pickSize(fakeJpeg(1000, 1000)), '1024x1024') // 方
  assert.equal(pickSize(fakeJpeg(400, 900)), '768x1024') // ratio 0.44 → 竖
  assert.equal(pickSize(Buffer.alloc(0)), '1024x1024') // 解析失败兜底
})
test('ai: 内置 key 存在（agnes 体验价 $0）', () => {
  assert.match(DEFAULT_AI_KEY, /^sk-/)
})
