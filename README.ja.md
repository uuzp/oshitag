[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

# oshiTag v0.3.0

HTML / CSS / JavaScript だけで作られた、オフライン対応の軽量 PWA です。グループ -> アイドル -> TAG と、お気に入りを管理し、ワンクリックでコピーできます。

[![DEMO](https://img.shields.io/website?url=https%3A%2F%2Foshitag.com&label=DEMO&up_message=online&down_message=down)](https://oshitag.com)

## 使い方

- 初期状態は閲覧モードです。右上の ＋ ボタンで編集モードに切り替えます。
- 閲覧モード
  - グループタブ: クリックで切り替え、ダブルクリックでそのグループ内の TAG をすべてコピー
  - アイドル名: クリックでそのアイドルの TAG をすべてコピー
  - TAG: クリックでその TAG をコピー
  - お気に入りタブ: クリックで切り替え、ダブルクリックでそのお気に入り内の TAG をすべてコピー
  - お気に入り内容エリアの空白: クリックでそのお気に入り内の TAG をすべてコピー
- 編集モード
  - 現在のグループ / お気に入りタブ: クリックで名前変更、ダブルクリックで削除、ドラッグで並び替え
  - アイドル名 / TAG: クリックで名前変更、ダブルクリックで削除、ドラッグで並び替え
  - 色ドット: ペンライトカラーをプリセットまたは HEX 値で選択
  - ＋ または + TAG: グループ / お気に入り / アイドル / TAG を追加

## インポート / エクスポート

右上の ⋯ メニューから利用できます。

- エクスポート形式: `# グループ / ## アイドル / ### TAG`。アイドルの応援色は `<!-- cheerColor: #RRGGBB -->` を使用
- インポートは同じ構造を読み込みます。お気に入りは `# [FAVORITES]` セクションを使用
- インポートモードは上書きとマージの 2 種類
- インポート前に、現在のデータ・インポート元・反映後結果の比較サマリーと、グループ / アイドル / お気に入り / TAG の追加・削除差分を表示します。差分が長い場合は展開できます。インポート前のバックアップはブラウザの `localStorage` に自動保存されます
- 右上の ⋯ メニューにある Restore Backup で、直前のインポート前状態に戻せます

## デプロイ

静的サイトなので、GitHub Pages、Netlify、Vercel Static など任意の静的ホスティングにそのまま配置できます。
ローカル確認例:

```bash
python -m http.server 5173
```

`http://localhost:5173/index.html` を開いてください。

## ディレクトリ構成（リリース版）

- `index.html`
- `assets/css/styles.css`
- `assets/js/app.js`
- `assets/js/dialogs.js`
- `assets/js/data-manager.js`
- `assets/js/import-workflow.js`
- `assets/js/locale-manager.js`
- `assets/js/menu-controller.js`
- `assets/js/render.js`
- `assets/js/sort-utils.js`
- `assets/js/i18n.js`
- `assets/js/import-utils.js`
- `assets/icons/*`
- `manifest.json`、`service-worker.js`

## 補足

- データはブラウザの `localStorage` に保存されます。
- PWA は Service Worker で静的アセットをキャッシュします。正式リリース時は `manifest.json`、`assets/js/app.js`、`service-worker.js` のバージョン番号を揃えて更新してください。