# シンレンタルサーバーに置くもの（relay）

Cloudflare Workers だけではできないことを、シンレンタルサーバーに置いた PHP にまかせている。どちらも Worker からの署名つきリクエストしか受け付けない。

| ファイル | 役目 |
|---|---|
| `send.php` | ログイン用と在籍確認用のメールを送る。Workers からはシンの SMTP に接続できないため |
| `files.php` | 授業の資料（PDF・写真など）のファイルを保存する。R2 は無料枠でもカードの登録が要るため、シンに置く |

## 置き方

| ファイル | 置き場所（シン） |
|---|---|
| `send.php` | `tomakura.com/public_html/koma-relay/send.php` |
| `koma-relay-secret.php` | `tomakura.com/koma-relay-secret.php`（`public_html` の外。Web からは見えない） |
| `files.php` | `tomakura.com/public_html/koma-files/files.php` |
| `koma-files-secret.php` | `tomakura.com/koma-files-secret.php`（`public_html` の外） |
| 資料のファイル | `tomakura.com/koma-files/`（`files.php` が作る。`public_html` の外） |
| 使った署名の記録 | `tomakura.com/koma-nonces/`（`send.php` と `files.php` が作る。`public_html` の外。手で消してよい） |

- `koma-relay-secret.php` と `koma-files-secret.php` は Git に入れない。`*.example.php` を元に作る。2つには別々の値を使い、それぞれ Worker の `RELAY_SECRET`・`FILES_SECRET` と同じ値にする
- PHP 8 以上と mbstring が必要（シンは標準で入っている）
- 中継が送るのは `send.php` の `MESSAGES` にある決まった文面だけ（`signin`：ログイン用、`verify`：在籍確認用）。それぞれ本番の URL の決まったページへのリンクしか受け付けない。Cloudflare のプレビュー URL は本番の D1 と鍵を共有してしまうので、`wrangler.jsonc` で無効にしている
- アプリの URL を増やしたり変えたりしたときは、`MESSAGES` の `prefix` も直してアップロードし直す
- `send.php` を新しくしたら、シンの同じ場所に上書きする。古い `send.php` のままだと在籍確認のメールは `bad kind` で断られる（ログインのメールは送れる）

## 署名は1回しか使えない

- Worker は、リクエストごとに新しいランダムな値（`X-Koma-Nonce`）を作り、署名に入れる。`send.php` と `files.php` は、署名を確かめたあとにその値を `koma-nonces/` に記録し、もう一度同じ値が来たら断る（`used`）。盗み見た通信をそのまま送り直しても通らない
- 記録は、署名の時刻が5分の許容の外に出たあとで消える（ときどき掃除する）
- `files.php` の保存（put）の署名には、ファイルの SHA-256 も入っている。別の中身をつけ替えても通らない（`hash mismatch`）
- Worker と PHP は、同じ版どうしでないと通らない。**アプリを公開するのと同じときに、`send.php` と `files.php` の両方を上書きする**。片方だけ古いあいだは、ログイン用のメールや資料の保存が失敗する

## 資料のファイル（files.php）

- ブラウザは `files.php` に直接アクセスしない。Worker がログインと授業の持ち主を確かめてから、署名つきで保存・取り出し・削除を頼む
- ファイルは Worker が決めたランダムな32文字の名前で保存する。元のファイル名や種類は D1（`course_files`）にだけ持つ
- 1ファイル 10MB まで（`files.php` の `MAX_BYTES` と `src/lib/files.ts` の `FILE_MAX_BYTES`）。1人の合計は 100MB まで（`src/lib/server/files.ts` の `USER_QUOTA_BYTES`）
- 保存・取り出し・削除はどれも POST で送る。レンタルサーバーの WAF が PUT や DELETE を止めることがあるため
- 本番で初めて使う前に、シンの「WAF設定」でアップロードが止められないか確かめる。止められたら、`koma-files/` だけ除外できるか見る

## 鍵を作り直すとき

1. `koma-relay-secret.php`（または `koma-files-secret.php`）の値を新しいランダムな文字列にしてアップロードし直す
2. 同じ値を `npx wrangler secret put RELAY_SECRET`（または `FILES_SECRET`）で登録する

## 手元で試すとき

`npm run dev` のときは、シンと同じフォルダの形を手元に作って PHP の組み込みサーバーで `files.php` を動かす。

1. どこかに `public_html/koma-files/files.php`（このフォルダの `files.php` をコピー）と `koma-files-secret.php` を置く
2. そのフォルダで `php -S 127.0.0.1:8788 -t public_html`
3. プロジェクトの直下に `.dev.local.vars` を作る（Git には入らない）

   ```
   FILES_URL="http://127.0.0.1:8788/koma-files/files.php"
   FILES_SECRET="koma-files-secret.php と同じ値"
   ```

`.dev.vars` ではなく `.dev.local.vars` にしているのは、`.dev.vars` があると `wrangler types` がその中身を `worker-configuration.d.ts` に入れてしまい、PC によって型が変わるから。設定がないときは資料のボタンが押せないだけで、ほかの機能は動く。
