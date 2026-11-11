// 砖拼工坊 · 作品档案页（面板内模态）
//   列表 / 详情（颗粒清单）/ 跨作品采购清单 / 删除
//   数据来自 lib/api.js：GET /api/projects、GET /api/project?id=、GET /api/parts?ids=、POST /api/project/remove
//   引擎（brickMosaic.js）零耦合——只读窗口里的存档按钮状态。
(() => {
  const API = '/brick-mosaic/api'
  const SET_LABEL = {
    Elvis: '猫王 31204', Batman: '蝙蝠侠 31205', IronMan: '钢铁侠 31199', Sith: '西斯 31200',
    Hogwarts: '霍格沃茨 31201', Mickey: '米老鼠 31202', Portrait: '自定义肖像 41958',
    World: '世界地图 31203', ArtProject: 'Art 项目 21226', Beatles: '披头士 31198', Monroe: '玛丽莲·梦露 31197',
  }

  const state = { view: 'list', projects: [], dataDir: '', selected: new Set(), detail: null, parts: null }
  const $ = (id) => document.getElementById(id)
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const hex = (rgb) => '#' + rgb.map((n) => Number(n || 0).toString(16).padStart(2, '0')).join('')
  const swatch = (rgb) => `<span class="bm-swatch" style="background:${hex(rgb)}"></span>`
  const fmtTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
  const setsText = (sets) => {
    const entries = Object.entries(sets || {}).filter(([, v]) => Number(v) > 0)
    if (!entries.length) return '<span class="text-muted">未指定</span>'
    return entries.map(([k, v]) => esc(SET_LABEL[k] || k) + ' ×' + esc(v)).join('、')
  }

  async function api(path, opts) {
    const res = await fetch(API + path, opts)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    return data
  }

  // ── 数据加载 ────────────────────────────────────────────────────────────
  async function loadProjects() {
    const data = await api('/projects')
    state.projects = data.projects || []
    state.dataDir = data.dataDir || ''
    // 已删除的作品从选中集合里剔除
    const alive = new Set(state.projects.map((p) => p.id))
    for (const id of [...state.selected]) if (!alive.has(id)) state.selected.delete(id)
    return state.projects
  }

  async function refreshCount() {
    try {
      const list = await loadProjects()
      const badge = $('archiveCount')
      if (badge) {
        badge.textContent = String(list.length)
        badge.hidden = list.length === 0
      }
      return list.length
    } catch {
      return 0
    }
  }
  window.bmArchiveRefresh = refreshCount

  // ── 视图：列表 ──────────────────────────────────────────────────────────
  function renderList() {
    state.view = 'list'
    const body = $('archiveBody')
    if (!body) return
    const list = state.projects
    const total = list.reduce((n, p) => n + (p.total_parts || 0), 0)
    const allSel = list.length > 0 && list.every((p) => state.selected.has(p.id))

    if (!list.length) {
      body.innerHTML = `
        <div class="bm-arch-empty">
          <p class="mb-1"><strong>还没有作品</strong></p>
          <p class="mb-0 text-muted">在面板里「生成马赛克」后点「💾 存到作品档案」，作品就会出现在这里。
          档案只存尺寸、套装与颗粒清单，<strong>不存图片</strong>。</p>
        </div>`
      return
    }

    body.innerHTML = `
      <div class="bm-arch-toolbar">
        <div>
          <strong>${list.length}</strong> 个作品 · 合计 <strong>${total}</strong> 颗粒
          ${state.selected.size ? `· 已选 <strong>${state.selected.size}</strong> 个` : ''}
        </div>
        <div class="bm-arch-actions">
          <button type="button" class="btn btn-sm btn-secondary" id="bmArchToggleAll">${allSel ? '取消全选' : '全选'}</button>
          <button type="button" class="btn btn-sm btn-primary" id="bmArchAgg" ${state.selected.size ? '' : 'disabled'}>
            📋 采购清单${state.selected.size && state.selected.size !== list.length ? `（${state.selected.size} 个）` : '（全部）'}
          </button>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table table-sm align-middle bm-arch-table">
          <thead>
            <tr>
              <th style="width:28px"><input type="checkbox" class="form-check-input" id="bmArchAll" ${allSel ? 'checked' : ''}></th>
              <th>作品</th><th style="width:78px">尺寸</th><th style="width:60px">色数</th>
              <th style="width:78px">颗粒</th><th>套装</th><th style="width:120px">存档时间</th><th style="width:110px"></th>
            </tr>
          </thead>
          <tbody>
            ${list.map((p) => `
              <tr>
                <td><input type="checkbox" class="form-check-input bm-arch-pick" data-id="${esc(p.id)}" ${state.selected.has(p.id) ? 'checked' : ''}></td>
                <td><div class="bm-arch-title">${esc(p.title)}</div><div class="bm-arch-id">${esc(p.id.slice(0, 8))}</div></td>
                <td>${p.width}×${p.height}</td>
                <td>${p.colors}</td>
                <td>${p.total_parts}</td>
                <td class="bm-arch-sets">${setsText(p.sets)}</td>
                <td class="bm-arch-time">${fmtTime(p.created_at)}</td>
                <td class="text-end">
                  <button type="button" class="btn btn-sm btn-outline-secondary bm-arch-open" data-id="${esc(p.id)}">查看</button>
                  <button type="button" class="btn btn-sm btn-outline-secondary bm-arch-del" data-id="${esc(p.id)}" title="删除">✕</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${state.dataDir ? `<p class="bm-arch-hint mb-0">档案目录：<code>${esc(state.dataDir)}</code></p>` : ''}
    `
    bindList()
  }

  function bindList() {
    const all = $('bmArchAll')
    if (all) all.onchange = () => {
      if (all.checked) state.projects.forEach((p) => state.selected.add(p.id))
      else state.selected.clear()
      renderList()
    }
    const toggleAll = $('bmArchToggleAll')
    if (toggleAll) toggleAll.onclick = () => {
      if (state.projects.every((p) => state.selected.has(p.id))) state.selected.clear()
      else state.projects.forEach((p) => state.selected.add(p.id))
      renderList()
    }
    document.querySelectorAll('.bm-arch-pick').forEach((cb) => {
      cb.onchange = () => {
        const id = cb.dataset.id
        if (cb.checked) state.selected.add(id)
        else state.selected.delete(id)
        renderList()
      }
    })
    document.querySelectorAll('.bm-arch-open').forEach((b) => {
      b.onclick = () => openDetail(b.dataset.id)
    })
    document.querySelectorAll('.bm-arch-del').forEach((b) => {
      b.onclick = () => removeProject(b.dataset.id)
    })
    const agg = $('bmArchAgg')
    if (agg) agg.onclick = () => openParts([...state.selected])
  }

  // ── 视图：作品详情（颗粒清单）──────────────────────────────────────────
  async function openDetail(id) {
    const body = $('archiveBody')
    body.innerHTML = '<p class="text-muted mb-0">读取中…</p>'
    try {
      const { project } = await api('/project?id=' + encodeURIComponent(id))
      state.detail = project
      state.view = 'detail'
      const parts = [...(project.parts || [])].sort((a, b) => (b[3] || 0) - (a[3] || 0))
      const total = parts.reduce((n, p) => n + (Number(p[3]) || 0), 0)
      body.innerHTML = `
        <div class="bm-arch-toolbar">
          <div>
            <button type="button" class="btn btn-sm btn-secondary" id="bmArchBack">← 返回列表</button>
            <strong class="ms-2">${esc(project.title)}</strong>
            <span class="text-muted">· ${project.width}×${project.height} · ${parts.length} 色 · ${total} 颗粒</span>
          </div>
          <div class="bm-arch-actions">
            <button type="button" class="btn btn-sm btn-primary" id="bmArchThisParts">📋 这个作品的采购清单</button>
          </div>
        </div>
        <p class="bm-arch-meta mb-2">
          套装：${setsText(project.sets)}　·　存档：${fmtTime(project.created_at)}${project.filename ? `　·　源文件：${esc(project.filename)}` : ''}　·　id：<code>${esc(project.id.slice(0, 8))}</code>
        </p>
        <div class="table-responsive">
          <table class="table table-sm align-middle bm-arch-table">
            <thead><tr><th style="width:40px">颜色</th><th style="width:96px">RGB</th><th style="width:96px">类型</th><th>element ID</th><th style="width:90px">数量</th></tr></thead>
            <tbody>
              ${parts.map(([r, g, b, count, type, element]) => `
                <tr>
                  <td>${swatch([r, g, b])}</td>
                  <td><code>${r},${g},${b}</code></td>
                  <td>${esc(type)}</td>
                  <td><code>${esc(element)}</code></td>
                  <td><strong>${count}</strong></td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr><td colspan="4" class="text-end">合计</td><td><strong>${total}</strong></td></tr></tfoot>
          </table>
        </div>`
      $('bmArchBack').onclick = () => renderList()
      $('bmArchThisParts').onclick = () => openParts([project.id])
    } catch (e) {
      body.innerHTML = `<p class="text-danger mb-0">读取失败：${esc(e.message)}</p>`
    }
  }

  // ── 视图：跨作品采购清单 ────────────────────────────────────────────────
  async function openParts(ids) {
    const body = $('archiveBody')
    body.innerHTML = '<p class="text-muted mb-0">聚合颗粒中…</p>'
    try {
      const qs = ids && ids.length ? '?ids=' + encodeURIComponent(ids.join(',')) : ''
      const data = await api('/parts' + qs)
      state.parts = data
      state.view = 'parts'
      const rows = data.parts || []
      body.innerHTML = `
        <div class="bm-arch-toolbar">
          <div>
            <button type="button" class="btn btn-sm btn-secondary" id="bmArchBack2">← 返回列表</button>
            <strong class="ms-2">采购清单</strong>
            <span class="text-muted">· ${(data.projects || []).length} 个作品 · ${rows.length} 种零件 · 合计 ${data.total} 颗粒</span>
          </div>
          <div class="bm-arch-actions">
            <button type="button" class="btn btn-sm btn-secondary" id="bmArchCopy">复制 CSV</button>
            <button type="button" class="btn btn-sm btn-primary" id="bmArchCsv">下载 CSV</button>
          </div>
        </div>
        ${rows.length ? `
        <div class="table-responsive">
          <table class="table table-sm align-middle bm-arch-table">
            <thead><tr><th style="width:40px">颜色</th><th>element ID</th><th style="width:96px">类型</th><th style="width:90px">数量</th><th>涉及作品</th></tr></thead>
            <tbody>
              ${rows.map((p) => `
                <tr>
                  <td>${swatch(p.rgb)}</td>
                  <td><code>${esc(p.element || '—')}</code></td>
                  <td>${esc(p.type)}</td>
                  <td><strong>${p.count}</strong></td>
                  <td class="bm-arch-sets">${(p.projects || []).map(esc).join('、')}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr><td colspan="3" class="text-end">合计</td><td><strong>${data.total}</strong></td><td></td></tr></tfoot>
          </table>
        </div>
        <p class="bm-arch-hint mb-0">element ID 是乐高官方零件号，可直接用于补买；同一 element 在不同作品里出现会合并计数。</p>
        ` : '<div class="bm-arch-empty"><p class="mb-0">没有可聚合的颗粒。</p></div>'}
      `
      const back = $('bmArchBack2')
      if (back) back.onclick = () => renderList()
      const csvBtn = $('bmArchCsv')
      if (csvBtn) csvBtn.onclick = () => downloadCsv(rows, data)
      const copyBtn = $('bmArchCopy')
      if (copyBtn) copyBtn.onclick = async () => {
        try { await navigator.clipboard.writeText(toCsv(rows)); copyBtn.textContent = '已复制'; setTimeout(() => { copyBtn.textContent = '复制 CSV' }, 1500) } catch { copyBtn.textContent = '复制失败' }
      }
    } catch (e) {
      body.innerHTML = `<p class="text-danger mb-0">聚合失败：${esc(e.message)}</p>`
    }
  }

  function toCsv(rows) {
    const head = 'element_id,type,r,g,b,hex,count'
    const lines = rows.map((p) => [p.element || '', p.type, p.rgb[0], p.rgb[1], p.rgb[2], hex(p.rgb), p.count].join(','))
    return [head, ...lines].join('\n') + '\n'
  }

  function downloadCsv(rows, data) {
    const blob = new Blob(['\uFEFF' + toCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `砖拼采购清单-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  // ── 删除 ────────────────────────────────────────────────────────────────
  async function removeProject(id) {
    const p = state.projects.find((x) => x.id === id)
    if (!p) return
    if (!confirm(`删除作品「${p.title}」？\n只删本机档案记录，不影响已下载的说明书。`)) return
    try {
      await api('/project/remove', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }),
      })
      state.selected.delete(id)
      await loadProjects()
      renderList()
      updateBadge()
    } catch (e) {
      alert('删除失败：' + e.message)
    }
  }

  function updateBadge() {
    const badge = $('archiveCount')
    if (!badge) return
    badge.textContent = String(state.projects.length)
    badge.hidden = state.projects.length === 0
  }

  // ── 打开模态框 ──────────────────────────────────────────────────────────
  async function openArchive() {
    const modalEl = $('archiveModal')
    if (!modalEl) return
    let modal = bootstrap.Modal.getInstance(modalEl)
    if (!modal) modal = new bootstrap.Modal(modalEl)
    $('archiveBody').innerHTML = '<p class="text-muted mb-0">读取档案…</p>'
    modal.show()
    try {
      await loadProjects()
      renderList()
      updateBadge()
    } catch (e) {
      $('archiveBody').innerHTML = `<p class="text-danger mb-0">读取失败：${esc(e.message)}</p>`
    }
  }

  const openBtn = $('buttonOpenArchive')
  if (openBtn) openBtn.onclick = openArchive

  // 初次加载就把数量挂到按钮上（面板里有作品时一眼能看到）
  refreshCount()
})()
