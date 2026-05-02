<?php
session_start();
require_once __DIR__ . '/env_loader.php';

define('ADMIN_PASSWORD', $_ENV['ADMIN_PASSWORD'] ?? '');
define('DATA_FILE', __DIR__ . '/data/contacts.json');

function loadContacts(): array {
    if (!file_exists(DATA_FILE)) return [];
    $data = json_decode(file_get_contents(DATA_FILE), true);
    return is_array($data) ? $data : [];
}

function saveContacts(array $contacts): void {
    file_put_contents(DATA_FILE, json_encode($contacts, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

// ログアウト
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: admin.php');
    exit;
}

// ログイン処理
$loginError = false;
if (!isset($_SESSION['admin_logged_in']) && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['pw'])) {
    if ($_POST['pw'] === ADMIN_PASSWORD) {
        $_SESSION['admin_logged_in'] = true;
        header('Location: admin.php');
        exit;
    }
    $loginError = true;
}

$loggedIn = isset($_SESSION['admin_logged_in']);

if ($loggedIn) {
    // 既読
    if (isset($_GET['read'])) {
        $contacts = loadContacts();
        foreach ($contacts as &$c) {
            if ($c['id'] === $_GET['read']) $c['read'] = true;
        }
        unset($c);
        saveContacts($contacts);
        header('Location: admin.php');
        exit;
    }
    // 全件既読
    if (isset($_GET['readall'])) {
        $contacts = loadContacts();
        foreach ($contacts as &$c) $c['read'] = true;
        unset($c);
        saveContacts($contacts);
        header('Location: admin.php');
        exit;
    }
    // 削除
    if (isset($_GET['delete'])) {
        $contacts = loadContacts();
        $contacts = array_values(array_filter($contacts, fn($c) => $c['id'] !== $_GET['delete']));
        saveContacts($contacts);
        header('Location: admin.php');
        exit;
    }

    $contacts = array_reverse(loadContacts());
    $total    = count($contacts);
    $unread   = count(array_filter($contacts, fn($c) => !$c['read']));
}
?>
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>admin | nerdech</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
    font-family: 'DM Mono', monospace;
    background: #f4f5f7;
    color: #111;
    min-height: 100vh;
    font-size: 13px;
}

/* ─── Header ─── */
.admin-header {
    background: #0a0a0a;
    color: #fff;
    padding: 0 32px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
}
.admin-header__logo {
    font-size: 13px;
    letter-spacing: 0.08em;
    display: flex;
    align-items: center;
    gap: 12px;
}
.admin-header__badge {
    background: #3b82f6;
    color: white;
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 11px;
    letter-spacing: 0.05em;
}
.admin-header__logout {
    font-size: 11px;
    color: rgba(255,255,255,0.45);
    text-decoration: none;
    letter-spacing: 0.08em;
    transition: color 0.2s;
}
.admin-header__logout:hover { color: #fff; }

/* ─── Main ─── */
.admin-main {
    max-width: 1140px;
    margin: 0 auto;
    padding: 36px 24px;
}

/* ─── Stats ─── */
.stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 32px;
}
.stat {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 20px 24px;
}
.stat__label {
    font-size: 10px;
    letter-spacing: 0.15em;
    color: #9ca3af;
    text-transform: uppercase;
    margin-bottom: 10px;
}
.stat__value {
    font-size: 36px;
    font-weight: 500;
    line-height: 1;
}
.stat__value--blue { color: #3b82f6; }

/* ─── Table wrapper ─── */
.table-wrap {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
}
.table-header {
    padding: 16px 24px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.table-header h2 {
    font-size: 11px;
    letter-spacing: 0.12em;
    color: #9ca3af;
    font-weight: 400;
    text-transform: uppercase;
}
.btn-readall {
    font-family: inherit;
    font-size: 11px;
    letter-spacing: 0.06em;
    padding: 6px 14px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: transparent;
    color: #6b7280;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s;
}
.btn-readall:hover { border-color: #9ca3af; color: #374151; }

/* ─── Table ─── */
table { width: 100%; border-collapse: collapse; }
th {
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9ca3af;
    font-weight: 400;
    text-align: left;
    padding: 12px 20px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
}
td { padding: 0; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
tr:last-child td { border-bottom: none; }
tr.unread { background: #eff6ff; }
tr.unread:hover { background: #dbeafe; }
tr.read:hover { background: #f9fafb; }
.td-inner { padding: 16px 20px; }

.td-status { width: 24px; }
.status-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    display: inline-block;
    margin-top: 4px;
}
.status-dot.unread { background: #3b82f6; }
.status-dot.read   { background: #d1d5db; }

.td-date  { width: 160px; }
.td-date .td-inner  { color: #6b7280; font-size: 12px; white-space: nowrap; }
.td-name  { width: 140px; }
.td-name .td-inner  { font-weight: 500; }
.td-email { width: 220px; }
.td-email a { color: #3b82f6; text-decoration: none; }
.td-email a:hover { text-decoration: underline; }
.td-message {}

.msg-preview {
    color: #374151;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    cursor: pointer;
    line-height: 1.6;
}
.msg-full {
    display: none;
    color: #374151;
    white-space: pre-wrap;
    line-height: 1.8;
}
.msg-toggle {
    font-size: 10px;
    color: #9ca3af;
    margin-top: 6px;
    cursor: pointer;
    letter-spacing: 0.05em;
    user-select: none;
}
.msg-toggle:hover { color: #3b82f6; }

.td-actions { width: 150px; white-space: nowrap; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn-sm {
    font-family: inherit;
    font-size: 10px;
    letter-spacing: 0.05em;
    padding: 5px 10px;
    border-radius: 4px;
    border: 1px solid;
    cursor: pointer;
    text-decoration: none;
    background: transparent;
    transition: all 0.15s;
    display: inline-block;
}
.btn-read { color: #3b82f6; border-color: #bfdbfe; }
.btn-read:hover { background: #eff6ff; }
.btn-del  { color: #ef4444; border-color: #fecaca; }
.btn-del:hover  { background: #fef2f2; }

.empty {
    text-align: center;
    padding: 72px 24px;
    color: #9ca3af;
    font-size: 13px;
    letter-spacing: 0.06em;
}

/* ─── Login ─── */
.login-wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0a0a0a;
}
.login-box {
    width: 360px;
    padding: 48px 40px;
    background: #141414;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
}
.login-logo {
    font-size: 13px;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.4);
    margin-bottom: 36px;
}
.login-logo span { color: #fff; }
.login-label {
    display: block;
    font-size: 10px;
    letter-spacing: 0.15em;
    color: rgba(255,255,255,0.35);
    text-transform: uppercase;
    margin-bottom: 10px;
}
.login-input {
    width: 100%;
    font-family: inherit;
    font-size: 13px;
    padding: 12px 16px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    color: #fff;
    outline: none;
    margin-bottom: 20px;
    transition: border-color 0.2s;
}
.login-input:focus { border-color: rgba(255,255,255,0.3); }
.login-input.error { border-color: #ef4444; }
.login-error {
    font-size: 11px;
    color: #ef4444;
    margin-bottom: 14px;
    letter-spacing: 0.05em;
}
.login-btn {
    width: 100%;
    font-family: inherit;
    font-size: 12px;
    letter-spacing: 0.1em;
    padding: 13px;
    background: #fff;
    color: #0a0a0a;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: opacity 0.2s;
}
.login-btn:hover { opacity: 0.85; }

/* ─── Responsive ─── */
@media (max-width: 768px) {
    .admin-main { padding: 24px 16px; }
    .stats { grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .stat { padding: 16px; }
    .stat__value { font-size: 28px; }
    th, .td-inner { padding: 10px 12px; }
    .td-date, .td-name, .td-email { display: none; }
}
</style>
</head>
<body>

<?php if (!$loggedIn): ?>
<!-- ─── ログイン画面 ─── -->
<div class="login-wrap">
    <div class="login-box">
        <p class="login-logo"><span>nerdech</span>&nbsp;/ admin</p>
        <form method="post" autocomplete="off">
            <label class="login-label" for="pw">password</label>
            <?php if ($loginError): ?>
            <p class="login-error">パスワードが正しくありません</p>
            <?php endif; ?>
            <input class="login-input<?= $loginError ? ' error' : '' ?>"
                   type="password" id="pw" name="pw" placeholder="••••••••" autofocus>
            <button class="login-btn" type="submit">sign in →</button>
        </form>
    </div>
</div>

<?php else: ?>
<!-- ─── 管理画面 ─── -->
<header class="admin-header">
    <div class="admin-header__logo">
        nerdech&nbsp;/&nbsp;admin
        <?php if ($unread > 0): ?>
        <span class="admin-header__badge"><?= $unread ?> 未読</span>
        <?php endif; ?>
    </div>
    <a class="admin-header__logout" href="admin.php?logout=1">logout →</a>
</header>

<main class="admin-main">

    <div class="stats">
        <div class="stat">
            <p class="stat__label">total</p>
            <p class="stat__value"><?= $total ?></p>
        </div>
        <div class="stat">
            <p class="stat__label">unread</p>
            <p class="stat__value stat__value--blue"><?= $unread ?></p>
        </div>
        <div class="stat">
            <p class="stat__label">read</p>
            <p class="stat__value"><?= $total - $unread ?></p>
        </div>
    </div>

    <div class="table-wrap">
        <div class="table-header">
            <h2>inquiries</h2>
            <?php if ($unread > 0): ?>
            <a class="btn-readall" href="admin.php?readall=1">すべて既読にする</a>
            <?php endif; ?>
        </div>

        <?php if (empty($contacts)): ?>
        <p class="empty">お問い合わせはまだありません</p>
        <?php else: ?>
        <table>
            <thead>
                <tr>
                    <th class="td-status"></th>
                    <th class="td-date">date</th>
                    <th class="td-name">name</th>
                    <th class="td-email">email</th>
                    <th class="td-message">message</th>
                    <th class="td-actions">actions</th>
                </tr>
            </thead>
            <tbody>
            <?php foreach ($contacts as $c): ?>
            <tr class="<?= $c['read'] ? 'read' : 'unread' ?>">
                <td class="td-status">
                    <div class="td-inner">
                        <span class="status-dot <?= $c['read'] ? 'read' : 'unread' ?>"></span>
                    </div>
                </td>
                <td class="td-date">
                    <div class="td-inner"><?= htmlspecialchars($c['date']) ?></div>
                </td>
                <td class="td-name">
                    <div class="td-inner"><?= htmlspecialchars($c['name']) ?></div>
                </td>
                <td class="td-email">
                    <div class="td-inner">
                        <a href="mailto:<?= htmlspecialchars($c['email']) ?>">
                            <?= htmlspecialchars($c['email']) ?>
                        </a>
                    </div>
                </td>
                <td class="td-message">
                    <div class="td-inner" data-id="<?= htmlspecialchars($c['id']) ?>">
                        <p class="msg-preview"><?= nl2br(htmlspecialchars($c['message'])) ?></p>
                        <p class="msg-full"><?= nl2br(htmlspecialchars($c['message'])) ?></p>
                        <p class="msg-toggle">▼ 全文を見る</p>
                    </div>
                </td>
                <td class="td-actions">
                    <div class="td-inner">
                        <div class="actions">
                            <?php if (!$c['read']): ?>
                            <a class="btn-sm btn-read"
                               href="admin.php?read=<?= urlencode($c['id']) ?>">既読</a>
                            <?php endif; ?>
                            <a class="btn-sm btn-del"
                               href="admin.php?delete=<?= urlencode($c['id']) ?>"
                               onclick="return confirm('このお問い合わせを削除しますか？')">削除</a>
                        </div>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
        <?php endif; ?>
    </div>

</main>

<script>
document.querySelectorAll('.msg-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
        const wrap    = toggle.closest('[data-id]');
        const preview = wrap.querySelector('.msg-preview');
        const full    = wrap.querySelector('.msg-full');
        const isOpen  = full.style.display === 'block';
        preview.style.display = isOpen ? '' : 'none';
        full.style.display    = isOpen ? 'none' : 'block';
        toggle.textContent    = isOpen ? '▼ 全文を見る' : '▲ 閉じる';
    });
});
</script>

<?php endif; ?>
</body>
</html>
