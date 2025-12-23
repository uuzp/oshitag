# oshiTag v0.2.0

纯 HTML/CSS/JS 的离线可用(PWA)小工具：管理「组合 → 偶像 → TAG」与「收藏夹」，并一键复制到剪贴板。

## 使用

- 顶部「组合」标签页
  - 单击：切换当前组合
  - 长按：复制该组合内全部 TAG（空格拼接）
  - 双击：删除组合
  - `＋`：新增组合
- 偶像卡片
  - 单击偶像名：复制该偶像全部 TAG
  - 双击偶像名：删除偶像
  - 点击颜色圆点：选择应援色（预设 + HEX 输入）
  - `+` TAG：新增 TAG（支持空格/逗号/# 分隔批量）
- TAG
  - 单击：复制该 TAG
  - 双击：删除该 TAG
- 收藏夹
  - 两层结构：收藏夹 → TAG
  - 单击收藏夹大区域空白：复制该收藏夹全部 TAG
  - `+`：新增 TAG（弹窗会提供上方已有 TAG 的快速点选）

## 导入 / 导出

右上角 `⋯` 菜单：
- 导出：`# 组合 / ## 偶像 / ### TAG`，偶像应援色使用 `<!-- cheerColor: #RRGGBB -->`
- 导入：读取上述结构；收藏夹使用 `# [FAVORITES]` 段落

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
- `assets/icons/*`
- `manifest.json`、`service-worker.js`

## 说明

- 数据保存在浏览器 `localStorage`。
- PWA 使用 Service Worker 缓存静态资源；发布新版本时请更新 `service-worker.js` 的 `CACHE_NAME`。

