// Cập nhật thời lượng [mm:ss] trong docs/DANH-MUC.txt theo file mp3 thực tế,
// và in ra tổng thời lượng để sửa lại con số trong README.
//
// Chạy sau khi dựng lại audio:
//     node tools/update-catalog.js            # ghi lại danh mục
//     node tools/update-catalog.js --check    # chỉ báo chỗ lệch, không ghi
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CATALOG = path.join(ROOT, 'docs', 'DANH-MUC.txt');
const check = process.argv.includes('--check');

const dur = f => {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f,
  ], { encoding: 'utf8' });
  return parseFloat(out.trim());
};
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const lines = fs.readFileSync(CATALOG, 'utf8').split('\n');
let total = 0, changed = 0, missing = 0;

const out = lines.map(line => {
  // "data/audio/<id>.mp3   [mm:ss]"
  const m = line.match(/^(data\/audio\/(\S+\.mp3))(\s+)\[(\d+:\d{2})\]\s*$/);
  if (!m) return line;
  const [, rel, , gap, old] = m;
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { missing++; return line; }
  const now = mmss(dur(file));
  total += dur(file);
  if (now !== old) {
    changed++;
    if (check) console.log(`  ${rel}: ${old} -> ${now}`);
  }
  return `${rel}${gap}[${now}]`;
});

const h = Math.floor(total / 3600), mn = Math.round((total % 3600) / 60);
console.log(`${changed} bài lệch thời lượng, ${missing} bài thiếu file`);
console.log(`tổng: ${h} giờ ${mn} phút  (README ghi con số này)`);

if (check) process.exit(changed ? 1 : 0);
fs.writeFileSync(CATALOG, out.join('\n'));
console.log(`đã ghi lại ${path.relative(ROOT, CATALOG)}`);
