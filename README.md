# KomaAwase
時間割を友達と共有できるアプリ

公開先：https://koma.tomakura.com

設計メモは [docs/](docs/README.md) にある。

## 開発

SvelteKit で作り、Cloudflare Workers で動かす。Node.js 22.12 以上が必要。

```sh
npm install
npm run db:migrate:local   # ローカルの D1 にテーブルを作る（初回とスキーマ変更後）
npm run dev       # 開発サーバー
npm run check     # 型チェック
npm run build     # ビルド
npm run preview   # Workers と同じ環境（wrangler dev）で動かす
npm run gen       # wrangler.jsonc を変えたあと、Worker の型を作り直す
npm run db:generate        # src/lib/server/db/schema.ts を変えたあと、マイグレーションを作る
```

- 開発中はログイン用のリンクが `npm run dev` のコンソールに出る。本番はシンレンタルサーバーの `relay/send.php` 経由で送る（置き方は [relay/README.md](relay/README.md)）
- パスキーは `localhost` で試せる。スマホで試すときは HTTPS が必要
- 本番に出す前に `wrangler d1 create komaawase` でデータベースを作り、表示された ID を `wrangler.jsonc` の `database_id` に入れる
