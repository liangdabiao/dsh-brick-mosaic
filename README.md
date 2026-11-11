# dsh-brick-mosaic · 砖拼工坊

DeepSeek Harness（dsh）插件：把任意图片转成**乐高 Art 系列马赛克像素画**，生成 PDF/长图拼搭说明书。马赛克计算 100% 在面板浏览器端完成（图片不上传）；会话模型提供**创作指导**与 **AI 风格优化**；`brick_mosaic` 工具管理**作品档案与跨作品采购清单**。

移植自 [custombrickmosaic.github.io](https://custombrickmosaic.github.io/)（Christoph Fritzsch 开源项目）的 **Liangdabiao 深度定制版**（原 100% 客户端 Web 应用 + 微信小程序）。
<img width="2489" height="1389" alt="image" src="https://github.com/user-attachments/assets/d8af4dd2-a74c-479e-badd-5d0d7bf31c88" />


## 核心功能

- 🧱 **马赛克引擎**（面板内，原样保留）：11 个乐高 Art 套装色板（猫王/蝙蝠侠/钢铁侠/西斯/霍格沃茨/米奇/披头士/梦露/自定义肖像/世界地图/Art 项目）、Lab 色差匹配、**颗粒数量约束的艺术效果**（套装数量支持 0.9 小数微调）、HSV/对比度/暗部亮部调整、自定义裁剪（Cropper.js）、忽略黑色区域
- 📄 **拼搭说明书**：16 颗粒分区指引的 PDF（jsPDF）与长图（PNG）下载
- ✦ **AI 风格优化**（面板「🤖 AI 风格优化」按钮）：一键把图片转多边形艺术风格——默认走 **agnes-ai 图生图**（`agnes-image-2.0-flash`，key 内置、体验价 $0，支持 Config 覆盖与代理），返回 data URI 不经 CORS 直接进引擎重算马赛克
- ✦ **agent 创作指导**（mosaic-artist 技能）：照片选择/尺寸规划/套装组合策略/调色思路；AI 风格优化也可由 agent 用 `dreamina-canvas` / `apiz` CLI 完成
- 💾 **作品档案**（右上角「📁 作品档案」）：面板「💾 存到作品档案」把**尺寸/套装组合/颗粒清单 + 一张马赛克 PNG** 入库（PNG 是拼出来的预览图，方便回看；源图不上传也不保存）；档案页可看列表缩略图、展开颗粒清单（色块/RGB/element ID/数量）、下载 PNG、勾选多个作品**聚合采购清单**（CSV 导出）、删除；同一份数据 agent 用 `brick_mosaic` 工具也能查
- 🔒 **隐私**：图片全程本地处理，不上传任何服务器；档案只存参数与颗粒清单，不存图片
- 🎨 **dsh 家族皮肤**：面板换成暖纸底 + 砖橙强调色的统一视觉（`lab/bm-theme.css`），**明暗主题跟随宿主**（`lab/scheme.js` + `theme/change` → postMessage），不再是一块突兀的 Bootstrap 白板

## 使用流程

1. 侧栏「砖拼工坊」→ 面板里上传图片、裁剪调色、选 Art 套装与尺寸 → 「生成马赛克」
2. 需要创作建议（选照片/尺寸/套装/调色/AI 风格优化）直接在对话里问 agent，它会用 `mosaic-artist` 技能 + dreamina/apiz CLI 帮你
3. 算完点「💾 存到作品档案」入库（连同马赛克 PNG）；右上角「📁 作品档案」看缩略图与颗粒清单、勾选多个作品聚合采购清单并导出 CSV；对话里问「我这些作品一共要买多少颗粒」→ agent 跑 `brick_mosaic(action="parts_list")` 给同样的清单

## 安装

```bash
dsh plugin add  https://github.com/liangdabiao/dsh-brick-mosaic 
```

依赖自动安装（仅 `@deepseek-ai/schemastery`）。数据在 `~/.dsh/brick-mosaic/`（`DSH_HOME` 可改）。

## 开发

```bash
npm install
npm test                 # 7 项单测：档案库 + 原项目 11 套装色板完整性校验
npm run build            # client.js → dist/client.js
node scripts/smoke.mjs   # 16 项冒烟：静态页/vendor/API 全链路/工具直调
npm run test:e2e         # 浏览器端到端（save 全链路 / 档案页 / AI+裁剪回归）
DSH_HOME=<临时目录> node scripts/devserver.mjs 5251   # 面板独立预览（e2e 用它，别污染真实档案）
```

## 架构

```text
├── src/host.js          brick_mosaic 工具（save/projects/project/parts_list/remove，id 支持前缀引用）
├── src/systemPrompt.js  工作流硬规则（计算在面板/档案用工具/AI 优化给路径）
├── lib/store.js         作品档案（projects/*.json 原子写 + 同目录 <id>.png 缩略图）+ 跨作品零件聚合
├── lib/api.js           /brick-mosaic 前缀路由（档案 CRUD / 缩略图 / AI 优化 / lab 静态资源）
├── lib/ai.js            agnes-ai 图生图客户端（key 内置可覆盖、JPEG 尺寸探测选档、代理 CONNECT 隧道）
├── lib/skills.js        技能提供方
├── skills/mosaic-artist/ 创作方法论 + AI 风格优化 CLI 对接
├── lab/
│   ├── index.html       原 UI 本地化迁移（品牌条 + 存档按钮 + agent 按钮）
│   ├── brickMosaic.js   原引擎 2138 行（行为不变）
│   ├── app-shell.js     外壳：存档钩子（含马赛克 PNG 缩略图）+ 套装数量输入重算
│   ├── archive.js       作品档案页：列表(缩略图) / 颗粒清单详情(大图+下载PNG) / 跨作品采购清单(CSV) / 删除
│   ├── bm-theme.css     dsh 家族皮肤（明暗双主题 token + Bootstrap 覆盖）
│   ├── scheme.js        明暗跟随：宿主 data-ds-dark-theme / postMessage → html[data-scheme]
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
