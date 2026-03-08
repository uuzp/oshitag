# oshiTag v0.2.9

纯 HTML/CSS/JS 的离线可用(PWA)小工具：管理「组合 → 偶像 → TAG」与「收藏夹」，并一键复制到剪贴板。

[![DEMO](https://img.shields.io/website?url=https%3A%2F%2Fuuzp.github.io%2Foshitag%2F&label=DEMO&up_message=online&down_message=down)](https://uuzp.github.io/oshitag/)
## 使用

- 默认是浏览模式，右上角 `＋` 可切到编辑模式。
- 浏览模式
  - 组合标签：单击切换，双击复制该组合内全部 TAG
  - 偶像名：单击复制该偶像全部 TAG
  - TAG：单击复制该 TAG
  - 收藏夹标签：单击切换，双击复制该收藏夹全部 TAG
  - 收藏夹内容区空白：单击复制该收藏夹全部 TAG
- 编辑模式
  - 组合 / 收藏夹当前标签：单击重命名，双击删除，拖拽排序
  - 偶像名 / TAG：单击重命名，双击删除，拖拽排序
  - 颜色圆点：选择应援色（预设 + HEX 输入）
  - `＋` 或 `+` TAG：新增组合 / 收藏夹 / 偶像 / TAG

## 导入 / 导出

右上角 `⋯` 菜单：
- 导出：`# 组合 / ## 偶像 / ### TAG`，偶像应援色使用 `<!-- cheerColor: #RRGGBB -->`
- 导入：读取上述结构；收藏夹使用 `# [FAVORITES]` 段落
- 导入支持两种模式：覆盖、合并
- 导入前会显示当前数据、导入源、导入后结果的对比摘要，并列出组合 / 偶像 / 收藏夹 / TAG 的新增与移除差异；差异列表支持点击展开剩余项目；导入前会自动在浏览器 `localStorage` 中保存一份导入前备份
- 可在右上角 `⋯` 菜单使用“恢复备份”回退到最近一次导入前状态

## 部署

这是静态站点，直接放到任意静态托管即可（GitHub Pages / Netlify / Vercel 静态等）。
本地预览示例：

```bash
python -m http.server 5173
```

打开 `http://localhost:5173/index.html`。

## 目录结构（发布版）

- `index.html`
- `assets/css/styles.css`
- `assets/js/app.js`
- `assets/js/i18n.js`
- `assets/js/import-utils.js`
- `assets/icons/*`
- `manifest.json`、`service-worker.js`

## 说明

- 数据保存在浏览器 `localStorage`。
- PWA 使用 Service Worker 缓存静态资源；发布新版本时请同步更新 `manifest.json`、`assets/js/app.js` 与 `service-worker.js` 中的版本号。

