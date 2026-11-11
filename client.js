// ============================================================================
// 砖拼工坊 · 浏览器半边
//   - 侧栏加「砖拼工坊」入口，主区域是插件页面（/brick-mosaic/，iframe）
//   - 明暗跟随 dsh 主题（theme/change → postMessage → lab/scheme.js）
//   - 面板内自带「📁 作品档案」，不再需要开新对话的桥
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
  // 放在 slot 注册之后执行并整体 try/catch——主题服务是可选依赖，
  // 万一 theme/change API 形态变化，也不能把侧栏入口一起带走。
  const subscribeTheme = () => {
    try {
      ctx.inject(['theme'], (c) => {
        const push = (snap) => { scheme = snap.active.colorScheme; frames.forEach(post) }
        try { push(c.theme.getTheme()) } catch {}
        c.on('theme/change', push)
      })
    } catch (e) {
      console.warn('[brick-mosaic] 主题订阅失败，面板仍可用（固定浅色）', e)
    }
  }

  function StudioPanel() {
    const ref = React.useRef(null)
    React.useEffect(() => {
      const self = ref.current
      if (self) frames.add(self)
      return () => { frames.delete(self) }
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
  subscribeTheme()
}

exports.isPlugin = true
exports.inject = ['slots']
exports.apply = apply
