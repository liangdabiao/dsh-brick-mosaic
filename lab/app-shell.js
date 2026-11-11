// 砖拼工坊 · 面板外壳：作品存档钩子 + 套装数量输入重算。
// 引擎（brickMosaic.js）零改动——这里只读它的全局变量（fullPartList/finalMosaicIm/画布）与输入框。
(() => {
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

  // ── 作品存档 ───────────────────────────────────────────────────────────
  // 引擎算完马赛克后会解禁 buttonDownloadPDF；此时启用存档按钮。
  const SET_INPUTS = ['inputElvis', 'inputBatman', 'inputIronMan', 'inputSith', 'inputHogwarts', 'inputMickey', 'inputPortrait', 'inputWorld', 'inputArtProject', 'inputBeatles', 'inputMonroe']

  // 马赛克预览图（PNG）：存档时一起存，档案里能回看拼出来的样子。
  // 大尺寸马赛克画布可能是 6000px，等比压到 1600px 以内再编码，避免几百 KB 变几 MB。
  function captureMosaicPng(maxSide = 1600) {
    const src = document.getElementById('previewMosaicCanvas')
    if (!src || !src.width || !src.height) return null
    const scale = Math.min(1, maxSide / Math.max(src.width, src.height))
    let canvas = src
    if (scale < 1) {
      canvas = document.createElement('canvas')
      canvas.width = Math.round(src.width * scale)
      canvas.height = Math.round(src.height * scale)
      canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height)
    }
    try {
      return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
    } catch {
      return null
    }
  }

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
    const project = {
      title: (window.imageFilename || '未命名作品').replace(/\.[^.]+$/, ''),
      width: w,
      height: h,
      sets,
      filename: window.imageFilename || '',
      parts,
      mosaic_colors: parts.length,
    }
    const png = captureMosaicPng()
    if (png) {
      project.image = png.dataUrl
      project.imageWidth = png.width
      project.imageHeight = png.height
    }
    return project
  }

  const saveBtn = document.getElementById('buttonSaveProject')
  if (saveBtn) {
    // 引擎在计算完成后解禁下载按钮——跟着它的状态走（用观察器代替轮询，立刻响应）
    const pdfBtn = document.getElementById('buttonDownloadPDF')
    const sync = () => { saveBtn.disabled = pdfBtn.disabled }
    if (pdfBtn) {
      new MutationObserver(sync).observe(pdfBtn, { attributes: true, attributeFilter: ['disabled'] })
      sync()
    }
    saveBtn.onclick = async () => {
      const project = collectProject()
      if (!project) { toast('还没有可存档的马赛克——先「生成马赛克」', true); return }
      saveBtn.disabled = true
      try {
        const res = await fetch('/brick-mosaic/api/project', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(project),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`)
        const total = (project.parts || []).reduce((n, p) => n + (Number(p[3]) || 0), 0)
        const imgNote = project.image ? '（含预览图）' : ''
        toast(`已存档「${project.title}」${imgNote}（${project.width}×${project.height}，${project.parts.length} 色，颗粒 ${total}）——右上角「📁 作品档案」查看`)
        document.getElementById('buttonOpenArchive')?.classList.add('bm-brand-btn-flash')
        setTimeout(() => document.getElementById('buttonOpenArchive')?.classList.remove('bm-brand-btn-flash'), 1200)
        // 让档案按钮上的数量立刻更新（archive.js 暴露的刷新钩子）
        if (typeof window.bmArchiveRefresh === 'function') window.bmArchiveRefresh()
      } catch (e) {
        toast(`存档失败：${e.message}`, true)
      } finally {
        saveBtn.disabled = false
      }
    }
  }

  // ── 套装数量直接输入时不刷新 ────────────────────────────────────────────
  // 引擎只给套装输入框绑了 click（点 +/- 或点输入框才重算），
  // 所以「手填数字 → 生成马赛克」按钮一直是灰的。这里补 input/change 监听：
  // 借引擎自己的 widthInputValue change 处理链路重算可用颗粒数，不改引擎代码。
  const widthInput = document.getElementById('widthInputValue')
  if (widthInput) {
    for (const id of SET_INPUTS) {
      const input = document.getElementById(id)
      if (!input) continue
      const kick = () => widthInput.dispatchEvent(new Event('change'))
      input.addEventListener('input', kick)
      input.addEventListener('change', kick)
    }
  }
})()
