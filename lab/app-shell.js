// 砖拼工坊 · 面板外壳：作品存档钩子 + agent 协作按钮。
// 引擎（brickMosaic.js）零改动——这里只读它的全局变量（partList/finalMosaicIm）与输入框。
(() => {
  const EMBEDDED = (() => { try { return window.parent !== window } catch { return false } })()

  function toast(msg, isErr) {
    let el = document.getElementById('bm-toast')
    if (!el) {
      el = document.createElement('div')
      el.id = 'bm-toast'
      el.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);background:#0a0a0a;color:#fafaf8;padding:8px 16px;font-size:13px;z-index:9999;opacity:0;transition:opacity .2s;max-width:80vw'
      document.body.appendChild(el)
    }
    el.textContent = msg
    if (isErr) el.style.background = '#C2410C'
    else el.style.background = '#0a0a0a'
    el.style.opacity = '1'
    clearTimeout(el._t)
    el._t = setTimeout(() => { el.style.opacity = '0' }, 2600)
  }

  // ── agent 协作按钮 ─────────────────────────────────────────────────────
  const AGENT_PROMPT = [
    '请用 mosaic-artist 技能指导我制作乐高马赛克像素画：',
    '- 我的素材/想法：（在这里描述，或告诉我图片文件路径）',
    '',
    '请给出：照片选择与裁剪建议、马赛克尺寸（起步 48×48）、Art 套装组合策略、颜色调整思路；',
    '如果图片需要 AI 风格优化（多边形艺术风），用 dreamina-canvas 或 apiz CLI 生成并把文件路径告诉我。',
  ].join('\n')

  function askAgent() {
    if (!EMBEDDED) {
      navigator.clipboard?.writeText(AGENT_PROMPT).then(
        () => toast('创作引导草稿已复制——粘贴到 dsh 对话即可'),
        () => toast('复制失败，请手动复制', true))
      return
    }
    let done = false
    const cleanup = () => { done = true; clearTimeout(timer); removeEventListener('message', onMsg) }
    const onMsg = (e) => {
      if (e.origin !== location.origin) return
      if (e.data?.type === 'brick-mosaic:start-ok') { if (!done) { cleanup(); toast('已在宿主开新对话——把素材想法补进去发送') } }
      else if (e.data?.type === 'brick-mosaic:start-failed') { if (!done) { cleanup(); toast(`没能开新对话：${e.data.message || ''}`, true) } }
    }
    const timer = setTimeout(() => { if (!done) { cleanup(); navigator.clipboard?.writeText(AGENT_PROMPT).then(() => toast('未收到宿主确认，草稿已复制到剪贴板', true)) } }, 1500)
    addEventListener('message', onMsg)
    parent.postMessage({ type: 'brick-mosaic:start', prompt: AGENT_PROMPT }, location.origin)
  }
  const agentBtn = document.getElementById('bmAgentBtn')
  if (agentBtn) agentBtn.onclick = askAgent

  // ── 作品存档 ───────────────────────────────────────────────────────────
  // 引擎算完马赛克后会解禁 buttonDownloadPDF；此时启用存档按钮。
  const SET_INPUTS = ['inputElvis', 'inputBatman', 'inputIronMan', 'inputSith', 'inputHogwarts', 'inputMickey', 'inputPortrait', 'inputWorld', 'inputArtProject', 'inputBeatles', 'inputMonroe']
  const SET_NAMES = { Elvis: '猫王 (31204)', Batman: '蝙蝠侠 (31205)', IronMan: '钢铁侠 (31199)', Sith: '西斯 (31200)', Hogwarts: '霍格沃茨 (31201)', Mickey: '米老鼠 (31202)', Portrait: '自定义肖像 (41958)', World: '世界地图 (31203)', ArtProject: 'Art 项目', Beatles: '披头士 (31198)', Monroe: '玛丽莲·梦露 (31197)' }

  function collectProject() {
    const w = Number(document.getElementById('widthInputValue').value) || 0
    const h = Number(document.getElementById('heightInputValue').value) || 0
    const full = window.fullPartList
    const im = window.finalMosaicIm
    if (!w || !h || !Array.isArray(full) || !full.length || !Array.isArray(im) || !im.length) return null
    // 与原项目说明书生成同款算法：扫 finalMosaicIm 统计每个 colorList 索引的实际用量
    const colorCounts = {}
    for (let x = 0; x < im.length; x++) {
      for (let y = 0; y < im[x].length; y++) {
        const idx = im[x][y][3]
        colorCounts[idx] = (colorCounts[idx] || 0) + 1
      }
    }
    const parts = []
    for (const idxStr of Object.keys(colorCounts)) {
      const idx = Number(idxStr)
      const p = full[idx]
      if (!p) continue
      parts.push([p[0], p[1], p[2], colorCounts[idx], p[4], String(p[5] ?? '')])
    }
    if (!parts.length) return null
    const sets = {}
    for (const id of SET_INPUTS) {
      const el = document.getElementById(id)
      const v = Number(el && el.value)
      if (v > 0) sets[id.replace(/^input/, '')] = v
    }
    return {
      title: (window.imageFilename || '未命名作品').replace(/\.[^.]+$/, ''),
      width: w,
      height: h,
      sets,
      filename: window.imageFilename || '',
      parts,
      mosaic_colors: parts.length,
    }
  }

  const saveBtn = document.getElementById('buttonSaveProject')
  if (saveBtn) {
    // 引擎在计算完成后解禁下载按钮——跟着它的状态走
    setInterval(() => { saveBtn.disabled = document.getElementById('buttonDownloadPDF').disabled }, 800)
    saveBtn.onclick = async () => {
      const project = collectProject()
      if (!project) { toast('还没有可存档的马赛克——先「生成马赛克」', true); return }
      try {
        const res = await fetch('/brick-mosaic/api/project', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(project),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`)
        const total = (project.parts || []).reduce((n, p) => n + (Number(p[3]) || 0), 0)
        toast(`已存档「${project.title}」（${project.width}×${project.height}，${project.parts.length} 色，实际用颗粒 ${total}）——agent 可用 brick_mosaic 查询`)
      } catch (e) {
        toast(`存档失败：${e.message}`, true)
      }
    }
  }
})()
