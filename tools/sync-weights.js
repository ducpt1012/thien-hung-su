// Ghi vào data/book.js độ dài từng đoạn của BẢN ĐỌC (build/<id>.norm.txt),
// dùng cho chế độ "vừa nghe vừa đọc".
//
// Vì sao cần: app.js suy ra chỗ đang phát từ tỉ lệ ký tự đã đọc / tổng ký tự.
// Bản đọc dài hơn bản hiện trên trang khá nhiều ("1790" -> "một nghìn bảy trăm
// chín mươi", "Act 5,41" -> "Sách Công Vụ Tông Đồ, chương năm, câu bốn mươi
// mốt"), nên nếu tính theo ký tự HIỆN TRÊN TRANG thì đoạn được tô sáng sẽ lệch
// dần so với giọng đọc — đoạn nào nhiều số/nhiều trích dẫn càng lệch.
//
// Chạy SAU tools/build-audio.py (cần build/<id>.norm.txt):
//     node tools/sync-weights.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BOOK = path.join(ROOT, 'data', 'book.js');
const BUILD = path.join(ROOT, 'build');

global.window = {};
require(BOOK);
const D = global.window.DATA;

const paras = s => s.split('\n').filter(x => x.trim());

let done = 0;
const skipped = [];
for (const d of D) {
  const f = path.join(BUILD, `${d.id}.norm.txt`);
  if (!fs.existsSync(f)) { skipped.push(d.id); continue; }
  // .norm.txt = dòng tiêu đề, dòng trắng, rồi các đoạn — bỏ dòng tiêu đề
  const normParas = paras(fs.readFileSync(f, 'utf8')).slice(1);
  const shown = paras(d.body);
  if (normParas.length !== shown.length) {
    skipped.push(`${d.id} (lệch số đoạn: ${shown.length} vs ${normParas.length})`);
    continue;
  }
  d.w = normParas.map(p => p.length);
  done++;
}

if (skipped.length) {
  console.error(`bỏ qua ${skipped.length} bài:\n  ` + skipped.join('\n  '));
}
if (!done) {
  console.error('không ghi được bài nào — đã chạy tools/build-audio.py chưa?');
  process.exit(1);
}

// giữ nguyên định dạng một bài một dòng
const body = D.map(d => JSON.stringify(d)).join(',\n');
fs.writeFileSync(BOOK, `window.DATA=[\n${body}\n];\n`);
console.log(`đã ghi độ dài đoạn cho ${done}/${D.length} bài`);
