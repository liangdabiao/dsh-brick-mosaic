// 面板数据面：/brick-mosaic 前缀路由（作品档案读写 + lab 静态资源）。
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { saveProject, getProject, listProjects, removeProject, aggregateParts, resolveId, readImage, DATA_DIR } from './store.js'
import { optimizeImage, DEFAULT_AI_KEY } from './ai.js'

const BASE = '/brick-mosaic'
const LAB = fileURLToPath(new URL('../lab/', import.meta.url))

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}

function json(res, statusCode, value) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return false // dsh 0.2.x 宿主已 token 鉴权
  return connection.requestRejection({ headers: req.headers })
}

function safeFile(dir, rel) {
  if (!dir || String(rel).split('/').some((p) => p.startsWith('.'))) return null
  let base
  try { base = realpathSync(dir) } catch { return null }
  const file = normalize(join(base, rel))
  if (!file.startsWith(base + sep) || !existsSync(file)) return null
  const real = realpathSync(file)
  return real.startsWith(base + sep) && statSync(real).isFile() ? real : null
}

function serveFile(req, res, file) {
  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': statSync(file).size,
    'cache-control': 'no-cache',
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

function readJson(req, max = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const origin = req.headers.origin
    if (req.method !== 'POST') return reject(Object.assign(new Error('method'), { status: 405 }))
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('type'), { status: 415 }))
    if (origin && origin.replace(/^https?:\/\//, '') !== req.headers.host) return reject(Object.assign(new Error('origin'), { status: 403 }))
    let size = 0
    const chunks = []
    req.on('data', (c) => { size += c.length; if (size > max) req.destroy(); else chunks.push(c) })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch (e) { reject(Object.assign(e, { status: 400 })) } })
    req.on('error', reject)
  })
}

function readVersion() {
  try { return JSON.parse(readFileSync(join(LAB, '..', 'package.json'), 'utf8')).version } catch { return '' }
}

export function registerApi(ctx, { aiConfig = {} } = {}) {
  return ctx.webServer.register({
    kind: 'prefix',
    path: BASE,
    async handler(req, res) {
      try {
        const rejection = requestRejection(ctx, req)
        if (typeof rejection === 'number') return json(res, rejection, { error: '未授权' })

        const url = new URL(req.url, 'http://x')
        if (!url.pathname.startsWith(BASE + '/') && url.pathname !== BASE) return json(res, 404, { error: 'not found' })
        const path = decodeURIComponent(url.pathname.slice(BASE.length)) || '/'

        // ---- API ----
        if (path === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true })
        if (path === '/api/project' && req.method === 'POST') {
          try {
            const body = await readJson(req, 16 * 1024 * 1024)
            const rec = saveProject(body)
            return json(res, 200, { ok: true, id: rec.id, title: rec.title, colors: rec.parts.length, has_image: !!rec.image })
          } catch (e) { return json(res, e.status || 400, { ok: false, error: e.message }) }
        }
        if (path === '/api/projects' && req.method === 'GET') return json(res, 200, { projects: listProjects(), dataDir: DATA_DIR })
        if (path === '/api/project' && req.method === 'GET') {
          const r = getProject(url.searchParams.get('id') || '')
          if (!r) return json(res, 404, { error: '没有这个作品' })
          return json(res, 200, { project: { ...r, has_image: !!r.image } })
        }
        // 作品缩略图（存档时随颗粒清单一起存下的马赛克 PNG）
        if (path === '/api/project/image' && (req.method === 'GET' || req.method === 'HEAD')) {
          const id = resolveId(url.searchParams.get('id') || '')
          const img = id ? readImage(id) : null
          if (!img) return json(res, 404, { error: '这个作品没有存图' })
          res.writeHead(200, { 'content-type': img.mime, 'content-length': statSync(img.file).size, 'cache-control': 'no-cache' })
          if (req.method === 'HEAD') return res.end()
          return createReadStream(img.file).pipe(res)
        }
        if (path === '/api/project/remove' && req.method === 'POST') {
          try {
            const body = await readJson(req)
            const id = resolveId(String(body.id || ''))
            const ok = id ? removeProject(id) : false
            return json(res, 200, { ok })
          } catch (e) { return json(res, e.status || 400, { ok: false, error: e.message }) }
        }
        if (path === '/api/parts' && req.method === 'GET') {
          const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean)
          return json(res, 200, aggregateParts(ids.length ? ids : null))
        }
        // AI 风格优化（agnes 图生图）：面板原客户端契约 {imageBase64, prompt} → {imageUrl}
        if (path === '/api/ai-optimize' && req.method === 'POST') {
          try {
            const body = await readJson(req, 8 * 1024 * 1024)
            const { imageUrl } = await optimizeImage(body.imageBase64, body.prompt, {
              apiKey: aiConfig.aiApiKey || DEFAULT_AI_KEY,
              proxyUrl: aiConfig.aiProxyUrl || process.env.HTTPS_PROXY || '',
              timeout: aiConfig.aiTimeout || 240000,
            })
            return json(res, 200, { imageUrl })
          } catch (e) {
            return json(res, e.status || 500, { error: e.message })
          }
        }
        if (path.startsWith('/api/')) return json(res, 404, { error: 'not found' })

        // ---- 静态页面 ----
        if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' })
        const file = safeFile(LAB, path === '/' ? 'index.html' : path.replace(/^\/+/, ''))
        return file ? serveFile(req, res, file) : json(res, 404, { error: 'not found' })
      } catch (err) {
        json(res, 500, { error: err?.message || '内部错误' })
      }
    },
  })
}
