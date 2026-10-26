<?php
/**
 * Contact form endpoint: the form on / and /en/ posts here (assets/js/main.js, initForm) and this script
 * emails the enquiry to info@jds-sommer.de in the background. Answers JSON: {"ok":true} or {"ok":false,"error":"..."}.
 *
 * Spam protection: a hidden honeypot field, a minimum time on the page, the ALTCHA bot check (proof of work on a
 * signed challenge, see "Bot check" below; the widget is self-hosted in assets/js/altcha/), and a sending limit per
 * visitor (an anonymised IP hash, kept in _private/ratelimit/ for at most a day). Nothing else is stored.
 *
 * Test mode: while the file _private/test-recipient exists (one email address in it), enquiries go to that
 * address instead of info@, otherwise exactly like a real enquiry. Upload it to test, delete it to go live.
 *
 * Sending: as set in _private/mail-config.php, else PHP mail(). That file is created on the server only, never in
 * Git or the deploy, and returns one of:
 *   <?php return ['transport' => 'smtp', 'host' => 'mail.agenturserver.de', 'port' => 587,
 *                 'user' => '<mailbox>', 'pass' => '<password>', 'from' => '<mailbox>'];
 *   <?php return ['transport' => 'graph', 'tenant' => '<Directory (tenant) ID>', 'client_id' => '<Application (client) ID>',
 *                 'client_secret' => '<secret value>', 'sender' => 'contact@jds-sommer.de'];
 * Failures are written to _private/contact-errors.log (status codes only, no visitor data).
 */

const RECIPIENT = 'info@jds-sommer.de';
const SENDER = 'contact@jds-sommer.de';
const SENDER_NAME = 'JDS Sommer Website';
const ALLOWED_HOSTS = ['www.jds-sommer.de', 'jds-sommer.de'];
const MIN_SECONDS = 3;                  // filled in faster than this: a bot
const LIMITS = [[600, 3], [86400, 10]]; // at most 3 requests per 10 minutes and 10 per day per visitor
const ALTCHA_PREFIX = '000';            // bot check difficulty: the derived key must start with these hex digits
const ALTCHA_COST = 4;                  // SHA-256 rounds per try (about 16,000 hashes per solve on average)
const ALTCHA_MAX_AGE = 7200;            // a challenge is valid for 2 hours

date_default_timezone_set('Europe/Berlin');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

function reply(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body);
    exit;
}

/** Secret for signing bot-check challenges; created on first use in _private/ (never in Git or the deploy). */
function form_secret(): string
{
    $file = __DIR__ . '/_private/form-secret';
    $s = is_file($file) ? trim((string) file_get_contents($file)) : '';
    if (strlen($s) < 32) {
        $s = bin2hex(random_bytes(32));
        if (@file_put_contents($file, $s, LOCK_EX) !== false) {
            @chmod($file, 0600);
        }
    }
    return $s;
}

/** The challenge parameters exactly as they are signed: keys sorted, compact JSON (as ALTCHA's canonicalJSON). */
function altcha_json(array $p): string
{
    ksort($p);
    return json_encode($p, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

/**
 * Checks an ALTCHA v3 payload (the widget's hidden "altcha" field: base64 JSON {challenge: {parameters, signature},
 * solution: {counter, derivedKey}}). The same rules as altcha's verifySolution() for algorithm SHA-256:
 * our signature, not expired, and sha256^cost(salt + nonce + counter as uint32) = derivedKey, starting with keyPrefix.
 * Returns the challenge signature (used once only, see below) or null.
 */
function altcha_verify(string $field): ?string
{
    $j = json_decode((string) base64_decode($field, true), true);
    $p = $j['challenge']['parameters'] ?? null;
    $sig = $j['challenge']['signature'] ?? null;
    $counter = $j['solution']['counter'] ?? null;
    $key = $j['solution']['derivedKey'] ?? null;
    if (!is_array($p) || !is_string($sig) || !is_int($counter) || !is_string($key)) {
        return null;
    }
    if (!hash_equals(hash_hmac('sha256', altcha_json($p), form_secret()), $sig)) {
        return null;                                            // not issued by us, or changed
    }
    if (($p['algorithm'] ?? '') !== 'SHA-256' || !is_int($p['expiresAt'] ?? null) || $p['expiresAt'] < time()
        || $counter < 0 || $counter > 4294967295 || !preg_match('/^(?:[0-9a-f]{2})+$/', $key)) {
        return null;
    }
    $derived = hex2bin($p['salt']) . hex2bin($p['nonce']) . pack('N', $counter);
    for ($i = 0, $n = max(1, (int) $p['cost']); $i < $n; $i++) {
        $derived = hash('sha256', $derived, true);
    }
    $hex = bin2hex(substr($derived, 0, (int) $p['keyLength']));
    return hash_equals($hex, $key) && str_starts_with($hex, strtolower((string) $p['keyPrefix'])) ? $sig : null;
}

/* Bot check, step 1: GET ?challenge hands the ALTCHA widget a signed challenge (format of altcha 3.x,
   createChallenge() with algorithm SHA-256). The widget solves it in the background and puts the result
   into the form's hidden "altcha" field. */
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && isset($_GET['challenge'])) {
    $p = [
        'algorithm' => 'SHA-256', 'cost' => ALTCHA_COST, 'expiresAt' => time() + ALTCHA_MAX_AGE, 'keyLength' => 32,
        'keyPrefix' => ALTCHA_PREFIX, 'nonce' => bin2hex(random_bytes(16)), 'salt' => bin2hex(random_bytes(16)),
    ];
    ksort($p);
    reply(200, ['parameters' => $p, 'signature' => hash_hmac('sha256', altcha_json($p), form_secret())]);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    reply(405, ['ok' => false, 'error' => 'method']);
}

// Only our own pages may post here
$origin = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
if ($origin !== '' && !in_array(parse_url($origin, PHP_URL_HOST), ALLOWED_HOSTS, true)) {
    reply(403, ['ok' => false, 'error' => 'origin']);
}

/** A form value as a single trimmed line (no CR/LF, so it can never inject email headers), cut to $max characters. */
function line(string $key, int $max): string
{
    $v = is_string($_POST[$key] ?? null) ? $_POST[$key] : '';
    $v = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $v) ?? '');
    return mb_substr($v, 0, $max);
}

/** Multi-line text: keeps line breaks, drops other control characters. */
function text(string $key, int $max): string
{
    $v = is_string($_POST[$key] ?? null) ? $_POST[$key] : '';
    $v = str_replace(["\r\n", "\r"], "\n", $v);
    $v = trim(preg_replace('/[\x00-\x09\x0B-\x1F\x7F]+/u', ' ', $v) ?? '');
    return mb_substr($v, 0, $max);
}

// Spam traps: answer "sent" so bots learn nothing, but send nothing
if (line('website', 200) !== '' || (int) line('elapsed', 10) < MIN_SECONDS) {
    reply(200, ['ok' => true]);
}

// Bot check, step 2: a valid, solved ALTCHA challenge from us (checked once more below: each one counts once)
$altcha = is_string($_POST['altcha'] ?? null) && strlen($_POST['altcha']) < 4000 ? altcha_verify($_POST['altcha']) : null;
if ($altcha === null) {
    reply(403, ['ok' => false, 'error' => 'bot']);
}

$f = [
    'reference'   => line('reference', 100),
    'first_name'  => line('first_name', 80),
    'last_name'   => line('last_name', 80),
    'company'     => line('company', 120),
    'email'       => line('email', 254),
    'phone'       => line('phone', 40),
    'inquiry'     => text('inquiry', 5000),
    'reply'       => line('reply', 40),
];
$lang = line('lang', 2) === 'en' ? 'en' : 'de';
$callback = in_array($f['reply'], ['A callback', 'Einen Rückruf'], true);

$valid = $f['reference'] !== '' && $f['first_name'] !== '' && $f['last_name'] !== '' && $f['inquiry'] !== ''
    && filter_var($f['email'], FILTER_VALIDATE_EMAIL) !== false
    && ($_POST['privacy'] ?? '') !== ''
    && preg_match_all('/[0-9]/', $f['phone']) >= 6;   // a phone number is required (at least 6 digits)
if (!$valid) {
    reply(422, ['ok' => false, 'error' => 'invalid']);
}

/* Sending limit per visitor. The IP is stored only as a salted hash, and only as long as the limit needs it. */
$dir = __DIR__ . '/_private/ratelimit';
if (!is_dir($dir)) {
    @mkdir($dir, 0700, true);
}
if (!is_dir($dir) || !is_writable($dir)) {
    $dir = sys_get_temp_dir() . '/jds-contact-ratelimit';
    @mkdir($dir, 0700, true);
}
$salt = hash('sha256', __FILE__ . filemtime(__FILE__));
$file = $dir . '/' . hash('sha256', $salt . ($_SERVER['REMOTE_ADDR'] ?? '')) . '.json';
$now = time();
$fh = @fopen($file, 'c+');
if ($fh) {
    flock($fh, LOCK_EX);
    $hits = json_decode(stream_get_contents($fh) ?: '[]', true) ?: [];
    $hits = array_values(array_filter($hits, fn($t) => is_int($t) && $t > $now - 86400));
    foreach (LIMITS as [$window, $max]) {
        if (count(array_filter($hits, fn($t) => $t > $now - $window)) >= $max) {
            flock($fh, LOCK_UN);
            fclose($fh);
            reply(429, ['ok' => false, 'error' => 'rate']);
        }
    }
    $hits[] = $now;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($hits));
    flock($fh, LOCK_UN);
    fclose($fh);
}
// Each solved bot check counts for one enquiry only (a marker named after its signature, kept for a day)
$used = $dir . '/altcha-' . substr($altcha, 0, 40) . '.used';
if (is_file($used)) {
    reply(403, ['ok' => false, 'error' => 'bot']);
}
@touch($used);

// Now and then, remove entries older than a day
if (random_int(1, 50) === 1) {
    foreach (array_merge(glob($dir . '/*.json') ?: [], glob($dir . '/*.used') ?: []) as $old) {
        if (filemtime($old) < $now - 86400) {
            @unlink($old);
        }
    }
}

/* Recipient: info@, or in test mode the address in _private/test-recipient. Test emails are otherwise
   identical to real ones (same subject, no marker), so a test shows exactly what info@ will receive. */
$to = RECIPIENT;
$testFile = __DIR__ . '/_private/test-recipient';
if (is_file($testFile)) {
    $addr = trim((string) file_get_contents($testFile));
    if (filter_var($addr, FILTER_VALIDATE_EMAIL)) {
        $to = $addr;
    }
}

/* The email, in the language of the page the form was sent from: an HTML version in the JDS design
   and a plain-text version for mail programs without HTML. Reply-To is the visitor. */
$name = $f['first_name'] . ' ' . $f['last_name'];
$T = $lang === 'en' ? [
    'subject' => 'Website enquiry', 'title' => 'New enquiry from the website',
    'regarding' => 'Regarding', 'wants' => 'Wants', 'callback' => 'A callback', 'byEmail' => 'A reply by email',
    'name' => 'Name', 'company' => 'Company', 'email' => 'Email', 'phone' => 'Phone',
    'inquiry' => 'Enquiry', 'reply' => 'Reply to', 'hint' => 'Or simply reply to this email.',
    'sent' => 'Sent via the English contact form on www.jds-sommer.de/en/ · privacy notice accepted · ',
    'date' => date('j M Y, H:i'), 'day' => date('j M Y'),
    'greeting' => 'Dear ' . $f['first_name'] . ' ' . $f['last_name'] . ',', 'yours' => 'Your enquiry of ' . date('j M Y') . ':',
] : [
    'subject' => 'Website-Anfrage', 'title' => 'Neue Anfrage über die Website',
    'regarding' => 'Betreff', 'wants' => 'Gewünscht', 'callback' => 'Rückruf', 'byEmail' => 'Antwort per E-Mail',
    'name' => 'Name', 'company' => 'Firma', 'email' => 'E-Mail', 'phone' => 'Telefon',
    'inquiry' => 'Anfrage', 'reply' => 'Antworten an', 'hint' => 'Oder antworten Sie einfach auf diese E-Mail.',
    'sent' => 'Gesendet über das deutsche Kontaktformular auf www.jds-sommer.de · Datenschutzhinweis akzeptiert · ',
    'date' => date('d.m.Y, H:i') . ' Uhr', 'day' => date('d.m.Y'),
    'greeting' => 'Guten Tag ' . $f['first_name'] . ' ' . $f['last_name'] . ',', 'yours' => 'Ihre Anfrage vom ' . date('d.m.Y') . ':',
];
$subject = $T['subject'] . ' ' . $T['day'] . ': ' . $f['reference'] . ' (' . $name . ')';
$rows = [
    $T['regarding'] => $f['reference'],
    $T['wants'] => $callback ? $T['callback'] : $T['byEmail'],
    $T['name'] => $name,
    $T['company'] => $f['company'],
    $T['email'] => $f['email'],
    $T['phone'] => $f['phone'],
];

$text = $T['title'] . "\n\n";
foreach ($rows as $k => $v) {
    $text .= str_pad($k . ':', 22) . ($v !== '' ? $v : '-') . "\n";
}
$text .= "\n" . $T['inquiry'] . ":\n" . $f['inquiry'] . "\n\n--\n" . $T['sent'] . $T['date'] . "\n" . $T['hint'] . "\n";

$h = fn(string $v) => htmlspecialchars($v, ENT_QUOTES, 'UTF-8');
$ink = '#1d1f45';
$muted = '#6b6d8a';
$brand = '#393b8d';
$trs = '';
foreach ($rows as $k => $v) {
    if ($v === '') {
        $cell = '<span style="color:' . $muted . '">–</span>';
    } elseif ($k === $T['email']) {
        $cell = '<a href="mailto:' . $h($v) . '" style="color:' . $brand . ';font-weight:bold;text-decoration:none">' . $h($v) . '</a>';
    } elseif ($k === $T['phone']) {
        $cell = '<a href="tel:' . $h(preg_replace('/[^0-9+]/', '', $v)) . '" style="color:' . $brand . ';font-weight:bold;text-decoration:none">' . $h($v) . '</a>';
    } elseif ($k === $T['wants'] && $callback) {
        $cell = '<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:#fdecec;color:#cc0000;font-weight:bold">' . $h($v) . '</span>';
    } else {
        $cell = $h($v);
    }
    $trs .= '<tr><td style="padding:9px 0;width:150px;vertical-align:top;color:' . $muted . ';font-size:13px;border-bottom:1px solid #ececf4">' . $h($k)
        . '</td><td style="padding:9px 0;vertical-align:top;color:' . $ink . ';font-size:15px;border-bottom:1px solid #ececf4">' . $cell . '</td></tr>';
}
// Reply button: a new email to the visitor, with subject, greeting and their enquiry quoted (kept short for the link)
$quote = mb_strlen($f['inquiry']) > 1200 ? mb_substr($f['inquiry'], 0, 1200) . ' …' : $f['inquiry'];
$replyBody = $T['greeting'] . "\n\n\n\n" . $T['yours'] . "\n> " . str_replace("\n", "\n> ", $quote);
$replyHref = 'mailto:' . rawurlencode($f['email']) . '?subject=' . rawurlencode('Re: ' . $T['subject'] . ': ' . $f['reference'])
    . '&body=' . rawurlencode(str_replace("\n", "\r\n", $replyBody));   // CRLF: Outlook keeps the line breaks
$html = '<!doctype html><html lang="' . $lang . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>'
    . '<body style="margin:0;padding:0;background:#f3f3fb;font-family:Arial,Helvetica,sans-serif">'
    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3fb;padding:24px 12px"><tr><td align="center">'
    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5ef">'
    . '<tr><td style="background:' . $brand . ';padding:20px 28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>'
    . '<td style="vertical-align:middle;padding-right:14px"><img src="cid:jds-logo" width="48" height="48" alt="JDS Sommer" style="display:block;width:48px;height:48px;border-radius:12px;border:0;background:#ffffff"></td>'
    . '<td style="vertical-align:middle"><div style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:.04em">JDS SOMMER</div>'
    . '<div style="color:#c9cbee;font-size:13px;margin-top:3px">' . $h($T['title']) . '</div></td></tr></table></td></tr>'
    . '<tr><td style="padding:24px 28px 8px">'
    . '<div style="color:' . $ink . ';font-size:19px;font-weight:bold;line-height:1.35">' . $h($f['reference']) . '</div>'
    . '<div style="color:' . $muted . ';font-size:14px;margin-top:4px">' . $h($name) . ($f['company'] !== '' ? ' · ' . $h($f['company']) : '') . '</div>'
    . '</td></tr>'
    . '<tr><td style="padding:8px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' . $trs . '</table></td></tr>'
    . '<tr><td style="padding:18px 28px 6px;color:' . $muted . ';font-size:13px">' . $h($T['inquiry']) . '</td></tr>'
    . '<tr><td style="padding:0 28px"><div style="background:#f3f3fb;border-left:4px solid ' . $brand . ';border-radius:8px;padding:14px 16px;color:' . $ink . ';font-size:15px;line-height:1.55">'
    . nl2br($h($f['inquiry'])) . '</div></td></tr>'
    . '<tr><td style="padding:24px 28px 8px"><a href="' . $h($replyHref) . '" style="display:inline-block;background:' . $brand . ';color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:24px">'
    . $h($T['reply'] . ' ' . $name) . ' &rarr;<br><span style="font-weight:normal;font-size:13px;color:#c9cbee">' . $h($f['email']) . '</span></a>'
    . '<div style="color:' . $muted . ';font-size:13px;margin-top:10px">' . $h($T['hint']) . '</div></td></tr>'
    . '<tr><td style="padding:22px 28px;border-top:1px solid #ececf4;color:' . $muted . ';font-size:12px;line-height:1.5">'
    . $h($T['sent'] . $T['date']) . '</td></tr>'
    . '</table></td></tr></table></body></html>';
// The logo travels inside the email (cid:jds-logo), so Outlook shows it without "download pictures"
$message = ['text' => $text, 'html' => $html, 'logo' => (string) @file_get_contents(__DIR__ . '/assets/img/apple-touch-icon.png')];

/* Sending. With _private/mail-config.php in place, Microsoft 365 sends the email (Graph API, as SENDER);
   without it, PHP mail() is used. The jds-sommer.de SPF record only allows Microsoft, so on the live server
   mail() is refused unless Mittwald is added to SPF. */
$config = is_file(__DIR__ . '/_private/mail-config.php') ? (include __DIR__ . '/_private/mail-config.php') : null;
$transport = is_array($config) ? ($config['transport'] ?? '') : '';
$sent = $transport === 'smtp' ? send_smtp($config, $to, $subject, $message, $name, $f['email'])
    : ($transport === 'graph' ? send_graph($config, $to, $subject, $message, $name, $f['email'])
    : send_mail($to, $subject, $message, $name, $f['email']));
if (!$sent) {
    reply(500, ['ok' => false, 'error' => 'send']);
}
reply(200, ['ok' => true]);

/** A line in _private/contact-errors.log: what failed and the server's answer code, never visitor data. */
function log_error(string $what): void
{
    @file_put_contents(__DIR__ . '/_private/contact-errors.log', date('Y-m-d H:i:s') . ' ' . $what . "\n", FILE_APPEND | LOCK_EX);
}

/**
 * The message as multipart/alternative (plain text + HTML), each part base64 with CRLF lines:
 * returns [Content-Type header value, body]. Base64 cannot be damaged by line-ending changes on the way.
 */
function mime(array $m): array
{
    $b64 = fn(string $v) => rtrim(chunk_split(base64_encode($v), 76, "\r\n")) . "\r\n";
    $b = 'jds-alt-' . bin2hex(random_bytes(8));
    $part = fn(string $type, string $v) => '--' . $b . "\r\nContent-Type: " . $type . "; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: base64\r\n\r\n" . $b64($v);
    $alt = $part('text/plain', $m['text']) . $part('text/html', $m['html']) . '--' . $b . "--\r\n";
    if (($m['logo'] ?? '') === '') {
        return ['multipart/alternative; boundary="' . $b . '"', $alt];
    }
    // The logo as an inline image next to the text: multipart/related { alternative, image/png cid:jds-logo }
    $r = 'jds-rel-' . bin2hex(random_bytes(8));
    return ['multipart/related; boundary="' . $r . '"',
        '--' . $r . "\r\nContent-Type: multipart/alternative; boundary=\"" . $b . "\"\r\n\r\n" . $alt
        . '--' . $r . "\r\nContent-Type: image/png; name=\"jds-logo.png\"\r\nContent-Transfer-Encoding: base64\r\n"
        . "Content-ID: <jds-logo>\r\nContent-Disposition: inline; filename=\"jds-logo.png\"\r\n\r\n" . $b64($m['logo'])
        . '--' . $r . "--\r\n"];
}

function send_mail(string $to, string $subject, array $m, string $name, string $email): bool
{
    $enc = fn(string $v) => mb_encode_mimeheader($v, 'UTF-8', 'Q', "\r\n");
    [$type, $body] = mime($m);
    $headers = implode("\r\n", [
        'From: ' . $enc(SENDER_NAME) . ' <' . SENDER . '>',
        'Reply-To: ' . $enc($name) . ' <' . $email . '>',
        'MIME-Version: 1.0',
        'Content-Type: ' . $type,
        'X-Mailer: jds-sommer.de contact form',
    ]);
    $ok = mail($to, $enc($subject), $body, $headers, '-f' . SENDER);
    if (!$ok) {
        log_error('mail() failed: ' . (error_get_last()['message'] ?? 'no message'));
    }
    return $ok;
}

/**
 * SMTP with login (Mittwald mailbox): STARTTLS on port 587. Config: 'host', 'port', 'user', 'pass', 'from'
 * (the mailbox address; its domain's SPF must allow the mail server, e.g. jds-sommer.net includes agenturserver.de).
 */
function send_smtp(array $c, string $to, string $subject, array $m, string $name, string $email): bool
{
    $from = $c['from'] ?? $c['user'];
    $fail = function (string $step, string $answer) use (&$fp) {
        log_error('smtp ' . $step . ': ' . trim($answer));
        if (is_resource($fp)) {
            fclose($fp);
        }
        return false;
    };
    $fp = @stream_socket_client('tcp://' . $c['host'] . ':' . ($c['port'] ?? 587), $errno, $errstr, 15);
    if (!$fp) {
        return $fail('connect', $errno . ' ' . $errstr);
    }
    stream_set_timeout($fp, 15);
    // One reply, also multi-line ("250-..." lines until "250 ..."); true when its code is one we expect
    $read = function () use ($fp): string {
        $all = '';
        while (($line = fgets($fp, 1024)) !== false) {
            $all .= $line;
            if (strlen($line) < 4 || $line[3] !== '-') {
                break;
            }
        }
        return $all;
    };
    $cmd = function (?string $line, string $expect) use ($fp, $read, &$answer): bool {
        if ($line !== null) {
            fwrite($fp, $line . "\r\n");
        }
        $answer = $read();
        return strncmp($answer, $expect, 3) === 0;
    };
    $host = 'www.jds-sommer.de';
    if (!$cmd(null, '220')) return $fail('greeting', $answer);
    if (!$cmd('EHLO ' . $host, '250')) return $fail('ehlo', $answer);
    if (!$cmd('STARTTLS', '220')) return $fail('starttls', $answer);
    if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
        return $fail('tls', 'handshake failed');
    }
    if (!$cmd('EHLO ' . $host, '250')) return $fail('ehlo-tls', $answer);
    if (!$cmd('AUTH LOGIN', '334')) return $fail('auth', $answer);
    if (!$cmd(base64_encode($c['user']), '334')) return $fail('auth-user', $answer);
    if (!$cmd(base64_encode($c['pass']), '235')) return $fail('auth-pass', $answer);
    if (!$cmd('MAIL FROM:<' . $from . '>', '250')) return $fail('mail-from', $answer);
    if (!$cmd('RCPT TO:<' . $to . '>', '250')) return $fail('rcpt-to', $answer);
    if (!$cmd('DATA', '354')) return $fail('data', $answer);

    $enc = fn(string $v) => mb_encode_mimeheader($v, 'UTF-8', 'Q', "\r\n");
    $headers = [
        'Date: ' . date('r'),
        'From: ' . $enc(SENDER_NAME) . ' <' . $from . '>',
        'To: <' . $to . '>',
        'Reply-To: ' . $enc($name) . ' <' . $email . '>',
        'Subject: ' . $enc($subject),
        'Message-ID: <' . bin2hex(random_bytes(12)) . '@jds-sommer.de>',
        'MIME-Version: 1.0',
    ];
    [$type, $body] = mime($m);
    $headers[] = 'Content-Type: ' . $type;
    $headers[] = 'X-Mailer: jds-sommer.de contact form';
    $body = preg_replace('/^\./m', '..', $body);   // SMTP: a line starting with "." is doubled
    fwrite($fp, implode("\r\n", $headers) . "\r\n\r\n" . $body . ".\r\n");
    if (!$cmd(null, '250')) return $fail('send', $answer);
    $cmd('QUIT', '221');
    fclose($fp);
    return true;
}

/** POST to a URL; returns [HTTP status, decoded JSON body or null]. Status 0 = no connection. */
function http_post(string $url, array $headers, string $data): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $data,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
    ]);
    $res = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($res === false) {
        log_error('connection to ' . parse_url($url, PHP_URL_HOST) . ' failed: ' . curl_error($ch));
    }
    return [$status, is_string($res) ? json_decode($res, true) : null];
}

/** An access token for Microsoft Graph (client credentials), cached in _private/ until shortly before it expires. */
function graph_token(array $c): ?string
{
    $cache = __DIR__ . '/_private/graph-token.json';
    $t = is_file($cache) ? json_decode((string) file_get_contents($cache), true) : null;
    if (is_array($t) && ($t['expires'] ?? 0) > time() + 60 && ($t['client'] ?? '') === $c['client_id']) {
        return $t['token'];
    }
    [$status, $r] = http_post(
        'https://login.microsoftonline.com/' . rawurlencode($c['tenant']) . '/oauth2/v2.0/token',
        ['Content-Type: application/x-www-form-urlencoded'],
        http_build_query([
            'grant_type' => 'client_credentials',
            'client_id' => $c['client_id'],
            'client_secret' => $c['client_secret'],
            'scope' => 'https://graph.microsoft.com/.default',
        ])
    );
    if ($status !== 200 || empty($r['access_token'])) {
        // e.g. AADSTS7000215 = wrong secret, AADSTS7000222 = secret expired, AADSTS700016 = unknown app
        log_error('token ' . $status . ': ' . ($r['error'] ?? '') . ' ' . strtok((string) ($r['error_description'] ?? ''), "\r\n"));
        return null;
    }
    @file_put_contents($cache, json_encode(['token' => $r['access_token'], 'expires' => time() + (int) $r['expires_in'], 'client' => $c['client_id']]), LOCK_EX);
    @chmod($cache, 0600);
    return $r['access_token'];
}

function send_graph(array $c, string $to, string $subject, array $m, string $name, string $email): bool
{
    $token = graph_token($c);
    if ($token === null) {
        return false;
    }
    $sender = $c['sender'] ?? SENDER;
    $message = [
        'message' => [
            'subject' => $subject,
            'body' => ['contentType' => 'HTML', 'content' => $m['html']],
            'from' => ['emailAddress' => ['address' => $sender, 'name' => SENDER_NAME]],
            'toRecipients' => [['emailAddress' => ['address' => $to]]],
            'replyTo' => [['emailAddress' => ['address' => $email, 'name' => $name]]],
        ],
        'saveToSentItems' => true,
    ];
    if (($m['logo'] ?? '') !== '') {
        $message['message']['attachments'] = [[
            '@odata.type' => '#microsoft.graph.fileAttachment', 'name' => 'jds-logo.png', 'contentType' => 'image/png',
            'contentBytes' => base64_encode($m['logo']), 'isInline' => true, 'contentId' => 'jds-logo',
        ]];
    }
    [$status, $r] = http_post(
        'https://graph.microsoft.com/v1.0/users/' . rawurlencode($sender) . '/sendMail',
        ['Authorization: Bearer ' . $token, 'Content-Type: application/json'],
        json_encode($message)
    );
    if ($status !== 202) {
        // 403 ErrorAccessDenied = Mail.Send consent or access policy missing; 404 = sender mailbox not found
        log_error('sendMail ' . $status . ': ' . ($r['error']['code'] ?? '') . ' ' . ($r['error']['message'] ?? ''));
        if ($status === 401) {
            @unlink(__DIR__ . '/_private/graph-token.json');
        }
        return false;
    }
    return true;
}
