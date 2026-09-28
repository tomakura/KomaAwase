<?php
// Mail relay for コマあわせ, hosted on シンレンタルサーバー.
//
// Cloudflare Workers can't reach the rental server's SMTP ports, so the Worker
// POSTs here over HTTPS and this script sends the mail from the server itself.
// It only ever sends the fixed messages below, so it can't be used as an open relay:
//   - requests must carry an HMAC-SHA256 signature made with the shared secret
//   - signatures older than 5 minutes are rejected
//   - each kind of message has a fixed subject and body, and takes only a link to
//     コマあわせ's own page for that kind
//
// Request:  POST, body {"to": "...", "link": "...", "kind": "signin" | "verify"}
//           ("kind" may be left out for signin, as older Workers do)
//           headers X-Koma-Timestamp: <unix seconds>
//                   X-Koma-Signature: hex(HMAC-SHA256(secret, "<timestamp>.<body>"))

declare(strict_types=1);

const MAX_AGE_SECONDS = 300;
const FROM_ADDRESS = 'noreply@koma.tomakura.com';
const FROM_NAME = 'コマあわせ';
const MESSAGES = [
	// Sign-in and sign-up links
	'signin' => [
		'prefix' => 'https://koma.tomakura.com/auth/email/',
		'subject' => 'コマあわせのログイン用リンク',
		'lines' => [
			'コマあわせにログインするには、下のリンクを開いてください。',
			'',
			'{link}',
			'',
			'リンクは15分間、1回だけ使えます。',
			'このメールに心当たりがない場合は、何もせずに削除してください。',
		],
	],
	// Enrollment checks sent to a university address
	'verify' => [
		'prefix' => 'https://koma.tomakura.com/verify/',
		'subject' => 'コマあわせの在籍確認',
		'lines' => [
			'コマあわせで、このメールアドレスでの在籍確認が申し込まれました。',
			'ご本人の場合は、下のリンクを開いて確認を終えてください。',
			'',
			'{link}',
			'',
			'リンクは1日、1回だけ使えます。',
			'このメールに心当たりがない場合は、何もせずに削除してください。',
		],
	],
];

header('Content-Type: application/json; charset=utf-8');

function respond(int $status, array $body): void
{
	http_response_code($status);
	echo json_encode($body);
	exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
	respond(405, ['error' => 'method not allowed']);
}

// The secret lives one level above public_html so it is never served.
$secretFile = dirname(__DIR__, 2) . '/koma-relay-secret.php';
if (!is_file($secretFile)) {
	respond(500, ['error' => 'not configured']);
}
$secret = require $secretFile;
if (!is_string($secret) || strlen($secret) < 32) {
	respond(500, ['error' => 'not configured']);
}

$body = file_get_contents('php://input');
$timestamp = $_SERVER['HTTP_X_KOMA_TIMESTAMP'] ?? '';
$signature = $_SERVER['HTTP_X_KOMA_SIGNATURE'] ?? '';

if (!ctype_digit($timestamp) || abs(time() - (int) $timestamp) > MAX_AGE_SECONDS) {
	respond(401, ['error' => 'stale']);
}
$expected = hash_hmac('sha256', $timestamp . '.' . $body, $secret);
if (!is_string($signature) || !hash_equals($expected, $signature)) {
	respond(401, ['error' => 'bad signature']);
}

$data = json_decode((string) $body, true);
$to = is_array($data) ? ($data['to'] ?? null) : null;
$link = is_array($data) ? ($data['link'] ?? null) : null;
$kind = is_array($data) ? ($data['kind'] ?? 'signin') : null;

if (!is_string($to) || filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
	respond(400, ['error' => 'bad address']);
}
if (!is_string($kind) || !isset(MESSAGES[$kind])) {
	respond(400, ['error' => 'bad kind']);
}
$message = MESSAGES[$kind];
$prefix = $message['prefix'];
if (
	!is_string($link)
	|| !str_starts_with($link, $prefix)
	|| preg_match('/^[A-Za-z0-9_-]{20,100}$/', substr($link, strlen($prefix))) !== 1
) {
	respond(400, ['error' => 'bad link']);
}

if (!function_exists('mb_send_mail')) {
	respond(500, ['error' => 'mbstring is not available']);
}
mb_language('uni');
mb_internal_encoding('UTF-8');

$text = implode("\n", array_map(fn (string $line) => $line === '{link}' ? $link : $line, $message['lines']));
$headers = 'From: ' . mb_encode_mimeheader(FROM_NAME) . ' <' . FROM_ADDRESS . '>';

// -f sets the envelope sender so SPF is checked against koma.tomakura.com.
$sent = mb_send_mail($to, $message['subject'], $text, $headers, '-f' . FROM_ADDRESS);
respond($sent ? 200 : 502, ['ok' => $sent]);
