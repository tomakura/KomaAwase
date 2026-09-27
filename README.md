# KomaAwase
時間割を友達と共有できるアプリ

設計メモは [docs/](docs/README.md) にある。

## 開発

SvelteKit で作り、Cloudflare Workers で動かす。Node.js 22.12 以上が必要。

```sh
npm install
npm run dev       # 開発サーバー
npm run check     # 型チェック
npm run build     # ビルド
npm run preview   # Workers と同じ環境（wrangler dev）で動かす
npm run gen       # wrangler.jsonc を変えたあと、Worker の型を作り直す
```
