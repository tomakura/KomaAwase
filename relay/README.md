# メール中継（relay）

Cloudflare Workers からはシンレンタルサーバーの SMTP に接続できないので、ログイン用のメールはシンに置いたこの PHP から送る。

## 置き方

| ファイル | 置き場所（シン） |
|---|---|
| `send.php` | `tomakura.com/public_html/koma-relay/send.php` |
| `koma-relay-secret.php` | `tomakura.com/koma-relay-secret.php`（`public_html` の外。Web からは見えない） |

- `koma-relay-secret.php` は Git に入れない。`koma-relay-secret.example.php` を元に作り、中身は Worker の `RELAY_SECRET` と同じ値にする
- PHP 8 以上と mbstring が必要（シンは標準で入っている）
- 中継は `send.php` の `ALLOWED_LINK_PREFIXES` にある本番の URL のリンクしか受け付けない。Cloudflare のプレビュー URL は本番の D1 と鍵を共有してしまうので、`wrangler.jsonc` で無効にしている
- アプリの URL を増やしたり変えたりしたときは、`ALLOWED_LINK_PREFIXES` も直してアップロードし直す

## 鍵を作り直すとき

1. `koma-relay-secret.php` の値を新しいランダムな文字列にしてアップロードし直す
2. 同じ値を `npx wrangler secret put RELAY_SECRET` で登録する
