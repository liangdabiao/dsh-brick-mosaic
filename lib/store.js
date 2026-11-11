// 砖拼工坊 · 作品档案库。图片不存（隐私+体积），只存参数与颗粒清单。
//   $DSH_HOME/brick-mosaic/projects/<id>.json
//     { id, title, width, height, sets, filename, parts:[[r,g,b,count,type,element]], created_at }
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'brick-mosaic')
const PROJECTS_DIR = join(DATA_DIR, 'projects')

const nowIso = () => new Date().toISOString()

function readJson(file, fallback = null) {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  renameSync(tmp, file)
}

export const SET_KEYS = ['Elvis', 'Batman', 'IronMan', 'Sith', 'Hogwarts', 'Mickey', 'Portrait', 'World', 'ArtProject', 'Beatles', 'Monroe']

export function saveProject(input = {}) {
  const width = Number(input.width) || 0
  const height = Number(input.height) || 0
  const parts = Array.isArray(input.parts) ? input.parts : []
  if (!width || !height) throw new Error('width/height 不能为 0')
  if (!parts.length) throw new Error('parts（颗粒清单）为空——先在面板「生成马赛克」')
  const id = randomUUID()
  const sets = {}
  for (const [k, v] of Object.entries(input.sets || {})) {
    if (SET_KEYS.includes(k) && Number(v) > 0) sets[k] = Number(v)
  }
  const rec = {
    id,
    title: String(input.title || '未命名作品').slice(0, 80),
    width,
    height,
    sets,
    filename: String(input.filename || ''),
    parts: parts.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0, Number(p[3]) || 0, Number(p[4]) || 0, String(p[5] ?? '')]),
    created_at: nowIso(),
  }
  writeJson(join(PROJECTS_DIR, `${id}.json`), rec)
  return rec
}

export const getProject = (id) => readJson(join(PROJECTS_DIR, `${id}.json`))

// id 前缀解析：projects 清单只展示 8 位前缀，agent 用前缀引用即可（唯一匹配才通过）
export function resolveId(prefix) {
  const key = String(prefix || '').trim()
  if (!key) return null
  if (existsSync(join(PROJECTS_DIR, `${key}.json`))) return key
  ensure()
  const hits = readdirSafe(PROJECTS_DIR).filter((n) => n.startsWith(key) && n.endsWith('.json') && !n.includes('.tmp'))
  return hits.length === 1 ? hits[0].replace('.json', '') : null
}

export function listProjects() {
  ensure()
  const out = []
  for (const name of readdirSafe(PROJECTS_DIR)) {
    if (!name.endsWith('.json') || name.includes('.tmp')) continue
    const rec = readJson(join(PROJECTS_DIR, name))
    if (!rec) continue
    out.push({
      id: rec.id,
      title: rec.title,
      width: rec.width,
      height: rec.height,
      sets: rec.sets,
      colors: rec.parts?.length || 0,
      total_parts: (rec.parts || []).reduce((n, p) => n + (Number(p[3]) || 0), 0),
      created_at: rec.created_at,
    })
  }
  return out.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
}

export function removeProject(id) {
  const file = join(PROJECTS_DIR, `${id}.json`)
  if (!existsSync(file)) return false
  unlinkSync(file)
  return true
}

// 跨作品零件聚合：按 type+element_id+颜色 累计 count → 采购清单
export function aggregateParts(ids = null) {
  const projects = listProjects().filter((p) => !ids || ids.includes(p.id))
  const agg = new Map()
  for (const p of projects) {
    const rec = getProject(p.id)
    for (const [r, g, b, count, type, element] of rec.parts || []) {
      const key = `${type}|${element}|${r},${g},${b}`
      const cur = agg.get(key) || { type, element, rgb: [r, g, b], count: 0, projects: [] }
      cur.count += Number(count) || 0
      if (!cur.projects.includes(p.title)) cur.projects.push(p.title)
      agg.set(key, cur)
    }
  }
  return {
    projects: projects.map((p) => ({ id: p.id, title: p.title })),
    total: [...agg.values()].reduce((n, x) => n + x.count, 0),
    parts: [...agg.values()].sort((a, b) => b.count - a.count),
  }
}

function ensure() {
  mkdirSync(PROJECTS_DIR, { recursive: true })
}
function readdirSafe(dir) {
  try { return readdirSync(dir) } catch { return [] }
}
