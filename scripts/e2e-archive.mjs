// 端到端回归：作品档案（列表 / 详情 / 采购清单 / 删除 / 空态）。
//
// 用法（别污染真实档案，用临时 DSH_HOME 起面板服务）：
//   DSH_HOME=%TEMP%\bm-e2e-home node scripts/devserver.mjs 5251
//   BASE=http://127.0.0.1:5251 node scripts/e2e-archive.mjs
// 依赖 playwright（不随插件安装）：优先用 DSH 桌面 profile 里的那一份，找不到就 SKIP。
import { createRequire } from 'node:module'

const BASE = (process.env.BASE || 'http://127.0.0.1:5250').replace(/\/$/, '') + '/brick-mosaic/'
const API = BASE + 'api'

function loadPlaywright() {
  for (const dir of ['C:/Users/' + (process.env.USERNAME || '') + '/.dsh/profiles/desktop/node_modules/', process.cwd() + '/']) {
    try { return createRequire(dir)('playwright') } catch {}
  }
  return null
}

const pw = loadPlaywright()
if (!pw) {
  console.log('SKIP: 找不到 playwright（本脚本只在装了浏览器的开发机上跑，不属于 npm test）')
  process.exit(0)
}

async function post(path, body) {
  const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(data)}`)
  return data
}

// ── 造数据：两个作品，element 300121 有重叠以便验证聚合 ──────────────────
const A = await post('/project', {
  title: '测试猫', width: 48, height: 48, sets: { Elvis: 1 }, filename: 'cat.png',
  parts: [[255, 0, 0, 100, 1, '300121'], [0, 0, 255, 250, 1, '300123'], [255, 255, 255, 10, 1, '300101']],
})
const B = await post('/project', {
  title: '测试蝙蝠', width: 32, height: 48, sets: { Batman: 2 }, filename: 'bat.png',
  parts: [[255, 0, 0, 50, 1, '300121'], [0, 128, 0, 30, 1, '300199']],
})
console.log(`seeded: A=${A.id.slice(0, 8)} (360) B=${B.id.slice(0, 8)} (80)`)

const browser = await pw.chromium.launch()
const checks = []
const check = (name, ok, extra = '') => { checks.push([name, ok]); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')) }

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept()) // 删除确认框
  await page.goto(BASE, { waitUntil: 'networkidle' })

  // 1) 入口按钮上的数量徽标
  await page.waitForFunction(() => document.getElementById('archiveCount')?.hidden === false, { timeout: 5000 })
  check('档案按钮显示数量 2', (await page.textContent('#archiveCount')).trim() === '2')

  // 2) 打开档案 → 列表
  await page.click('#buttonOpenArchive')
  await page.waitForSelector('#archiveModal.show', { timeout: 5000 })
  await page.waitForSelector('#archiveBody .bm-arch-table tbody tr', { timeout: 5000 })
  const rows = await page.$$('#archiveBody .bm-arch-table tbody tr')
  const toolbar = await page.textContent('#archiveBody .bm-arch-toolbar')
  check('列表 2 行', rows.length === 2, `实际 ${rows.length}`)
  check('统计：2 个作品 · 440 颗粒', toolbar.includes('2 个作品') && toolbar.includes('440'))

  // 3) 详情：测试猫 = 3 色 360 颗粒
  await page.click(`#archiveBody tr:has(.bm-arch-id:text-is("${A.id.slice(0, 8)}")) .bm-arch-open`)
  await page.waitForFunction(() => document.querySelectorAll('#archiveBody .bm-arch-table tbody tr').length === 3, { timeout: 5000 })
  const detailText = await page.textContent('#archiveBody')
  const detailRows = await page.$$('#archiveBody .bm-arch-table tbody tr')
  check('详情颗粒行 3 行', detailRows.length === 3, `实际 ${detailRows.length}`)
  check('详情标题/合计正确', detailText.includes('测试猫') && detailText.includes('360') && detailText.includes('猫王 31204 ×1'))
  check('详情含 element ID', detailText.includes('300121') && detailText.includes('300123'))

  // 4) 返回 → 全选 → 采购清单聚合
  await page.click('#bmArchBack')
  await page.waitForSelector('#bmArchAll', { timeout: 5000 })
  await page.check('#bmArchAll')
  await page.waitForSelector('#bmArchAgg:not([disabled])', { timeout: 5000 })
  await page.click('#bmArchAgg')
  await page.waitForFunction(() => document.querySelectorAll('#archiveBody .bm-arch-table tbody tr').length === 4, { timeout: 5000 })
  const aggRows = await page.$$('#archiveBody .bm-arch-table tbody tr')
  const aggText = await page.textContent('#archiveBody')
  check('聚合 4 种零件', aggRows.length === 4, `实际 ${aggRows.length}`)
  check('聚合合计 440', aggText.includes('440'))
  const firstRow = await aggText
  check('重叠 element 合并且排第一(150)', /300121[\s\S]*?150/.test(firstRow))
  check('有 CSV 下载/复制按钮', !!(await page.$('#bmArchCsv')) && !!(await page.$('#bmArchCopy')))

  // 5) 返回 → 删除测试蝙蝠 → 只剩 1 行，徽标 1
  await page.click('#bmArchBack2')
  await page.waitForSelector('#bmArchAll', { timeout: 5000 })
  await page.click(`#archiveBody tr:has(.bm-arch-id:text-is("${B.id.slice(0, 8)}")) .bm-arch-del`)
  await page.waitForFunction(() => document.querySelectorAll('#archiveBody .bm-arch-table tbody tr').length === 1, { timeout: 5000 })
  check('删除后剩 1 行', (await page.$$('#archiveBody .bm-arch-table tbody tr')).length === 1)
  check('徽标同步为 1', (await page.textContent('#archiveCount')).trim() === '1')

  // 6) 删空 → 空态提示
  await page.click(`#archiveBody tr:has(.bm-arch-id:text-is("${A.id.slice(0, 8)}")) .bm-arch-del`)
  await page.waitForSelector('#archiveBody .bm-arch-empty', { timeout: 5000 })
  const emptyText = await page.textContent('#archiveBody .bm-arch-empty')
  check('空态提示正确', emptyText.includes('还没有作品'))
  check('徽标隐藏', await page.evaluate(() => document.getElementById('archiveCount').hidden === true))

  check('无页面 JS 报错', errors.length === 0, errors.join(' | '))
} finally {
  await browser.close()
  // 清理种子数据（空档案也删掉，避免下次 e2e 受污染）
  await fetch(API + '/project/remove', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: A.id }) }).catch(() => {})
  await fetch(API + '/project/remove', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: B.id }) }).catch(() => {})
}

const pass = checks.every(([, ok]) => ok)
console.log(pass ? 'e2e 通过：作品档案列表/详情/采购清单/删除/空态 全部正常' : 'e2e 失败')
process.exitCode = pass ? 0 : 1
