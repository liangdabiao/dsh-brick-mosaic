// 砖拼工坊 · Host 半边（brick_mosaic 档案工具 + mosaic-artist 技能提供方 + 硬规则 + 面板路由）。
// 马赛克计算在面板浏览器端（brickMosaic.js，图片不上传）；工具负责作品档案与跨作品采购聚合。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { systemSection } from './systemPrompt.js'
import { registerApi } from '../lib/api.js'
import {
  saveProject, getProject, listProjects, removeProject, aggregateParts, resolveId, DATA_DIR, SET_KEYS,
} from '../lib/store.js'

// parts_list 的 ids 允许 8 位前缀；解析失败的直接忽略
function resolveIds(input) {
  return (input || []).map((x) => resolveId(x)).filter(Boolean)
}

export const name = 'brick-mosaic' // = cordis.patch.yml 的 id

export const inject = ['tools', 'skills', 'systemPrompt', 'webServer', 'connection']

export const Config = Schema.object({
  injectRules: Schema.boolean().default(true).description('注入砖拼工坊工作流到系统提示'),
})

function check(args, spec) {
  const problems = []
  for (const key of spec.required || []) {
    if (args?.[key] === undefined) problems.push(`缺少必填参数 ${key}`)
  }
  for (const [key, rule] of Object.entries(spec.properties || {})) {
    const value = args?.[key]
    if (value === undefined) continue
    if (rule.enum && !rule.enum.includes(value)) problems.push(`${key} 只能是 ${rule.enum.join(' / ')} 之一`)
  }
  for (const key of Object.keys(args || {})) {
    if (!spec.properties || !(key in spec.properties)) problems.push(`未知参数 ${key}`)
  }
  if (problems.length) throw new Error(`参数有误：${problems.join('；')}。`)
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string', description: '给模型看的回执' },
      data: { type: 'string', description: '可选：作品清单/颗粒明细' },
    },
  },
  render: (_args, value) => text(value.data ? `${value.summary}\n\n${value.data}` : value.summary),
}

const result = (ok, summary, data = '') => ({ ok, summary, data })

const MAX_TEXT = 30000

// ---------------------------------------------------------------------------
// 工具：brick_mosaic —— 作品档案 + 跨作品采购聚合
// ---------------------------------------------------------------------------
export const brickMosaicTool = {
  name: 'brick_mosaic',
  description:
    '砖拼工坊档案库：保存/查询乐高马赛克作品（尺寸/套装组合/颗粒清单）与跨作品零件聚合（采购清单）。' +
    '马赛克计算在侧栏「砖拼工坊」面板浏览器端完成（用户点「💾 存到作品档案」入库）；你用本工具查询档案、聚合颗粒采购清单。' +
    '创作指导（选照片/尺寸/套装组合/调色）按 mosaic-artist 技能执行。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('save 存作品；projects 作品清单；project 单作品详情；parts_list 采购聚合；remove 删除', {
        enum: ['save', 'projects', 'project', 'parts_list', 'remove'],
      }),
      title: str('save：作品名（缺省取文件名）'),
      width: str('save：马赛克宽（颗粒数）'),
      height: str('save：马赛克高（颗粒数）'),
      sets: str('save：套装组合 JSON，如 {"Elvis":1,"Batman":1}（key 见 mosaic-artist 技能）'),
      partsJson: str('save：颗粒清单 JSON 数组 [[r,g,b,count,type,element_id],...]（面板存档按钮已入库时无需传）'),
      filename: str('save：可选，源图片文件名'),
      id: str('project/remove：作品 id（projects 里能看到）'),
      ids: str('parts_list：可选，逗号分隔的作品 id；省略=聚合全部作品'),
    },
  },
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)

    if (args.action === 'save') {
      let parts = []
      if (args.partsJson) {
        try { parts = JSON.parse(args.partsJson) } catch { throw new Error('partsJson 不是合法 JSON 数组。') }
        if (!Array.isArray(parts)) throw new Error('partsJson 要是数组 [[r,g,b,count,type,element_id],...]。')
      }
      let sets = {}
      if (args.sets) {
        try { sets = JSON.parse(args.sets) } catch { throw new Error('sets 不是合法 JSON 对象。') }
        const unknown = Object.keys(sets).filter((k) => !SET_KEYS.includes(k))
        if (unknown.length) throw new Error(`套装 key 不合法：${unknown.join(',')}（合法：${SET_KEYS.join(',')}）`)
      }
      const rec = saveProject({
        title: args.title, width: args.width, height: args.height,
        sets, parts, filename: args.filename,
      })
      const total = rec.parts.reduce((n, p) => n + (Number(p[3]) || 0), 0)
      return result(true,
        `作品已存档：「${rec.title}」（${rec.width}×${rec.height}，${rec.parts.length} 色，需颗粒 ${total}）。用户在面板「让 agent 查档案」时可用本工具查到。`)
    }

    if (args.action === 'projects') {
      const all = listProjects()
      if (!all.length) {
        return result(true, '档案库是空的。用户在面板算完马赛克后点「💾 存到作品档案」即可入库。')
      }
      return result(true, `共 ${all.length} 个作品：`,
        all.map((p) => `${p.id.slice(0, 8)} · ${p.title} · ${p.width}×${p.height} · ${p.colors} 色 · 颗粒 ${p.total_parts} · 套装 ${Object.keys(p.sets).join('+') || '无'} · ${String(p.created_at).slice(0, 10)}`).join('\n'))
    }

    if (args.action === 'project') {
      if (!args.id) throw new Error('project 需要 id（projects 里能看到，支持 8 位前缀）。')
      const id = resolveId(args.id)
      if (!id) return result(false, `没有唯一匹配的作品（id=${args.id}）。用 projects 核对前缀。`)
      const r = getProject(id)
      if (!r) return result(false, `没有这个作品（id=${args.id}）。`)
      const total = r.parts.reduce((n, p) => n + (Number(p[3]) || 0), 0)
      const lines = r.parts
        .slice()
        .sort((a, b) => (Number(b[3]) || 0) - (Number(a[3]) || 0))
        .map((p) => `type ${p[4]} · element ${p[5]} · rgb(${p[0]},${p[1]},${p[2]}) × ${p[3]}`)
      return result(true, `「${r.title}」${r.width}×${r.height} · 套装 ${Object.entries(r.sets).map(([k, v]) => `${k}×${v}`).join('+') || '无'} · 共 ${total} 颗粒：`,
        (lines.join('\n')).slice(0, MAX_TEXT))
    }

    if (args.action === 'parts_list') {
      const ids = args.ids ? resolveIds(args.ids.split(/[,，\s]+/).filter(Boolean)) : null
      const agg = aggregateParts(ids)
      if (!agg.projects.length) return result(false, '没有可聚合的作品。先让用户在面板存档。')
      const lines = agg.parts.map((p) => `type ${p.type} · element ${p.element} · rgb(${p.rgb.join(',')}) × ${p.count}`)
      return result(true,
        `采购清单（${agg.projects.map((p) => p.title).join(' + ')}）：${agg.parts.length} 种颗粒 · 共 ${agg.total} 颗粒。element_id 是乐高官方零件编号，可直接用于补买。`,
        lines.join('\n').slice(0, MAX_TEXT))
    }

    // remove
    if (!args.id) throw new Error('remove 需要 id（支持 8 位前缀）。')
    const id = resolveId(args.id)
    const ok = id ? removeProject(id) : false
    return result(ok, ok ? `已删除作品 ${args.id}。` : `没有找到作品 ${args.id}。`)
  },
}

// ---------------------------------------------------------------------------
// 装配
// ---------------------------------------------------------------------------
export function apply(ctx, config) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]

  ctx.effect(() => ctx.tools.register(brickMosaicTool), `${name}: tool mosaic`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)
  if (config.injectRules !== false) {
    ctx.effect(() => ctx.systemPrompt.section(systemSection()), `${name}: workflow`)
  }
  ctx.effect(() => registerApi(ctx), `${name}: routes`)
}
