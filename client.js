// ============================================================================
// 砖拼工坊 · 浏览器半边
//   - 侧栏加「砖拼工坊」入口，主区域是插件页面（/brick-mosaic/，iframe）
//   - 页面点「让 agent 帮我创作」：postMessage 草稿，这里开新对话并填进输入框
//   - 明暗跟随 dsh 主题（theme/change → postMessage → lab/scheme.js）
//
// 注意：这里**不要**自己写 window.__ModuleLoader__.load(...)——scripts/build.mjs 的
// banner 已包了一层注册，再包一次会 duplicate factory registration 让 web boot 失败。
// ============================================================================
const React = require('react')
const h = React.createElement

const PANEL = 'brick-mosaic'
const SRC = '/brick-mosaic/'

// 侧栏图标：乐高积木颗粒（2×2 圆点板）
function PanelIcon(props) {
  const s = (props && props.size) || 18
  return h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round' },
    h('path', { d: 'M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z' }),
    h('path', { d: 'M6 10V7h4v3M14 10V7h4v3' }),
    h('circle', { cx: 9, cy: 14.5, r: 0.8 }),
    h('circle', { cx: 15, cy: 14.5, r: 0.8 }))
}

function apply(ctx) {
  // 明暗跟随：宿主主题变化推给面板 iframe（scheme.js 接收）
  let scheme = null
  const frames = new Set()
  const post = (frame) => { try { if (scheme && frame.contentWindow) frame.contentWindow.postMessage({ type: 'brick-mosaic:scheme', scheme }, location.origin) } catch {} }
  ctx.inject(['theme'], (c) => {
    const push = (snap) => { scheme = snap.active.colorScheme; frames.forEach(post) }
    try { push(c.theme.getTheme()) } catch {}
    c.on('theme/change', push)
  })
  function StudioPanel() {
    const ref = React.useRef(null)
    React.useEffect(() => {
      const self = ref.current
      if (self) frames.add(self)
      function onMessage(e) {
        const frame = ref.current
        if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return
        const m = e.data
        if (!m || m.type !== 'brick-mosaic:start' || typeof m.prompt !== 'string') return
        try {
          ctx.uiWorkspace.startSession(undefined, { prompt: m.prompt, whenDraftExists: 'replace' })
          try { frame.contentWindow.postMessage({ type: 'brick-mosaic:start-ok' }, location.origin) } catch {}
        } catch (err) {
          console.error('[brick-mosaic] 开新对话失败', err)
          try { frame.contentWindow.postMessage({ type: 'brick-mosaic:start-failed', message: String((err && err.message) || err) }, location.origin) } catch {}
        }
      }
      addEventListener('message', onMessage)
      return () => { removeEventListener('message', onMessage); frames.delete(self) }
    }, [])
    return h('iframe', {
      ref,
      src: SRC,
      title: '砖拼工坊',
      allow: 'fullscreen',
      style: { width: '100%', height: '100%', border: 0, display: 'block' },
      onLoad: (e) => post(e.currentTarget),
    })
  }

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 15, label: () => '砖拼工坊' }, PanelIcon))
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, StudioPanel))
}

exports.isPlugin = true
exports.inject = ['slots', 'uiWorkspace']
exports.apply = apply

