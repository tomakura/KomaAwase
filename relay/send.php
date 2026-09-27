<?php
// Sign-in mail relay for コマあわせ, hosted on シンレンタルサーバー.
//
// Cloudflare Workers can't reach the rental server's SMTP ports, so the Worker
// POSTs here over HTTPS and this script sends the mail from the server itself.
// It only ever sends the fixed sign-in message, so it can't be used as an open relay:
//   - requests must carry an HMAC-SHA256 signature made with the shared secret
//   - signatures older than 5 minutes are rejected
//   - the link must be a コマあわせ sign-in URL; subject and body are fixed here
//
// Request:  POST, body {"to": "...", "link": "..."}
//           headers X-Koma-Timestamp: <unix seconds>
//                   X-Koma-Signature: hex(HMAC-SHA256(secret, "<timestamp>.<body>"))

declare(strict_types=1);

const MAX_AGE_SECONDS = 300;
const FROM_ADDRESS = 'noreply@koma.tomakura.com';
const FROM_NAME = 'コマあわせ';
const ALLOWED_LINK_PREFIXES = [
	'https://komaawase.tomakura.workers.dev/auth/email/',
	'https://koma.tomakura.com/auth/email/',
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

if (!is_string($to) || filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
	respond(400, ['error' => 'bad address']);
}
$linkOk = false;
if (is_string($link)) {
	foreach (ALLOWED_LINK_PREFIXES as $prefix) {
		$token = substr($link, strlen($prefix));
		if (str_starts_with($link, $prefix) && preg_match('/^[A-Za-z0-9_-]{20,100}$/', $token) === 1) {
			$linkOk = true;
			break;
		}
	}
}
if (!$linkOk) {
	respond(400, ['error' => 'bad link']);
}

if (!function_exists('mb_send_mail')) {
	respond(500, ['error' => 'mbstring is not available']);
}
mb_language('uni');
mb_internal_encoding('UTF-8');

$subject = 'コマあわせのログイン用リンク';
$message = implode("\n", [
	'コマあわせにログインするには、下のリンクを開いてください。',
	'',
	$link,
	'',
	'リンクは15分間、1回だけ使えます。',
	'このメールに心当たりがない場合は、何もせずに削除してください。',
]);
$headers = 'From: ' . mb_encode_mimeheader(FROM_NAME) . ' <' . FROM_ADDRESS . '>';

// -f sets the envelope sender so SPF is checked against koma.tomakura.com.
$sent = mb_send_mail($to, $subject, $message, $headers, '-f' . FROM_ADDRESS);
respond($sent ? 200 : 502, ['ok' => $sent]);
