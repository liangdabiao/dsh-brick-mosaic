// 端到端回归：面板「生成马赛克 → 💾 存到作品档案 → 📁 作品档案里能看到」整条链路。
//
// 用法（用临时 DSH_HOME 起面板服务，别污染真实档案）：
//   DSH_HOME=%TEMP%\bm-e2e-home node scripts/devserver.mjs 5251
//   BASE=http://127.0.0.1:5251 node scripts/e2e-save.mjs
import { createRequire } from 'node:module'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = (process.env.BASE || 'http://127.0.0.1:5250').replace(/\/$/, '')
const BASE = ROOT + '/brick-mosaic/'
const API = BASE + 'api'

function loadPlaywright() {
  for (const dir of ['C:/Users/' + (process.env.USERNAME || '') + '/.dsh/profiles/desktop/node_modules/', process.cwd() + '/']) {
    try { return createRequire(dir)('playwright') } catch {}
  }
  return null
}
const pw = loadPlaywright()
if (!pw) { console.log('SKIP: 找不到 playwright'); process.exit(0) }

const PNG = join(mkdtempSync(join(tmpdir(), 'bm-save-')), 'bm-save-test.png')
const checks = []
const check = (name, ok, extra = '') => { checks.push([name, ok]); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')) }

const browser = await pw.chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  await page.goto(BASE, { waitUntil: 'networkidle' })

  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 240; c.height = 240
    const x = c.getContext('2d')
    const g = x.createLinearGradient(0, 0, 240, 240)
    g.addColorStop(0, '#123456'); g.addColorStop(1, '#e8a040')
    x.fillStyle = g; x.fillRect(0, 0, 240, 240)
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(120, 120, 60, 0, Math.PI * 2); x.fill()
    return c.toDataURL('image/png')
  })
  writeFileSync(PNG, Buffer.from(dataUrl.split(',')[1], 'base64'))

  // 小尺寸 + 一个套装，确保「生成马赛克」按钮会被解禁
  await page.setInputFiles('#imageFile', PNG)
  await page.waitForFunction(() => document.getElementById('imageAdjustmentsRow').hidden === false)
  await page.fill('#widthInputValue', '16')
  await page.dispatchEvent('#widthInputValue', 'change')
  await page.fill('#heightInputValue', '16')
  await page.dispatchEvent('#heightInputValue', 'change')
  await page.fill('#inputElvis', '1')
  await page.dispatchEvent('#inputElvis', 'change')
  await page.waitForFunction(() => !document.getElementById('buttonCalculate').disabled, { timeout: 10000 })
  check('生成马赛克按钮已解禁', true)

  await page.click('#buttonCalculate')
  await page.waitForFunction(() => !document.getElementById('buttonDownloadPDF').disabled, { timeout: 120000 })
  check('计算完成（下载按钮解禁）', true)

  await page.waitForFunction(() => !document.getElementById('buttonSaveProject').disabled, { timeout: 5000 })
  await page.click('#buttonSaveProject')
  await page.waitForFunction(() => /已存档/.test(document.getElementById('bm-toast')?.textContent || ''), { timeout: 15000 })
  const toast = await page.textContent('#bm-toast')
  check('存档成功提示（含预览图）', /已存档/.test(toast) && toast.includes('含预览图'), toast)

  // 缩略图必须真的存下来并能读回
  const listRes = await (await fetch(API + '/projects')).json()
  const saved = (listRes.projects || []).find((p) => p.title === 'bm-save-test')
  check('存档带 has_image', !!(saved && saved.has_image))
  const imgRes = await fetch(API + '/project/image?id=' + saved.id)
  const imgBuf = Buffer.from(await imgRes.arrayBuffer())
  check('PNG 可读且是 PNG 头', imgRes.ok && imgRes.headers.get('content-type') === 'image/png' && imgBuf[0] === 0x89 && imgBuf.subarray(1, 4).toString() === 'PNG', `${imgBuf.length}B`)

  // 徽标应立刻变成 1
  await page.waitForFunction(() => document.getElementById('archiveCount')?.hidden === false, { timeout: 5000 })
  check('作品档案徽标变为 1', (await page.textContent('#archiveCount')).trim() === '1')

  // 打开档案，确认作品在列表里，且详情颗粒数 = 16×16
  await page.click('#buttonOpenArchive')
  await page.waitForSelector('#archiveBody .bm-arch-table tbody tr', { timeout: 5000 })
  const rows = await page.$$('#archiveBody .bm-arch-table tbody tr')
  check('档案列表 1 行', rows.length === 1, `实际 ${rows.length}`)
  const listText = await page.textContent('#archiveBody')
  check('标题取自文件名', listText.includes('bm-save-test'))
  check('尺寸 16×16 且 256 颗粒', listText.includes('16×16') && listText.includes('256'))
  const thumbOk = await page.evaluate(() => {
    const img = document.querySelector('#archiveBody img.bm-arch-thumb')
    return !!(img && img.complete && img.naturalWidth > 0)
  })
  check('档案列表显示马赛克缩略图', thumbOk)

  await page.click('#archiveBody .bm-arch-open')
  await page.waitForSelector('#bmArchBack', { timeout: 5000 })
  const detail = await page.textContent('#archiveBody')
  const total = (detail.match(/合计\s*(\d+)/) || [])[1]
  check('详情合计 256', total === '256', `实际 ${total}`)
  const previewOk = await page.evaluate(() => {
    const img = document.querySelector('#archiveBody img.bm-arch-preview')
    return !!(img && img.complete && img.naturalWidth > 0)
  })
  check('详情显示马赛克预览图', previewOk)

  // 收尾：删掉这条测试作品（缩略图应一起清掉）
  await page.click('#bmArchBack')
  await page.waitForSelector('#bmArchAll', { timeout: 5000 })
  await page.click('#archiveBody .bm-arch-del')
  await page.waitForSelector('#archiveBody .bm-arch-empty', { timeout: 5000 })
  check('删除后回到空态', true)
  const goneRes = await fetch(API + '/project/image?id=' + saved.id)
  check('删除后缩略图也删掉了', goneRes.status === 404)
  check('无页面 JS 报错', errors.length === 0, errors.join(' | '))
} finally {
  await browser.close()
}

// 兜底清理：万一页面流程中断，按标题扫一遍删除
try {
  const { projects } = await (await fetch(API + '/projects')).json()
  for (const p of projects || []) {
    if (p.title === 'bm-save-test') {
      await fetch(API + '/project/remove', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: p.id }) })
    }
  }
} catch {}

const pass = checks.every(([, ok]) => ok)
console.log(pass ? 'e2e 通过：生成 → 存档 → 档案可见/详情/删除 全链路正常' : 'e2e 失败')
process.exitCode = pass ? 0 : 1
