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
- **Google**：arctic で PKCE を使う。Google の id で見つからなければ、Google が確認済みのメールアドレスでアカウントを探して結びつける（メールのリンクでも確かめたアドレスなので）。どちらもなければ作る。Google が確認していないアドレスは受け付けない。アドレスで探す・作るのは Gmail と Workspace（`hd` がある）のアカウントだけ。ほかのアドレスで作った Google アカウントは、そのアドレスが今も同じ人のものとは限らないので、メールのリンクでログインしてもらう。`GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` を入れるまではボタンを出さない。リダイレクト先は `https://koma.tomakura.com/login/google/callback`
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

- AI には授業ごとに曜日を答えさせず、表を行ごと・マスごとに書き写させる（`days` と `rows[].cells`）。曜日と時限は見出しからこちらで決め、上下に続く同じ授業は1つにまとめる。授業ごとに曜日を答えさせたら、実際のスクショで列を取り違えた（月曜が木曜になり、授業も抜けた）ため。プロンプトは短いまま保つ（1行足しただけで漢字が化けた）
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
- ログイン・ログアウト・認証・アップロード・資料・`/internal`・運営画面は保存しない。保存したページは、SvelteKit の `x-sveltekit-invalidated` 以外のクエリまで一致するときだけ出す
- 残したページには時間割が入っているので、ログイン画面を開いたとき（ログアウト・退会のあと）に消す。バージョンが変わると古いものも消す

### つながらない・遅いとき

つながらないだけでなく、返事が来ないことが多い（`fetch` が失敗せず止まる）。そこで保存したコピーがあるページは、ネットワークに `SLOW_MS`（4秒）だけ待ち、間に合わなければコピーを出す。ネットワークへの要求はそのまま続け、返ってきたらコピーを置き換える。コピーがなければ待ち続ける。

- **取得時刻**：コピーは `x-koma-saved-at`（保存した時刻）を付けて保存し、出すときも付けたまま返す。ページそのもの（HTML）は自分のヘッダーを読めないので、コピーで開くときは Service Worker が `<html data-cached-at="…">` を足す。画面はこれで「いつの情報か」を知る
- **接続の状態**（`src/lib/connection.svelte.ts`）：`online` / `poor`（返事が遅い・コピーで開いた） / `offline`（つながらない・端末がそう言っている）。`poor` と `offline` の間は `<html data-offline>` を付け、リンクの先読み（`data-sveltekit-preload-data`）を止める。帯は `ConnectionBar.svelte`
- **確かめる**：`/api/ping`（`hooks.server.ts` で D1 もセッションも読む前に 204 を返す）に6秒で返事があるか。ないなら `poor`、要求が出せないなら `offline`。つながったら同期してから、画面を読み込み直す（`invalidateAll`）。失敗が続くほど間を空けて再挑戦する（5秒→30秒）。端末の `online` イベントと、アプリを開き直したときも試す
- **同期**（`src/lib/sync.ts`）：下の4タブのデータを順に取り、進み具合を帯に出す。要求には `x-koma-sync` を付ける。Service Worker はこれを見て、コピーには逃げずネットワークの答えだけを返して保存する（本当にサーバーが答えたか分かるように）。最初に失敗した時点でやめる（悪い回線で続けても無駄なので）。時間割は HTML もいっしょに取る（冷えた状態で開くのは HTML なので）。ログアウトしていれば、データ要求の答えがリダイレクトになるので、それで分かる
- **使えなくするもの**：`poor` と `offline` の間、次を止めて理由を出す（トースト）。
  - フォームの送信：`document` の `submit` を捕まえる段階（`capture`）で止める。約50あるフォームを1つずつ直さなくてよい
  - 変更を伴う `fetch`：`window.fetch` を包んで止める（資料のアップロードなど、フォームでないもの）
  - 遷移：`beforeNavigate` で止める。授業の追加・さがす・スクショ読み込み・友だち／グループの追加（`needsServer`）と、端末に保存していないページ。保存していないページに行くと、SvelteKit はデータが取れず全画面遷移して Service Worker の「つながっていません」ページに出てしまうため、手前で止める
- **帯の高さ**：ページの最小高さ（`--page-h`）から帯の高さ（`--bar-h`）を引き、帯が出ても縦にスクロールしないようにする。上に貼りつくヘッダー（`CourseForm`）は `top: var(--bar-h)`
- 空きコマは `opacity` で薄くしない。`opacity` が 1 未満の要素は重なり順が前に出るので、隣の授業のマスに重なってしまう。枠だけにする（`TimetableGrid.svelte`）

## 戻る操作

ブラウザの戻る（ボタンもスワイプも）では、SvelteKit がそのページのデータ（`__data.json`）をサーバーから取り直し、届くまで画面が変わらない。そこで `window.fetch` を差し替えて（`src/lib/page-data.ts`）、戻るときだけ前に読んだコピーをすぐ返し、そのうしろでサーバーに聞いて、変わっていたら画面を更新する（`invalidateAll`）。

- コピーを使うのは戻る・進む（`beforeNavigate` の `popstate`）で、同じページ・同じ `x-sveltekit-invalidated` のときだけ。リンクで開くときは、いつも通りサーバーに聞く
- GET・HEAD 以外のリクエストが出たら、コピーを全部捨てる。メモリの中だけなので、再読み込みやログアウトでも消える。リダイレクトや失敗の返事は残さない
- 最初に開いたページのデータは HTML の中にあってコピーがないので、タブ（`/`・`/overlay`・`/friends`・`/more`）だけ、開いて2秒後に1回読んでおく
- データに `now`（サーバーの時刻）が入っているページ（時間割・コマを重ねる）は、`now` が毎回変わり、画面が日付や時刻をそこから読む。そのため、コピーを見せるときは `now` を端末の時刻に差し替え、変わったかどうかを比べるときは `now` を除く
- 写真のアイコン（`/icons/<id>?v=…`）は `immutable` なので、戻っても取り直さない。`UserIcon` の `<img>` には `loading="lazy"` と `decoding="async"` を付けない（作り直した画面で、写真だけ遅れて出るのを避ける）

## 通知（Web Push）

- 知らせるのは、友だち申請が届いた・承認された、スクショの読み取りが終わった（読めなかった）、グループに人が参加した、の4つ。「その他」→「通知」で端末ごとに受け取りを始め、種類ごとにオン・オフできる（`users.notify`、ないものはオン）
- 送るのは Worker から直接。ライブラリは使わず WebCrypto で、中身をブラウザ向けに暗号化し（RFC 8291、aes128gcm）、VAPID の鍵で署名する（RFC 8292）。`src/lib/server/push.ts`。通知サービス（Apple・Google・Mozilla・Microsoft）には中身が読めない
- 宛先は `PUSH_SUBSCRIPTIONS`。ブラウザの通知サービス以外のアドレスは受け付けない（Worker にほかへ送らせないため）。404・410 が返った宛先は消す
- 送るのはレスポンスのあと（`waitUntil`）。1回に送るのは40件まで（無料プランの外へのリクエストは50回まで）
- iPhone・iPad はホーム画面に追加したアプリからだけ受け取れるので、通知の画面から追加のしかた（`/install`）へ案内する
- 鍵は secret の `VAPID_PUBLIC_KEY` と `VAPID_PRIVATE_KEY`（`node scripts/make-vapid.mjs` で作って入れる）。ないあいだは通知の画面に「まだ使えません」と出す

## 速さ（Worker の CPU）

無料プランの目安は1回10ms。利用者が少ないうちは多くのリクエストが起きたばかりの isolate に当たるので、起動と最初の1回を軽くしている。

- サーバーでは ICU のデータを読み込むものを作らない。日本語の単語分け（`Intl.Segmenter` の word、8ms以上）は授業名の区切りに要るので、ブラウザで行う（`src/lib/title.ts`）。文字の区切り（grapheme、約9ms）は絵文字などがあるときだけ、日本語の並べ替え（`localeCompare(…, 'ja')`、約7ms）はかなの順に並べる軽い比較（`src/lib/sort.ts`）、日本時間は UTC+9 を足すだけ（`src/lib/time.ts`）
- パスキーのライブラリ（@simplewebauthn/server とその証明書ライブラリ、約600KB）はパスキーの API だけで読み込む。セッションのトークンの base64url は自前（`src/lib/server/base64url.ts`）
- drizzle のインスタンスは D1 のバインディングごとに1つ
- 測り方：`scripts/bench-worker.mjs`（wrangler が作るバンドルを Node で動かし、D1 は node:sqlite で置き換える）。手元の計測では、起きたばかりの isolate の最初の1回は 45〜50ms → 35〜40ms（Node 自体の分を含む）、読み込みは 52ms → 38ms、温まったあとは 1.5〜4ms

## 速さ（D1 を待つ回数）

D1 は APAC のどこかにあり、東京で動く Worker から1回問い合わせると約85ms待つ。ページの待ち時間は、D1 を順番に何回待つかでほぼ決まるので、多くのページで2回（ログインの確認と、ページのデータ）にしている。

- ログインの確認で、今年度の時間割もいっしょに読む（`locals.timetable`、GET のときだけ）。フォームの送信では読まない：アクションが時間割を変えたあと、同じリクエストでページの load が動くことがあるため
- 前の結果の id を使う問い合わせは、id をサブクエリにして同じ batch に入れる（時間割と同期中の共有授業、授業ページと学期・時限、重ねる相手の時間割）
- 在籍確認済みかは EXISTS の列で一覧といっしょに読む（`verifiedColumn`）
- 見てよいかの確認と、相手の id で読むものは並べて読み、確認が通ったときだけ返す
- batch の中では、JOIN で同じ名前の列（`id` など）があると drizzle が値を取り違える。batch に入れる問い合わせは1つの表から読むか、列名が重ならないようにする
- Smart Placement を有効にしている（`wrangler.jsonc` の `placement`）。Cloudflare が速くなると判断すれば Worker を D1 の近くで動かす。アクセスが少ないうちは動かないこともある

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
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | secret | 通知（ないと通知の画面で「まだ使えません」） |
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
