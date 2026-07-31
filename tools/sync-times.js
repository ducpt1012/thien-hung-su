// Đo mốc bắt đầu (giây) của từng đoạn NGAY TRÊN FILE MP3 rồi ghi vào
// data/book.js (trường `t`), cho chế độ "vừa nghe vừa đọc".
//
// Vì sao cần: trước đây trang suy ra chỗ đang phát theo tỉ lệ ký tự. Giọng đọc
// nghỉ ~1 giây ở mỗi cuối câu, nên đoạn nhiều câu ngắn tốn nhiều thời gian hơn
// số ký tự của nó, và bản thu còn đọc cả DÒNG TIÊU ĐỀ ở đầu — tính theo tỉ lệ
// thì đoạn tô sáng lệch khỏi giọng đọc cả giây.
//
// Cách đo: mỗi cuối câu để lại một khoảng lặng nghe thấy được. Chạy
// ffmpeg silencedetect lấy toàn bộ khoảng lặng, rồi khớp dãy cuối-câu của bản
// đọc với dãy khoảng lặng đó bằng quy hoạch động (cho phép bỏ qua ở cả hai bên
// vì máy đọc đôi khi không nghỉ, hoặc nghỉ thêm giữa câu). Mốc nào khớp thì lấy
// đúng lúc giọng đọc cất tiếng lại; mốc nào không khớp thì nội suy theo ký tự
// giữa hai mốc chắc chắn hai bên.
//
// Chạy sau tools/build-audio.py (cần build/<id>.norm.txt và data/audio/<id>.mp3):
//     node tools/sync-times.js            # tất cả các bài
//     node tools/sync-times.js --only 001_daminh-pham-trong-kham
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BOOK = path.join(ROOT, 'data', 'book.js');
const BUILD = path.join(ROOT, 'build');
const AUDIO = path.join(ROOT, 'data', 'audio');

// Ngưỡng nhận khoảng lặng: -45 dB đủ thấp để không cắt nhầm chỗ giọng nhỏ,
// 0,25 s đủ ngắn để bắt được cả nhịp nghỉ ngắn giữa câu.
const NOISE_DB = -45;
const MIN_SILENCE = 0.25;
const PAUSE_GUESS = 0.9;   // ước lượng ban đầu độ dài một nhịp nghỉ cuối câu
const MAX_DRIFT = 8;       // lệch quá ngần này giây thì coi như không phải một mốc

const paras = s => s.split('\n').filter(x => x.trim());
// Cắt câu: dấu kết câu rồi tới khoảng trắng. Bản đọc đã nở hết viết tắt nên
// dấu chấm còn lại gần như đều là hết câu thật.
const sentences = s => s.split(/(?<=[.!?…])\s+/).map(x => x.trim()).filter(Boolean);

function run(cmd, args) {
  return new Promise((ok, no) => execFile(cmd, args, { maxBuffer: 64 << 20 },
    (err, stdout, stderr) => err && !stderr ? no(err) : ok(stdout + stderr)));
}

async function duration(file) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', file]);
  return parseFloat(out);
}

async function silences(file) {
  const out = await run('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-af',
    `silencedetect=noise=${NOISE_DB}dB:d=${MIN_SILENCE}`, '-f', 'null', '-']);
  const list = [];
  const re = /silence_start:\s*([\d.]+)[\s\S]*?silence_end:\s*([\d.]+)/g;
  for (let m; (m = re.exec(out));) list.push({ start: +m[1], end: +m[2] });
  return list;
}

/* Khớp dãy mốc dự đoán với dãy khoảng lặng đo được.
   Quy hoạch động trên lưới (mốc × khoảng lặng), đi theo thứ tự thời gian:
   khớp một cặp thì tốn đúng độ lệch giây, bỏ qua một bên thì tốn một khoản phạt.
   Trả về mảng cùng độ dài `pred`: chỉ số khoảng lặng đã khớp, hoặc -1. */
function align(pred, obs) {
  const K = pred.length, M = obs.length;
  const SKIP_PRED = 2.0, SKIP_OBS = 1.0;
  const INF = Infinity;
  // cost[i][j] = tổng phạt tối thiểu khi đã xử lý i mốc đầu và j khoảng lặng đầu
  const cost = Array.from({ length: K + 1 }, () => new Float64Array(M + 1).fill(INF));
  const from = Array.from({ length: K + 1 }, () => new Int8Array(M + 1));  // 1=khớp 2=bỏ mốc 3=bỏ lặng
  cost[0][0] = 0;
  for (let i = 0; i <= K; i++) for (let j = 0; j <= M; j++) {
    const c = cost[i][j];
    if (c === INF) continue;
    if (i < K && j < M) {
      const d = Math.abs(pred[i] - obs[j].mid);
      const v = c + (d > MAX_DRIFT ? MAX_DRIFT + SKIP_PRED + SKIP_OBS : d);
      if (v < cost[i + 1][j + 1]) { cost[i + 1][j + 1] = v; from[i + 1][j + 1] = 1 }
    }
    if (i < K && c + SKIP_PRED < cost[i + 1][j]) { cost[i + 1][j] = c + SKIP_PRED; from[i + 1][j] = 2 }
    if (j < M && c + SKIP_OBS < cost[i][j + 1]) { cost[i][j + 1] = c + SKIP_OBS; from[i][j + 1] = 3 }
  }
  const match = new Array(K).fill(-1);
  for (let i = K, j = M; i > 0 || j > 0;) {
    const f = from[i][j];
    if (f === 1) { match[i - 1] = j - 1; i--; j-- }
    else if (f === 2) i--;
    else j--;
  }
  return match;
}

/* Mốc bắt đầu từng đoạn của một bài.
   Trả về {t, matched, total, dur} khi đo được, hoặc {why} khi phải bỏ qua. */
async function times(id, bodyParas) {
  const normFile = path.join(BUILD, `${id}.norm.txt`);
  const mp3 = path.join(AUDIO, `${id}.mp3`);
  if (!fs.existsSync(normFile)) return { why: 'chưa có build/' + id + '.norm.txt' };
  if (!fs.existsSync(mp3)) return { why: 'chưa có data/audio/' + id + '.mp3' };

  const segs = paras(fs.readFileSync(normFile, 'utf8'));      // segs[0] = tiêu đề
  if (segs.length - 1 !== bodyParas)
    return { why: `lệch số đoạn: ${bodyParas} trên trang vs ${segs.length - 1} trong bản đọc` };

  // Chuỗi câu của cả bài, kèm đánh dấu câu nào là câu cuối của một đoạn.
  const units = [];
  segs.forEach((seg, si) => {
    const ss = sentences(seg);
    ss.forEach((s, k) => units.push({ len: s.length, seg: si, last: k === ss.length - 1 }));
  });

  const [dur, raw] = await Promise.all([duration(mp3), silences(mp3)]);
  // Bỏ khoảng lặng dính đầu/cuối file: đó là phần đệm của bản thu, không phải
  // nhịp nghỉ giữa hai câu, mà nhận nhầm thì đoạn cuối bị đẩy ra tận hết bài.
  const sil = raw.filter(s => s.start > 0.05 && s.end < dur - 0.2);
  sil.forEach(s => { s.mid = (s.start + s.end) / 2 });

  // Mốc dự đoán: sau mỗi câu (trừ câu cuối bài). Thời gian đọc ≈ ký tự × tốc độ
  // + số nhịp nghỉ × độ dài nghỉ; tách riêng hai phần thì mốc sát hơn nhiều so
  // với chia đều theo ký tự.
  const chars = units.reduce((a, u) => a + u.len, 0);
  const pauseLen = sil.length
    ? Math.min(1.4, Math.max(0.4, sil.map(s => s.end - s.start).sort((a, b) => a - b)[sil.length >> 1]))
    : PAUSE_GUESS;
  const rate = Math.max(0.001, (dur - (units.length - 1) * pauseLen) / chars);  // giây / ký tự
  const pred = [];
  let acc = 0;
  for (let i = 0; i < units.length - 1; i++) {
    acc += units[i].len * rate;
    pred.push(acc + pauseLen / 2);        // giữa nhịp nghỉ, để so với giữa khoảng lặng
    acc += pauseLen;
  }

  const match = align(pred, sil);

  // Mốc bắt đầu đoạn = lúc giọng cất tiếng lại sau nhịp nghỉ kết thúc đoạn trước.
  // Chỗ nào không khớp được khoảng lặng thì nội suy theo ký tự giữa hai mốc chắc chắn.
  const anchor = new Array(units.length - 1).fill(null);
  match.forEach((j, i) => { if (j >= 0) anchor[i] = sil[j].end });
  const charAt = [];                       // ký tự tích lũy tới từng mốc
  let c = 0;
  for (let i = 0; i < units.length - 1; i++) { c += units[i].len; charAt.push(c) }

  const known = [{ x: 0, t: 0 }];
  anchor.forEach((t, i) => { if (t !== null) known.push({ x: charAt[i], t }) });
  known.push({ x: chars, t: dur });
  const interp = x => {
    let k = 1;
    while (k < known.length - 1 && known[k].x < x) k++;
    const a = known[k - 1], b = known[k];
    return b.x === a.x ? a.t : a.t + (b.t - a.t) * (x - a.x) / (b.x - a.x);
  };

  const t = [];
  let matched = 0;
  for (let i = 0; i < units.length - 1; i++) {
    if (!units[i].last) continue;                       // chỉ lấy mốc cuối đoạn
    if (anchor[i] !== null) { t.push(anchor[i]); matched++ }
    else t.push(interp(charAt[i]));
  }
  if (t.length !== bodyParas) return { why: `đo ra ${t.length} mốc, cần ${bodyParas}` };

  // phải tăng dần và nằm gọn trong file
  for (let i = 0; i < t.length; i++) {
    if (!(t[i] >= 0) || t[i] >= dur)
      return { why: `mốc đoạn ${i + 1} = ${t[i]?.toFixed?.(2)}s nằm ngoài file dài ${dur.toFixed(1)}s` };
    if (i && t[i] <= t[i - 1])
      return { why: `mốc đoạn ${i + 1} (${t[i].toFixed(2)}s) không sau mốc đoạn ${i} (${t[i - 1].toFixed(2)}s)` };
  }
  return { t: t.map(x => Math.round(x * 100) / 100), matched, total: bodyParas, dur };
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i], i);
  }));
  return out;
}

async function main() {
  global.window = {};
  require(BOOK);
  const D = global.window.DATA;
  const only = process.argv.includes('--only')
    ? new Set(process.argv.slice(process.argv.indexOf('--only') + 1)) : null;
  const todo = D.filter(d => !only || only.has(d.id));

  const res = await pool(todo, Math.max(2, os.cpus().length - 2), async d => {
    try { return await times(d.id, paras(d.body).length) } catch (e) { return { why: String(e.message || e) } }
  });

  const skipped = [];
  let done = 0, matched = 0, marks = 0;
  res.forEach((r, i) => {
    if (r.why) { skipped.push(`${todo[i].id} — ${r.why}`); return }
    todo[i].t = r.t;
    done++; matched += r.matched; marks += r.total;
  });

  if (skipped.length) console.error(`bỏ qua ${skipped.length} bài:\n  ` + skipped.join('\n  '));
  if (!done) { console.error('không đo được bài nào — đã có build/*.norm.txt và data/audio/*.mp3 chưa?'); process.exit(1) }

  fs.writeFileSync(BOOK, `window.DATA=[\n${D.map(d => JSON.stringify(d)).join(',\n')}\n];\n`);
  console.log(`đã đo mốc thời gian cho ${done}/${D.length} bài — ` +
    `${(matched / marks * 100).toFixed(1)}% mốc bắt đúng khoảng lặng trong bản thu`);
  require('./split-book.js').build();
  console.log('đã tách lại data/catalog.js và data/text/');
}

if (require.main === module) main();

module.exports = { times, paras, silences, duration };
