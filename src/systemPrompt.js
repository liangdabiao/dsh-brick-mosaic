// 系统提示注入：砖拼工坊工作流硬规则（创作方法论细节在 mosaic-artist 技能里）。
export const SYSTEM_RULES = `## 砖拼工坊（brick-mosaic）

用户做乐高马赛克像素画相关的事（选照片/选套装/调色/颗粒清单/采购）时：

**分工**：马赛克计算在侧栏「砖拼工坊」面板浏览器端完成（图片不上传）；你负责创作指导（mosaic-artist 技能）、AI 风格优化（dreamina-canvas / apiz CLI）与档案查询（brick_mosaic 工具）。

**硬规则**：算完的作品提醒用户点「💾 存到作品档案」（面板「📁 作品档案」里可看列表/颗粒清单/全选聚合采购清单/删除）；查颗粒/采购清单用 brick_mosaic，不心算；AI 风格优化生成后给用户文件路径，让用户回面板上传；输出附「仅供参考，拼搭结果以面板说明书为准」。`

export function systemSection() {
  return {
    name: 'brick-mosaic:workflow',
    order: 110,
    text: SYSTEM_RULES,
  }
}
