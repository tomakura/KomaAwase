# 技術スタックと仕組み

## 方針

軽くて速いことを優先する。Cloudflare の無料枠の中で動かせる構成にする。

## 技術スタック

| 役割 | 使うもの |
|---|---|
| 画面 | SvelteKit（Svelte 5）＋ `@sveltejs/adapter-cloudflare` |
| 実行環境 | Cloudflare Workers（静的アセット配信付き）。Pages ではなく Workers にする |
| データベース | D1 ＋ Drizzle ORM |
| ファイル | 資料はシンレンタルサーバー（`relay/files.php`）。R2 は無料枠でもカードの登録が要るので使わない |
| 順番待ち | Queues（`koma-import`。無料プランは1日10,000操作、保持は24時間） |
| 定期実行 | Cron Triggers（毎日 03:00 JST。スクショの再挑戦と後片付け） |
| スクショ読み取り | Groq（`qwen/qwen3.8-27b`）、予備に Workers AI（`@cf/meta/llama-4-scout-17b-16e-instruct`） |
| パスキー | SimpleWebAuthn |
| Google ログイン | arctic |
| PWA | SvelteKit の Service Worker（`src/service-worker.ts`）とマニフェスト |
| CSS | 素の CSS ＋ CSS 変数 |
| 授業名の改行 | `Intl.Segmenter`（ブラウザと Workers に最初から入っている） |
| 画像書き出し | ブラウザの Canvas 2D |
| QR コード | uqr（依存なし） |
| テスト | Vitest（計算の部分だけ。`src/lib/*.test.ts`） |

## Worker の入口

`@sveltejs/adapter-cloudflare` は `fetch` だけの Worker を、Wrangler の設定の `main` に書き出す。順番待ち（`queue`）と定期実行（`scheduled`）も受けたいので、次のように分けている。

- アダプターは `svelte-kit.wrangler.jsonc` を読み、`.svelte-kit/cloudflare/_worker.js` に書き出す
- デプロイと `wrangler dev` は `wrangler.jsonc` を読む。`main` は `worker/entry.js` で、SvelteKit の Worker を包んで `queue` と `scheduled` を足す
- `queue` と `scheduled` は、SvelteKit の `/internal/import` と `/internal/daily` を同じ Worker の中で呼ぶ。そのとき `env` に `KOMA_INTERNAL: true` を足して渡す。外からのリクエストの `env` にはこれがないので、`/internal` は外からは 404 になる
- `npm run dev`（Vite）では順番待ちの受け手が動かないので、アップロードした画像はその場で読み取る

## ログイン

- **登録**：Google か、メールアドレス（確認リンクを送る）
- **ログイン**：パスキーが主役。登録が終わったらパスキーを作ってもらう
- **予備**：パスキーを失くしたときのために、メールでのログインを残す
- **Google**：arctic で PKCE を使う。Google の id で見つからなければ、Google が確認済みのメールアドレスでアカウントを探して結びつける（メールのリンクでも確かめたアドレスなので）。どちらもなければ作る。Google が確認していないアドレスは受け付けない。`GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` を入れるまではボタンを出さない。リダイレクト先は `https://koma.tomakura.com/login/google/callback`
- **ボタン**：Google のブランドガイドラインに従い、色つきの G をライトは白、ダークは `#131314` のボタンに置く（モックの単色の G はガイドラインで禁止されている）
- **ログイン後に戻る先**：友だちリンクやグループの招待をログインしていない人が開いたときは、`next` の Cookie に覚えておき、メールのリンク・ニックネーム・パスキー・はじめの設定を終えたあとで開く。同じサイトのパスだけ受け付ける
- **在籍確認**：大学のメールアドレスに確認リンクを送り、届いたらバッジを付ける。ドメインは大学ごとに `UNIVERSITIES.email_domains` に入れる（デジタルハリウッド大学は `dhw.ac.jp`）。判定は、許可したドメインと完全に一致するか、`.` 区切りのサブドメイン（例：`st.dhw.ac.jp`）のときだけ通す。ただの文字列の末尾一致だと `fakedhw.ac.jp` まで通ってしまうので使わない。大学名の表示には [Hipo/university-domains-list](https://github.com/Hipo/university-domains-list) を参考にできるが、古いデータも混じっているので判定には使わない
- メールは、シンレンタルサーバーに置いた中継用の PHP（`relay/send.php`）から送る。Workers からはシンの SMTP に接続できない（国外クラウドからの接続が遮断される）ため、Workers は HTTPS で中継に頼む。リクエストは共有鍵の HMAC で署名し、5分より古いものは断る。中継が送れるのは決まった2つの文面（ログイン用・在籍確認用）だけで、それぞれコマあわせの決まったページへのリンクしか受け付けないので、ほかのメールの送信には使えない

## スクショ読み取り

ほかのアプリの時間割のスクショを、画像を読める AI で JSON に変換する。

### 使う AI

どちらも**無料枠でもデータを学習に使わない**サービス。

| 順番 | サービス | モデル | 無料枠 | 目安 |
|---|---|---|---|---|
| 1 | Groq | `qwen/qwen3.8-27b` | 1日1,000回、1分8,000トークン、1日200,000トークン | 1日50件くらい |
| 2 | Workers AI | `@cf/meta/llama-4-scout-17b-16e-instruct` | 1日10,000 Neurons | 1日60件くらい |

- どちらにも同じ JSON Schema（`src/lib/import.ts` の `IMPORT_SCHEMA`）で返させる。Groq は `strict` で、考える過程は出させない（`reasoning_effort: "none"`）
- Groq の画像は1枚2,048トークン。指示文と出力を足して1回3,000〜4,000トークンくらい。1分の上限にかかる（429 で待ち時間が2分以内）ときは、その時間だけ待って Groq でやり直す。1日の上限なら Workers AI に回す
- Workers AI の Llama 4 Scout は画像と JSON Schema に対応していて、Llama 3.2 Vision のような利用規約の同意のリクエストが要らない。手元で自分の時間割の画像を読ませ、授業名・曜日・時限・教室まで正しく読めた
- Groq はダッシュボードの Data Controls でゼロデータ保持（ZDR）を有効にして使う。本番の前に有効になっていることを確認する。鍵は Worker の secret `GROQ_API_KEY`。ないときは Workers AI だけで読む
- 使わないもの：Mistral の無料枠（評価・試作用で、初期設定だと学習に使われる）、GitHub Models（試作用で本番利用は規約違反）、Gemini と OpenAI の無料枠（学習に使われる）

### 流れ

1. ユーザーが注意書きを確認して、スクショを切り抜いて送る。ブラウザで長い辺1600px の JPEG の data URL にするので、Worker は変換に CPU を使わない
2. `IMPORT_JOBS` に画像ごとジョブを作ってから、Queues にジョブの id だけを積む
3. 受け手は1件ずつ（`max_concurrency: 1`）。ジョブを `processing` にしてから読む（同じメッセージが2回来ても1回だけ読む）
4. Groq で読む。枠切れ・エラー・結果が JSON Schema に合わないときは Workers AI に回す
5. 読めたら結果を保存して画像を消す。両方ダメなら「翌日に再挑戦」にして、「明日もう一度読み取ります」と伝える。3回だめなら「失敗」にして画像を消し、手入力を案内する
6. ユーザーが結果を確認・修正して保存する（授業の登録と同じ確かめ方を通す）

### 翌日に回したジョブ

Queues のメッセージは24時間で消えるので、再挑戦は Queues に頼らない。

- 正本は `IMPORT_JOBS`
- 毎日 03:00 JST の Cron Triggers で、「翌日に再挑戦」のジョブと、1時間以上止まっているジョブを Queues に積み直す
- 3日たっても読めなかったジョブは「失敗」にして画像を消す。30日たったジョブの行も消す
- ついでに期限の過ぎたセッション・ログイン用リンク・パスキーの確認用の値を消す

### 画像を消す範囲

| 場所 | 扱い |
|---|---|
| D1 の `IMPORT_JOBS.image` | 読み取りが終わったらすぐ消す。失敗しても3日で消す。消したあとも D1 の Time Travel（無料プランは7日）には残る |
| Groq | ZDR を有効にして使う（上記） |
| Workers AI | Cloudflare は入力と出力を保存しない |

注意書きでは「学習に使われない」と「保存されない」を分けて書く。

### 限界

AI の読み取りは間違えることがある。画面と規約の両方で、保存前に見直すよう明記する。

## 資料のファイル

授業の資料（PDF・写真・Word・PowerPoint・Excel）は、シンレンタルサーバーに置いた `relay/files.php` に保存する。R2 は無料枠でもカードの登録が要るため、すでに契約しているシンを使う。

- ブラウザは `files.php` に直接アクセスしない。Worker がログインと授業の持ち主を確かめてから、HMAC で署名したリクエストで保存・取り出し・削除を頼む。署名は5分で切れる。鍵はメール中継とは別（`FILES_SECRET`）
- ファイルは `public_html` の外に、Worker が決めたランダムな32文字の名前で置く。元の名前と種類は D1 の `course_files` に持つ
- 写真はブラウザで長い辺2000px の JPEG に縮めてから送る（HEIC も変換する）。送るときは multipart ではなくファイルそのものを本文にして、無料プランの CPU 時間に収める
- 1ファイル 10MB、1人の合計 100MB まで
- 見せるときも Worker を通す。`nosniff` と `Content-Security-Policy: sandbox` を付け、ページのスクリプトを動かせない種類しか受け付けない。PDF だけは sandbox を付けない（ブラウザの PDF ビューアが動かなくなるため。PDF の中のスクリプトはビューアの中でしか動かない）
- 資料や授業を消すときは、先にシンのファイルを消す。消せなかったら授業も消さず、だれにも見えないファイルが残らないようにする
- 無料プランの Worker は、1回のリクエストで外部へのリクエストを50回までしか出せない。退会でファイルを消すときは40件ずつにして、残りがあれば画面がもう一度送る

## オフライン（PWA）

- `static/manifest.webmanifest` とアイコン（`scripts/make-icons.mjs` でロゴから作る）で、ホーム画面に追加できる
- Service Worker は、ビルドしたファイルと `static/` を最初に保存し、ページと `__data.json` はネットワークを先に見て、つながらないときに最後に見たものを出す
- ログイン・ログアウト・認証・アップロード・資料・`/internal` は保存しない
- 残したページには時間割が入っているので、ログイン画面を開いたとき（ログアウト・退会のあと）に消す。バージョンが変わると古いものも消す

## 回数制限

| どこで | 何を | 上限 |
|---|---|---|
| Cloudflare WAF（Rate limiting rules） | `koma.tomakura.com` への `POST /login` と `POST /api/passkey/login/options` | IP ごとに10秒で10回。超えたら10秒ブロック（429） |
| D1 | 同じメールアドレスの未使用ログインリンク | 3つまで |
| D1 | 在籍確認のリンク | 1人3つまで |
| D1 | スクショの読み取り | 1人1日5回、読み取り中は2件まで |
| D1 | 返事を待っている友だち申請 | 1人30件まで |
| D1 | 不具合・要望 | 1人1日10件まで |
| Workers の Rate Limiting バインディング | 上と同じ入口（IP ごと）と在籍確認のメール | 設定はしているが、本番では効いていなかった（同じ IP・拠点から25回送っても全部 success）。WAF のルールで代わりに守っている |

WAF のルールはダッシュボードで設定していて、リポジトリには入っていない。条件式は次のとおり。ルールに止められると Cloudflare の HTML が返るので、メールのフォームはそれを受けて「しばらく待ってから」と出す。

```text
(http.host eq "koma.tomakura.com" and http.request.uri.path in {"/api/passkey/login/options" "/login"} and http.request.method eq "POST")
```

## 設定と秘密の値

| 名前 | 種類 | 中身 |
|---|---|---|
| `RELAY_URL` / `FILES_URL` | vars（`wrangler.jsonc`） | シンの `send.php` と `files.php` |
| `RELAY_SECRET` / `FILES_SECRET` | secret | 中継と資料の HMAC の鍵 |
| `GROQ_API_KEY` | secret | Groq（ないと Workers AI だけで読む） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | secret | Google ログイン（ないとボタンを出さない） |
| `SUPPORT_URL` | vars（任意） | 「開発を応援する」のリンク（ないと出さない） |
| `IMPORT_QUEUE` | Queues | `npx wrangler queues create koma-import` で作っておく |
| `AI` | Workers AI | 手元でも本物につながる（`remote: true`）。少し無料枠を使う |

## プライバシー

- 時間割は初期状態で非公開。承認した友だちと、見せると選んだグループだけに見える
- 時間割は「いつどこにいるか」がわかる情報なので、書き出し画像では教室名を初期状態で隠す
- スクショは読み取り後に削除する（範囲は[画像を消す範囲](#画像を消す範囲)）
- 資料は本人しか見られない。友だちやグループにも見せない。ファイルはシンレンタルサーバー（国内）に置く
- メモ・課題・休講は友だちにも見せない（友だちの時間割の画面や書き出しには入れない）
- 退会時の扱いは [data-model.md](data-model.md#退会したとき)
