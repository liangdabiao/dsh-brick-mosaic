// 冒烟测试（离线）：面板静态页 + vendor 服务 + API 全链路 + 工具直调（存档/清单/聚合/删除）。
// 运行：node scripts/smoke.mjs
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { Writable } from 'node:stream'

const tmp = mkdtempSync(join(tmpdir(), 'dsh-brick-mosaic-smoke-'))
process.env.DSH_HOME = tmp

let failed = 0
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!cond) failed++
}

// ── 工具直调 ────────────────────────────────────────────────────────────
const { brickMosaicTool } = await import('../src/host.js')
const call = (args) => brickMosaicTool.execute(args)
const PARTS = [[5, 19, 29, 100, 98138, '6284070'], [255, 255, 255, 200, 98138, '6284572'], [201, 26, 9, 50, 6141, '614121']]

{
  let threw = false
  try { await call({ action: 'save', title: 'x', width: 0, height: 48, partsJson: JSON.stringify(PARTS) }) } catch { threw = true }
  check('save 尺寸为 0 抛错', threw)
  const r = await call({ action: 'save', title: '测试猫', width: 48, height: 48, sets: '{"Elvis":1,"Batman":0.5}', partsJson: JSON.stringify(PARTS), filename: 'cat.png' })
  check('save 存档（350 颗粒）', r.ok === true && r.summary.includes('350'), r.summary.slice(0, 60))
  let threw2 = false
  try { await call({ action: 'save', title: 'x', width: 48, height: 48, sets: '{"Lego":1}', partsJson: JSON.stringify(PARTS) }) } catch { threw2 = true }
  check('save 非法套装 key 抛错', threw2)
}
{
  const r = await call({ action: 'projects' })
  const prefix = r.data.match(/([0-9a-f]{8}) · 测试猫/)?.[1]
  check('projects 清单含套装与前缀 id', r.ok === true && Boolean(prefix), `prefix=${prefix}`)
  const d = await call({ action: 'project', id: prefix })
  check('project 详情（前缀解析 + 颗粒降序）', d.ok === true && d.data.indexOf('× 200') < d.data.indexOf('× 100') && d.summary.includes('Elvis×1'))
}
{
  const r = await call({ action: 'parts_list' })
  check('parts_list 采购聚合', r.ok === true && r.summary.includes('350 颗粒') && r.summary.includes('3 种颗粒'), r.summary.slice(0, 60))
}
{
  const r = await call({ action: 'projects' })
  const prefix = r.data.match(/([0-9a-f]{8}) · 测试猫/)?.[1]
  const r2 = await call({ action: 'remove', id: prefix })
  check('remove 删除（前缀解析）', r2.ok === true)
  const after = await call({ action: 'projects' })
  check('删除后清单为空', after.summary.includes('档案库是空的'))
}

// ── 面板 API ────────────────────────────────────────────────────────────
const { registerApi } = await import('../lib/api.js')
const routes = {}
registerApi({ get: () => undefined, webServer: { register: (r) => { routes[r.path] = r.handler } } })
const handler = routes['/brick-mosaic']
function mockRes() {
  const res = new Writable({ write(c, _e, cb) { res.body += c.toString(); cb() } })
  res.body = ''; res.statusCode = 0; res.headers = {}
  res.writeHead = (s, h) => { res.statusCode = s; Object.assign(res.headers, h || {}) }
  return res
}
function mockReq(url, { method = 'GET', body = null } = {}) {
  const req = new EventEmitter()
  req.url = url.startsWith('/brick-mosaic') ? url : '/brick-mosaic' + url
  req.method = method
  req.headers = { host: 'localhost', 'content-type': 'application/json' }
  if (body != null) setImmediate(() => { req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end') })
  return req
}
const callApi = (path, opts) => new Promise((resolve) => {
  const res = mockRes()
  res.on('finish', () => resolve(res))
  handler(mockReq(path, opts), res)
})
{
  const html = await callApi('/')
  check('静态看板页', html.statusCode === 200 && html.body.includes('砖拼工坊') && html.body.includes('brickMosaic.js') && !html.body.includes('cdn.jsdelivr.net'), `${Buffer.byteLength(html.body)}B`)
  const vendor = await callApi('/vendor/jspdf.min.js')
  check('vendor js 可服务', vendor.statusCode === 200 && vendor.body.length > 300000)
  const cropper = await callApi('/cropper.min.js')
  check('cropper 可服务', cropper.statusCode === 200 && cropper.body.length > 40000)
  const proj = JSON.parse((await callApi('/api/project', { method: 'POST', body: { title: 'API作品', width: 32, height: 32, sets: { Batman: 1 }, parts: PARTS } })).body)
  check('API 存档', proj.ok === true, `id=${proj.id?.slice(0, 8)}`)
  const list = JSON.parse((await callApi('/api/projects')).body)
  check('API 清单', list.projects.length === 1)
  const parts = JSON.parse((await callApi('/api/parts')).body)
  check('API 采购聚合', parts.total === 350)
  const rm = JSON.parse((await callApi('/api/project/remove', { method: 'POST', body: { id: proj.id } })).body)
  check('API 删除', rm.ok === true)
  const trav = await callApi(encodeURI('/brick-mosaic/../package.json').replace(/\.\./g, '%2e%2e'))
  check('路径穿越被拒', trav.statusCode === 404)
}

// 补删工具直调遗留的档案（API 存的那份已在上面删除）
const store = await import('../lib/store.js')
for (const p of store.listProjects()) store.removeProject(p.id)

rmSync(tmp, { recursive: true, force: true })
console.log(failed ? `\n${failed} 项失败` : '\n冒烟全部通过')
process.exit(failed ? 1 : 0)
