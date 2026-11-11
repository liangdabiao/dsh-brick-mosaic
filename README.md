# dsh-brick-mosaic · 砖拼工坊

DeepSeek Harness（dsh）插件：把任意图片转成**乐高 Art 系列马赛克像素画**，生成 PDF/长图拼搭说明书。马赛克计算 100% 在面板浏览器端完成（图片不上传）；会话模型提供**创作指导**与 **AI 风格优化**；`brick_mosaic` 工具管理**作品档案与跨作品采购清单**。

移植自 [custombrickmosaic.github.io](https://github.com/)（Christoph Fritzsch 开源项目）的 **Liangdabiao 深度定制版**（原 100% 客户端 Web 应用 + 微信小程序）。

## 核心功能

- 🧱 **马赛克引擎**（面板内，原样保留）：11 个乐高 Art 套装色板（猫王/蝙蝠侠/钢铁侠/西斯/霍格沃茨/米奇/披头士/梦露/自定义肖像/世界地图/Art 项目）、Lab 色差匹配、**颗粒数量约束的艺术效果**（套装数量支持 0.9 小数微调）、HSV/对比度/暗部亮部调整、自定义裁剪（Cropper.js）、忽略黑色区域
- 📄 **拼搭说明书**：16 颗粒分区指引的 PDF（jsPDF）与长图（PNG）下载
- ✦ **AI 风格优化**（面板「🤖 AI 风格优化」按钮）：一键把图片转多边形艺术风格——默认走 **agnes-ai 图生图**（`agnes-image-2.0-flash`，key 内置、体验价 $0，支持 Config 覆盖与代理），返回 data URI 不经 CORS 直接进引擎重算马赛克
- ✦ **agent 创作指导**（mosaic-artist 技能）：照片选择/尺寸规划/套装组合策略/调色思路；AI 风格优化也可由 agent 用 `dreamina-canvas` / `apiz` CLI 完成
- 💾 **作品档案**（brick_mosaic 工具）：作品（尺寸/套装组合/颗粒清单）入库；**跨作品零件聚合**——「我这些作品一共需要多少 element XXXX 颗粒」→ 按乐高官方零件号的采购清单
- 🔒 **隐私**：图片全程本地处理，不上传任何服务器；档案只存参数与颗粒清单，不存图片

## 使用流程

1. 侧栏「砖拼工坊」→ 面板里上传图片、裁剪调色、选 Art 套装与尺寸 → 「生成马赛克」
2. 拿不准就点顶部「✦ 让 agent 帮我创作」——开新对话获得照片/尺寸/套装/调色建议；需要风格化时 agent 会用 CLI 生成多边形风格图给你
3. 算完点「💾 存到作品档案」入库；对话里问「我这些作品一共要买多少颗粒」→ agent 跑 `brick_mosaic(action="parts_list")` 给采购清单

## 安装

```bash
dsh plugin add <本仓库本地路径>
```

依赖自动安装（仅 `@deepseek-ai/schemastery`）。数据在 `~/.dsh/brick-mosaic/`（`DSH_HOME` 可改）。

## 开发

```bash
npm install
npm test                 # 3 项单测：档案库 + 原项目 11 套装色板完整性校验
npm run build            # client.js → dist/client.js
node scripts/smoke.mjs   # 16 项冒烟：静态页/vendor/API 全链路/工具直调
DSH_HOME=<目录> node scripts/devserver.mjs 5175   # 面板独立预览
```

## 架构

```text
├── src/host.js          brick_mosaic 工具（save/projects/project/parts_list/remove，id 支持前缀引用）
├── src/systemPrompt.js  工作流硬规则（计算在面板/档案用工具/AI 优化给路径）
├── lib/store.js         作品档案（projects/*.json 原子写）+ 跨作品零件聚合
├── lib/api.js           /brick-mosaic 前缀路由（档案 CRUD + lab 静态资源）
├── lib/ai.js            agnes-ai 图生图客户端（key 内置可覆盖、JPEG 尺寸探测选档、代理 CONNECT 隧道）
├── lib/skills.js        技能提供方
├── skills/mosaic-artist/ 创作方法论 + AI 风格优化 CLI 对接
├── lab/
│   ├── index.html       原 UI 本地化迁移（品牌条 + 存档按钮 + agent 按钮）
│   ├── brickMosaic.js   原引擎 2138 行（行为不变）
│   ├── app-shell.js     外壳：存档钩子 + agent 协作（postMessage 桥）
│   ├── vendor/          jspdf 1.5.3 + bootstrap 5.0.0-beta2（本地化）
│   └── cropper.min.js/css
└── client.js → dist/    侧栏入口 + iframe 桥
```

## 边界与说明

- 只支持浏览器可解码的图片格式（jpg/png/webp/gif）；扫描件质量的低对比照片效果差，先让 agent 指导调色或风格化
- 内置 agnes-ai key 为免费体验档（$0），高并发时段可能返回「队列已满」——重试即可，或在 Config 换自己的 key；也可走 agent 的 dreamina/apiz CLI 路径
- 大图（4000px+）计算耗时随尺寸增长，面板有进度条

## 致谢

- [Christoph Fritzsch / custombrickmosaic.github.io](https://github.com/cfritzsch/custombrickmosaic.github.io)：原始马赛克算法与 Art 套装色板
- **Liangdabiao 定制版**（本项目移植的直接来源）：中文 UI、HSV 调整、自定义裁剪、长图说明书、AI 风格优化
- [dsh-guizang-design](https://github.com/op7418/dsh-guizang-design)：插件形态参考

## License

MIT。LEGO® 是乐高集团商标，本项目与其无隶属关系。
