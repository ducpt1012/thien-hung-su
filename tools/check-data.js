// Kiểm tra dữ liệu sách khớp với file audio và với danh mục.
// Dùng:  npm run check     (thoát mã 1 nếu có lỗi)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AUDIO_DIR = path.join(ROOT, 'data', 'audio');
const CATALOG = path.join(ROOT, 'docs', 'DANH-MUC.txt');

const errors = [];
const warns = [];
const fail = m => errors.push(m);
const warn = m => warns.push(m);

// data/book.js gán window.DATA, nên cần một window giả để nạp bằng require
global.window = {};
require(path.join(ROOT, 'data', 'book.js'));
const D = global.window.DATA;

if (!Array.isArray(D) || !D.length) {
  console.error('✗ data/book.js không gán window.DATA thành một mảng không rỗng');
  process.exit(1);
}

// ---- từng bài ----
const seen = new Set();
D.forEach((it, i) => {
  const at = `data/book.js bài #${i} (${it.id || 'thiếu id'})`;
  for (const k of ['id', 'title', 'section', 'meta', 'body'])
    if (!(k in it)) fail(`${at}: thiếu trường "${k}"`);
  if (!it.id || !/^[0-9a-z_-]+$/.test(it.id)) fail(`${at}: id phải là chữ thường/số/_/- để dùng làm tên file`);
  if (seen.has(it.id)) fail(`${at}: id trùng`);
  seen.add(it.id);
  if (!it.title?.trim()) fail(`${at}: title rỗng`);
  if (!it.body?.trim()) fail(`${at}: body rỗng`);
  if (!it.body?.split('\n').some(s => s.trim())) fail(`${at}: body không có đoạn nào`);
});

// ---- audio ----
const mp3 = fs.existsSync(AUDIO_DIR)
  ? fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.mp3'))
  : (fail('không thấy thư mục data/audio'), []);
const stems = new Set(mp3.map(f => f.slice(0, -4)));

for (const it of D)
  if (it.id && !stems.has(it.id)) fail(`thiếu data/audio/${it.id}.mp3 cho bài "${it.title}"`);
for (const s of stems)
  if (!seen.has(s)) fail(`data/audio/${s}.mp3 không có bài nào trong data/book.js dùng tới`);
for (const f of mp3) {
  const size = fs.statSync(path.join(AUDIO_DIR, f)).size;
  if (size === 0) fail(`data/audio/${f} rỗng`);
  // Cloudflare Pages chặn file trên 25 MiB
  else if (size > 25 * 1024 * 1024) fail(`data/audio/${f} nặng ${(size / 1048576).toFixed(1)} MiB, vượt giới hạn 25 MiB của Cloudflare Pages`);
}

// ---- danh mục ----
if (!fs.existsSync(CATALOG)) warn('không thấy docs/DANH-MUC.txt');
else {
  const txt = fs.readFileSync(CATALOG, 'utf8');
  const listed = new Set([...txt.matchAll(/^data\/audio\/(\S+)\.mp3/gm)].map(m => m[1]));
  for (const it of D)
    if (it.id && !listed.has(it.id)) warn(`docs/DANH-MUC.txt chưa có mục cho ${it.id}`);
  for (const s of listed)
    if (!seen.has(s)) warn(`docs/DANH-MUC.txt còn nhắc ${s}.mp3 nhưng bài đó không còn`);
}

// ---- dữ liệu tách cho trang (catalog + toàn văn từng bài) phải khớp book.js ----
const stale = require('./split-book.js').diff();
if (stale.length)
  fail(`data/catalog.js và data/text/ lệch so với data/book.js (${stale.length} file) — chạy: npm run build:text`);

// ---- các file bắt buộc ở gốc để deploy chạy được ----
for (const f of ['index.html', '.nojekyll', '_headers', 'assets/app.css', 'assets/app.js', 'data/catalog.js'])
  if (!fs.existsSync(path.join(ROOT, f))) fail(`thiếu ${f}`);

const html = fs.existsSync(path.join(ROOT, 'index.html'))
  ? fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') : '';
for (const src of ['assets/app.css', 'data/catalog.js', 'assets/app.js'])
  if (html && !html.includes(src)) fail(`index.html không tham chiếu ${src}`);

// ---- báo cáo ----
warns.forEach(w => console.warn('⚠ ' + w));
errors.forEach(e => console.error('✗ ' + e));
if (errors.length) {
  console.error(`\n${errors.length} lỗi.`);
  process.exit(1);
}
const secs = new Set(D.map(d => d.section));
console.log(`✓ ${D.length} bài, ${mp3.length} file audio, ${secs.size} phần — khớp` +
  (warns.length ? ` (${warns.length} cảnh báo)` : ''));
