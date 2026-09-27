<?php
// Course file storage for コマあわせ, hosted on シンレンタルサーバー.
//
// Only the Worker talks to this script; browsers never do. The Worker checks who is
// signed in and which course a file belongs to, and keeps names and types in D1.
// This script only stores bytes under random keys:
//   - requests must carry an HMAC-SHA256 signature made with the shared secret
//   - signatures older than 5 minutes are rejected
//   - keys are 32 hex characters chosen by the Worker, so they can't point anywhere else
//   - files live outside public_html and are never served or run by the web server
//
// Requests (all POST, since some hosts block PUT and DELETE):
//   files.php?action=put&key=<key>&size=<bytes>   body: the file
//   files.php?action=get&key=<key>
//   files.php?action=delete&key=<key>
// Headers: X-Koma-Timestamp: <unix seconds>
//          X-Koma-Signature: hex(HMAC-SHA256(secret, "<timestamp>.<action>.<key>.<size>"))
//          (size is empty for get and delete)

declare(strict_types=1);

const MAX_AGE_SECONDS = 300;
const MAX_BYTES = 10 * 1024 * 1024;

function fail(int $status, string $error): void
{
	http_response_code($status);
	header('Content-Type: application/json; charset=utf-8');
	echo json_encode(['error' => $error]);
	exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
	fail(405, 'method not allowed');
}

// The secret and the files live one level above public_html.
$base = dirname(__DIR__, 2);
$secretFile = $base . '/koma-files-secret.php';
if (!is_file($secretFile)) {
	fail(500, 'not configured');
}
$secret = require $secretFile;
if (!is_string($secret) || strlen($secret) < 32) {
	fail(500, 'not configured');
}

$action = $_GET['action'] ?? '';
$key = $_GET['key'] ?? '';
$size = $_GET['size'] ?? '';
$timestamp = $_SERVER['HTTP_X_KOMA_TIMESTAMP'] ?? '';
$signature = $_SERVER['HTTP_X_KOMA_SIGNATURE'] ?? '';

if (!is_string($action) || !in_array($action, ['put', 'get', 'delete'], true)) {
	fail(400, 'bad action');
}
if (!is_string($key) || preg_match('/^[0-9a-f]{32}$/', $key) !== 1) {
	fail(400, 'bad key');
}
if (!is_string($size) || ($action === 'put' ? !ctype_digit($size) : $size !== '')) {
	fail(400, 'bad size');
}
if (!is_string($timestamp) || !ctype_digit($timestamp) || abs(time() - (int) $timestamp) > MAX_AGE_SECONDS) {
	fail(401, 'stale');
}
$expected = hash_hmac('sha256', "$timestamp.$action.$key.$size", $secret);
if (!is_string($signature) || !hash_equals($expected, $signature)) {
	fail(401, 'bad signature');
}

// Two-character folders keep any one directory small.
$dir = $base . '/koma-files/' . substr($key, 0, 2);
$path = $dir . '/' . $key;

if ($action === 'get') {
	if (!is_file($path)) {
		fail(404, 'not found');
	}
	header('Content-Type: application/octet-stream');
	header('Content-Length: ' . filesize($path));
	readfile($path);
	exit;
}

if ($action === 'delete') {
	if (is_file($path) && !unlink($path)) {
		fail(500, 'could not delete');
	}
	header('Content-Type: application/json; charset=utf-8');
	echo json_encode(['ok' => true]);
	exit;
}

// put
$bytes = (int) $size;
if ($bytes < 1 || $bytes > MAX_BYTES) {
	fail(413, 'too large');
}
if (is_file($path)) {
	fail(409, 'exists');
}
if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
	fail(500, 'could not create folder');
}

// Write to a temporary name first so a cut-off upload never looks like a file.
$tmp = $path . '.part';
$in = fopen('php://input', 'rb');
$out = fopen($tmp, 'xb');
if ($in === false || $out === false) {
	fail(500, 'could not open');
}
$copied = stream_copy_to_stream($in, $out, MAX_BYTES + 1);
fclose($in);
fclose($out);
if ($copied !== $bytes) {
	unlink($tmp);
	fail(400, 'size mismatch');
}
if (!rename($tmp, $path)) {
	unlink($tmp);
	fail(500, 'could not save');
}
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['ok' => true]);
