// Sinh dữ liệu cho trang từ data/book.js (nguồn sự thật duy nhất):
//   data/catalog.js       window.CATALOG — id/title/section/meta, đủ để dựng danh mục
//   data/text/<id>.js     window.BOOK[id] — body + w của một bài, nạp khi mở bài đó
//
// Vì sao tách: book.js nặng ~1 MB (330 KB nén) mà lúc mở trang chỉ cần danh mục
// (~2% dữ liệu). Tách ra thì trang hiện ngay và bấm nghe được ngay, toàn văn
// bài nào tải lẻ khi mở bài đó (~3 KB nén).
//
// Chạy sau mỗi lần sửa data/book.js:   npm run build:text
// (tools/sync-weights.js tự chạy lại bước này sau khi ghi book.js)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BOOK = path.join(ROOT, 'data', 'book.js');
const CATALOG = path.join(ROOT, 'data', 'catalog.js');
const TEXT_DIR = path.join(ROOT, 'data', 'text');

function readBook() {
  const s = fs.readFileSync(BOOK, 'utf8');
  const m = /^window\.DATA\s*=\s*/.exec(s);
  if (!m) throw new Error('data/book.js không bắt đầu bằng "window.DATA="');
  return JSON.parse(s.slice(m[0].length).replace(/;\s*$/, ''));
}

// Nội dung mong muốn của mọi file sinh ra, tính từ book.js
function render(D) {
  const catalog = 'window.CATALOG=[\n' +
    D.map(({ id, title, section, meta }) =>
      JSON.stringify({ id, title, section, meta })).join(',\n') +
    '\n];\n';
  const texts = new Map(D.map(d => [
    d.id + '.js',
    `(window.BOOK||(window.BOOK={}))[${JSON.stringify(d.id)}]=` +
      JSON.stringify(d.w === undefined ? { body: d.body } : { body: d.body, w: d.w }) +
      ';\n',
  ]));
  return { catalog, texts };
}

// Danh sách chỗ lệch giữa file trên đĩa và book.js; rỗng nghĩa là đã đồng bộ.
// check-data.js dùng hàm này để CI bắt lỗi quên chạy build:text.
function diff() {
  const { catalog, texts } = render(readBook());
  const out = [];
  const read = f => { try { return fs.readFileSync(f, 'utf8') } catch { return null } };
  if (read(CATALOG) !== catalog) out.push('data/catalog.js');
  for (const [name, want] of texts)
    if (read(path.join(TEXT_DIR, name)) !== want) out.push('data/text/' + name);
  const onDisk = fs.existsSync(TEXT_DIR) ? fs.readdirSync(TEXT_DIR) : [];
  for (const f of onDisk)
    if (!texts.has(f)) out.push(`data/text/${f} (thừa — bài không còn trong book.js)`);
  return out;
}

function build() {
  const { catalog, texts } = render(readBook());
  fs.mkdirSync(TEXT_DIR, { recursive: true });
  fs.writeFileSync(CATALOG, catalog);
  for (const [name, content] of texts)
    fs.writeFileSync(path.join(TEXT_DIR, name), content);
  for (const f of fs.readdirSync(TEXT_DIR))
    if (!texts.has(f)) fs.unlinkSync(path.join(TEXT_DIR, f));
  return texts.size;
}

if (require.main === module) {
  if (process.argv.includes('--check')) {
    const stale = diff();
    if (stale.length) {
      console.error('✗ lệch so với data/book.js:\n  ' + stale.join('\n  ') +
        '\n  → chạy: npm run build:text');
      process.exit(1);
    }
    console.log('✓ data/catalog.js và data/text/ khớp data/book.js');
  } else {
    const n = build();
    console.log(`đã sinh data/catalog.js và ${n} file data/text/*.js từ data/book.js`);
  }
}

module.exports = { readBook, diff, build };
