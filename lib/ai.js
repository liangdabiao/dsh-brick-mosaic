// AI 风格优化：agnes-ai 图生图（agnes-image-2.0-flash，体验价 $0）。
// 面板原客户端契约（brickMosaic.js 零改动）：POST { imageBase64(dataURI), prompt } → { imageUrl }。
// imageUrl 返回 data URI —— 数据内联无 CORS 污染，后续 canvas 截图（PDF 说明书）不受影响。
import http from 'node:http'
import https from 'node:https'

const AGNES_ENDPOINT = 'https://apihub.agnes-ai.com/v1/images/generations'
const AGNES_MODEL = 'agnes-image-2.0-flash'
// 内置默认 key（用户要求写死；Config 的 aiApiKey 可覆盖）
export const DEFAULT_AI_KEY = 'sk-10QeCKHCduYj0XKk4bVRvP4SSwP1g0A2AYZmIGfjx6dFrIXR'

// ── HTTP(S) POST，支持 HTTP 代理 CONNECT 隧道（与 invest-radar fetcher 同款，零依赖）──
function connectTunnel(proxyUrl, targetHost, targetPort, timeout) {
  return new Promise((resolve, reject) => {
    const proxy = new URL(proxyUrl)
    const req = http.request({
      host: proxy.hostname, port: Number(proxy.port) || 80, method: 'CONNECT',
      path: `${targetHost}:${targetPort}`, headers: { host: `${targetHost}:${targetPort}` }, timeout,
    })
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); reject(new Error(`proxy CONNECT ${res.statusCode}`)) }
      else resolve(socket)
    })
    req.on('timeout', () => req.destroy(new Error('proxy connect timeout')))
    req.on('error', reject)
    req.end()
  })
}

function httpPost(url, headers, body, { timeout = 240000, proxyUrl = '' } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const isHttps = u.protocol === 'https:'
    const payload = Buffer.from(body, 'utf8')
    const finish = (res) => {
      const chunks = []
      let size = 0
      res.on('data', (c) => { size += c.length; if (size > 64 * 1024 * 1024) res.destroy(); else chunks.push(c) })
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    }
    const onError = (e) => reject(Object.assign(e, { url }))
    const commonHeaders = { ...headers, 'content-length': payload.length }
    try {
      if (proxyUrl) {
        const port = u.port || (isHttps ? 443 : 80)
        if (isHttps) {
          connectTunnel(proxyUrl, u.hostname, port, Math.min(timeout, 30000)).then((socket) => {
            const req = https.request({ hostname: u.hostname, port, path: u.pathname + u.search, method: 'POST', headers: commonHeaders, socket, agent: false, timeout }, finish)
            req.on('timeout', () => req.destroy(new Error('timeout')))
            req.on('error', onError)
            req.write(payload)
            req.end()
          }, onError)
        } else {
          const proxy = new URL(proxyUrl)
          const req = http.request({ host: proxy.hostname, port: Number(proxy.port) || 80, path: url, method: 'POST', headers: { ...commonHeaders, host: u.host }, timeout }, finish)
          req.on('timeout', () => req.destroy(new Error('timeout')))
          req.on('error', onError)
          req.write(payload)
          req.end()
        }
      } else {
        const lib = isHttps ? https : http
        const req = lib.request({ hostname: u.hostname, port: u.port || (isHttps ? 443 : 80), path: u.pathname + u.search, method: 'POST', headers: commonHeaders, timeout }, finish)
        req.on('timeout', () => req.destroy(new Error('timeout')))
        req.on('error', onError)
        req.write(payload)
        req.end()
      }
    } catch (e) { onError(e) }
  })
}

// ── JPEG 尺寸探测（SOF 标记扫描），用于挑最接近原图比例的输出档位 ────────
export function jpegSize(buf) {
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue }
    const marker = buf[i + 1]
    if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    }
    const len = buf.readUInt16BE(i + 2)
    if (len < 2) return null
    i += 2 + len
  }
  return null
}

// 输出尺寸档位：1024x768（横）/ 1024x1024（方）/ 768x1024（竖）
export function pickSize(buf) {
  const dim = jpegSize(buf)
  if (!dim || !dim.height) return '1024x1024'
  const ratio = dim.width / dim.height
  if (ratio > 1.15) return '1024x768'
  if (ratio < 0.87) return '768x1024'
  return '1024x1024'
}

/**
 * agnes 图生图：返回可直接给 <img> 的 data URI。
 * @param {string} imageBase64 客户端传来的 data URI（thumbnailCanvas 的 JPEG）
 * @param {string} prompt 编辑提示词（面板已内置多边形风格模板）
 * @param {object} opts { apiKey, proxyUrl, timeout }
 */
export async function optimizeImage(imageBase64, prompt, { apiKey = DEFAULT_AI_KEY, proxyUrl = '', timeout = 240000 } = {}) {
  if (!imageBase64 || !/^data:image\//.test(String(imageBase64))) {
    throw Object.assign(new Error('imageBase64 必须是 data:image/… 格式'), { status: 400 })
  }
  let buf
  try {
    buf = Buffer.from(String(imageBase64).split(',')[1] || '', 'base64')
  } catch {
    throw Object.assign(new Error('imageBase64 base64 解码失败'), { status: 400 })
  }
  const payload = JSON.stringify({
    model: AGNES_MODEL,
    prompt: String(prompt || '将这张图片转换为多边形艺术风格').slice(0, 4000),
    size: pickSize(buf),
    extra_body: {
      image: [String(imageBase64)],
      response_format: 'b64_json', // 注意：必须在 extra_body 内部（顶层会报错）
    },
  })
  const { status, body } = await httpPost(AGNES_ENDPOINT, {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
  }, payload, { timeout, proxyUrl })

  let data
  try {
    data = JSON.parse(body)
  } catch {
    throw Object.assign(new Error(`agnes 返回非 JSON（HTTP ${status}）：${body.slice(0, 120)}`), { status: 502 })
  }
  if (status !== 200) {
    const msg = data?.error?.message || data?.message || body.slice(0, 160)
    throw Object.assign(new Error(`agnes HTTP ${status}: ${msg}`), { status: 502 })
  }
  const item = data?.data?.[0]
  const b64 = item?.b64_json
  const url = item?.url
  if (b64) return { imageUrl: `data:image/png;base64,${b64}` }
  if (url) return { imageUrl: url } // 兜底：URL 也能用（GCS 公网可读）
  throw Object.assign(new Error('agnes 未返回图片数据'), { status: 502 })
}
