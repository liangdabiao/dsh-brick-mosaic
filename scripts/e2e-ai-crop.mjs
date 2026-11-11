// 端到端回归：自定义裁剪 → AI 风格优化返回后，缩略图/马赛克预览必须立刻换成 AI 图。
//
// 背景（v0.1.2 修复）：AI 结果替换 previewImg.src 后，customCrop.croppedCanvas 还是旧裁剪结果，
// drawPreviewImage 继续读它 → 画面停在旧图，要手动切一次裁剪模式才刷新。本脚本把这个行为钉住。
//
// 用法：
//   1) 起面板服务：node scripts/devserver.mjs 5250
//   2) node scripts/e2e-ai-crop.mjs            # PORT 环境变量可改端口
// 依赖 playwright（不随插件安装）：优先用 DSH 桌面 profile 里的那一份，找不到就 SKIP。
import { createRequire } from 'node:module'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const PORT = process.env.PORT || '5250'
const BASE = `http://127.0.0.1:${PORT}/brick-mosaic/`

function loadPlaywright() {
  const candidates = [
    'C:/Users/' + (process.env.USERNAME || '') + '/.dsh/profiles/desktop/node_modules/',
    process.cwd() + '/',
  ]
  for (const dir of candidates) {
    try {
      const req = createRequire(dir)
      return req('playwright')
    } catch {}
  }
  return null
}

const pw = loadPlaywright()
if (!pw) {
  console.log('SKIP: 找不到 playwright（本脚本只在装了浏览器的开发机上跑，不属于 npm test）')
  process.exit(0)
}

const PNG = join(mkdtempSync(join(tmpdir(), 'bm-e2e-')), 'src.png')
const browser = await pw.chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const logs = []
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))

  // 源图：渐变 + 红块（保证裁剪后画面确实变化）
  const srcDataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 480; c.height = 360
    const x = c.getContext('2d')
    const g = x.createLinearGradient(0, 0, 480, 360)
    g.addColorStop(0, '#123456'); g.addColorStop(1, '#e8c060')
    x.fillStyle = g; x.fillRect(0, 0, 480, 360)
    x.fillStyle = '#ff0000'; x.fillRect(0, 0, 120, 120)
    return c.toDataURL('image/png')
  })
  writeFileSync(PNG, Buffer.from(srcDataUrl.split(',')[1], 'base64'))

  // AI 打桩：洋红 + 中间白条，与源图完全不同
  const aiDataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 320; c.height = 240
    const x = c.getContext('2d')
    x.fillStyle = '#ff00ff'; x.fillRect(0, 0, 320, 240)
    x.fillStyle = '#ffffff'; x.fillRect(0, 100, 320, 40)
    return c.toDataURL('image/png')
  })
  await page.route('**/brick-mosaic/api/ai-optimize', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ imageUrl: aiDataUrl }) }))

  await page.goto(BASE, { waitUntil: 'networkidle' })

  const thumb = () => page.evaluate(() => document.getElementById('thumbnailCanvas').toDataURL())
  const pxAt = (rx, ry) => page.evaluate(([x, y]) => {
    const c = document.getElementById('thumbnailCanvas')
    const d = c.getContext('2d').getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data
    return [d[0], d[1], d[2], d[3]]
  }, [rx, ry])
  const btnState = () => page.evaluate(() => ({
    custom: document.getElementById('customCropButton').classList.contains('active'),
    center: document.getElementById('cropCenterSquareButton').classList.contains('active'),
  }))

  await page.setInputFiles('#imageFile', PNG)
  await page.waitForFunction(() => document.getElementById('imageAdjustmentsRow').hidden === false)
  await page.waitForTimeout(600)
  const thumbOriginal = await thumb()

  // 自定义裁剪 → 确认
  await page.click('#customCropButton')
  await page.waitForSelector('#customCropModal.show', { timeout: 5000 })
  await page.waitForTimeout(700) // 等 cropper 初始化
  await page.click('#confirmCropBtn')
  await page.waitForFunction(() => !document.getElementById('customCropModal').classList.contains('show'))
  await page.waitForTimeout(500)
  const thumbCropped = await thumb()

  // AI 优化
  await page.click('#buttonAiOptimize')
  await page.waitForFunction(
    () => document.getElementById('aiOptimizeStatus').textContent.includes('优化完成'),
    { timeout: 15000 })
  await page.waitForTimeout(600)

  const thumbAfterAi = await thumb()
  const magenta = await pxAt(0.85, 0.85)
  const whiteBar = await pxAt(0.5, 0.5)
  const state = await btnState()

  const checks = [
    ['原图≠裁剪图', thumbOriginal !== thumbCropped],
    ['裁剪图≠AI 图（核心断言）', thumbCropped !== thumbAfterAi],
    ['AI 后画面为洋红', magenta[0] > 200 && magenta[1] < 60 && magenta[2] > 200],
    ['AI 后中间白条在位', whiteBar[0] > 240 && whiteBar[1] > 240 && whiteBar[2] > 240],
    ['裁剪按钮已复位', !state.custom && state.center],
  ]
  for (const [name, ok] of checks) console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
  if (logs.length) console.log('--- page errors ---\n' + logs.join('\n'))
  const pass = checks.every(([, ok]) => ok)
  console.log(pass ? 'e2e 通过：AI 返回后画面立刻更新' : 'e2e 失败')
  process.exitCode = pass ? 0 : 1
} finally {
  await browser.close()
}
