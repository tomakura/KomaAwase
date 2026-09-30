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
npm test          # テスト（Vitest）
npm run build     # ビルド
npm run preview   # Workers と同じ環境（wrangler dev）で動かす。順番待ちと Cron も動く
npm run gen       # wrangler.jsonc を変えたあと、Worker の型を作り直す
npm run db:generate        # src/lib/server/db/schema.ts を変えたあと、マイグレーションを作る
```

- 開発中はログイン用・在籍確認用のリンクが `npm run dev` のコンソールに出る。本番はシンレンタルサーバーの `relay/send.php` 経由で送る（置き方は [relay/README.md](relay/README.md)）
- 授業の資料はシンの `relay/files.php` に保存する。手元で試すときは [relay/README.md](relay/README.md#手元で試すとき) のとおり PHP を動かし、`.dev.local.vars` を作る
- パスキーは `localhost` で試せる。スマホで試すときは HTTPS が必要
- スクショの読み取りは、手元でも Workers AI（本物）につながる。`npm run dev` では順番待ちを通さずにその場で読む。Cron は `npx wrangler dev --test-scheduled` で開き、`/__scheduled` を呼ぶと動く
- Worker の入口は `worker/entry.js`（SvelteKit の Worker に順番待ちと Cron を足したもの）。アダプターは `svelte-kit.wrangler.jsonc` を読む（[docs/architecture.md](docs/architecture.md#worker-の入口)）
- アイコンを作り直すときは `node scripts/make-icons.mjs static`
- リンクを共有したときの画像（`static/og.png`）を作り直すときは `node scripts/make-og.mjs static/og.png`（Playwright と curl が要る。詳しくはスクリプトの先頭）
- 表示にかかる CPU を測るときは、`npm run build` と `npx wrangler deploy --dry-run --outdir .bench` のあと `node --no-warnings scripts/bench-worker.mjs <セッションのトークン>`（Node.js 22.16 以上）（`FIRST=1` で起動直後の1回目だけ）
- 通知を手元で試すときは、`.dev.local.vars` に `VAPID_PUBLIC_KEY` と `VAPID_PRIVATE_KEY` を書く（作り方は `scripts/make-vapid.mjs` と同じ）

## 本番に出すとき

`main` に push（PR のマージ）すると、Cloudflare の Workers Builds が `npm run build` と `npx wrangler deploy` を実行して本番に出す。手元から出すときも同じ2つ。GitHub Actions は型チェック・テスト・ビルドだけ行う。

マイグレーションは自動では適用されない。テーブルやカラムを変える変更は、マージの前に `npx wrangler d1 migrations apply DB --remote` を流す（その前に Time Travel の bookmark を控える）。

はじめて使うものがあるときの準備：

1. はじめての本番なら、データベースを `npx wrangler d1 create komaawase` で作り、表示された ID を `wrangler.jsonc` の `database_id` に入れる
2. D1 にマイグレーションを当てる：`npx wrangler d1 migrations apply DB --remote`（前に Time Travel の時刻を控えておく）
3. スクショ読み取りの順番待ちを作る：`npx wrangler queues create koma-import`
4. 秘密の値を入れる：`npx wrangler secret put <名前>`
   - `RELAY_SECRET`、`FILES_SECRET`（メール中継と資料）
   - `GROQ_API_KEY`（任意。Groq のダッシュボードの Data Controls でゼロデータ保持を有効にしてから）
   - `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`（任意。Google Cloud の OAuth クライアントで、リダイレクト先を `https://koma.tomakura.com/login/google/callback` にする）
   - `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`（通知。`node scripts/make-vapid.mjs` で作って入れる。作り直すとみんなの通知の登録がやり直しになるので1回だけ）
   - `TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY`（任意。お問い合わせのボット対策。Cloudflare の Turnstile でウィジェットを作って入れる。両方あるときだけ使う）
5. 「開発を応援する」を出すなら、`wrangler.jsonc` の `vars` に `SUPPORT_URL` を足す
6. `relay/send.php` か `relay/files.php` を変えたときは、アプリを公開するのと同じときに、シンの `public_html/koma-relay/send.php` と `public_html/koma-files/files.php` の両方を上書きする（片方だけ古いと、ログインのメールや資料の保存が失敗する。[relay/README.md](relay/README.md)）
7. 運営の画面（`/admin`）を使う人は、D1 で `update users set role = 'admin' where email = '…'`
