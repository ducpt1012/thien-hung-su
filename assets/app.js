// Trình đọc–nghe Thiên Hùng Sử.
// Danh mục nạp sẵn từ data/catalog.js (window.CATALOG — nhỏ, có ngay lúc mở trang);
// toàn văn từng bài nằm ở data/text/<id>.js, chỉ nạp khi mở bài đó (window.BOOK[id]).
// Nạp bằng <script> chứ không fetch, để mở thẳng index.html qua file:// vẫn chạy.
const D = window.CATALOG, $ = s => document.querySelector(s);
const AUDIO_DIR = 'data/audio/';
const TEXT_DIR = 'data/text/';
const toc = $('#toc'), read = $('#read'), au = $('#au'), now = $('#now'), err = $('#err');
const KEY = { i: 'ths-i', t: 'ths-t', fw: 'ths-fw', rate: 'ths-rate', fs: 'ths-fs' };

let cur = 0;
let items = [];          // các <button class="it"> đang hiển thị, theo thứ tự trong DOM
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
// bỏ dấu để gõ "le bao tinh" vẫn tìm thấy "Lê Bảo Tịnh"
const fold = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

/* ---------- Toàn văn, nạp lười ---------- */
window.BOOK = window.BOOK || {};
const loading = {};      // id -> Promise, để không chèn hai <script> cho cùng một bài
function loadText(id) {
  if (window.BOOK[id]) return Promise.resolve(window.BOOK[id]);
  return loading[id] = loading[id] || new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = TEXT_DIR + encodeURIComponent(id) + '.js';
    // hỏng thì dọn sạch để lần mở lại bài còn thử tải được — kể cả khi server
    // trả 200 nhưng không phải file dữ liệu (deploy dở dang, trang lỗi của proxy)
    const bad = () => { delete loading[id]; s.remove(); no(id) };
    s.onload = () => window.BOOK[id] ? ok(window.BOOK[id]) : bad();
    s.onerror = bad;
    document.head.appendChild(s);
  });
}
const idle = window.requestIdleCallback || (f => setTimeout(f, 300));
// kéo sẵn bài kề để bấm ‹ › hay hết bài tự chuyển là có chữ ngay
const prefetch = () => { for (const j of [cur + 1, cur - 1]) if (D[j]) loadText(D[j].id).catch(() => {}) };

/* ---------- Danh mục ----------
   Dựng một lần rồi chỉ ẩn/hiện khi tìm kiếm, thay vì dựng lại 114 nút mỗi lần đổi bài. */
function buildToc() {
  let out = '', last = '';
  D.forEach((it, i) => {
    if (it.section !== last) { out += `<div class="grp" data-sec="${esc(it.section)}">${esc(it.section)}</div>`; last = it.section; }
    const n = it.id.slice(0, 4).replace(/^0+(?=\d)/, '');
    out += `<button class="it" data-i="${i}">` +
           `<span class="num">${/^\d+$/.test(n) ? n : '•'}</span>${esc(it.title)}` +
           (it.meta ? `<span class="d">${esc(it.meta)}</span>` : '') + `</button>`;
  });
  out += '<div class="grp" id="none" hidden>Không tìm thấy</div>';
  toc.innerHTML = out;
  items = [...toc.querySelectorAll('.it')];
  // chuỗi để lọc (đã bỏ dấu), tính sẵn một lần
  items.forEach((b, i) => { b._k = fold(D[i].title + ' ' + D[i].meta); });
}

function filterToc(filter = '') {
  const f = fold(filter.trim());
  let shown = 0;
  items.forEach(b => {
    const hit = !f || b._k.includes(f);
    b.hidden = !hit;
    if (hit) shown++;
  });
  // ẩn tiêu đề tháng nếu tháng đó không còn bài nào
  toc.querySelectorAll('.grp[data-sec]').forEach(g => {
    let any = false;
    for (let n = g.nextElementSibling; n && !n.dataset.sec; n = n.nextElementSibling)
      if (n.classList.contains('it') && !n.hidden) { any = true; break; }
    g.hidden = !any;
  });
  $('#none').hidden = shown > 0;
}

function markCurrent() {
  toc.querySelector('.it.on')?.classList.remove('on');
  const b = items[cur];
  if (b) { b.classList.add('on'); b.scrollIntoView({ block: 'nearest' }); }
}

/* ---------- Bài đọc ---------- */
const bodyHtml = body => body.split('\n').filter(s => s.trim())
  .map(s => `<p${s.length < 90 ? ' class="short"' : ''}>${esc(s)}</p>`).join('');

let seq = 0;             // chuyển bài trong lúc toàn văn đang tải thì bỏ kết quả cũ
async function show(i, autoplay) {
  cur = i;
  const it = D[i], my = ++seq;
  // audio phát ngay, không chờ toàn văn; đổi src thì phải load() lại,
  // nếu không trình duyệt giữ nguồn cũ
  au.src = AUDIO_DIR + encodeURIComponent(it.id) + '.mp3';
  au.load();
  if (autoplay) au.play().catch(() => {});
  now.textContent = it.title;
  err.hidden = true;
  document.title = it.title + ' — Thiên Hùng Sử';
  markCurrent();
  localStorage.setItem(KEY.i, i);
  closeSide();
  read.innerHTML = `<article><h2>${esc(it.title)}</h2>` +
    `<div class="meta">${it.meta ? esc(it.meta) : ''}</div></article>`;
  read.scrollTop = 0;
  paras = []; cums = []; total = 0; hlIdx = -1;
  let t;
  try { t = await loadText(it.id) }
  catch {
    if (my === seq) read.querySelector('article').insertAdjacentHTML('beforeend',
      `<div class="meta">Không tải được toàn văn (${TEXT_DIR}${it.id}.js) — vẫn nghe được audio.</div>`);
    return;
  }
  if (my !== seq) return;
  read.querySelector('article').insertAdjacentHTML('beforeend', bodyHtml(t.body));
  measure();
  sync(true);
  idle(prefetch);
}

const openSide = () => { $('#side').classList.add('open'); $('#veil').classList.add('on') };
const closeSide = () => { $('#side').classList.remove('open'); $('#veil').classList.remove('on') };

// Không tự bật tiếng: chọn bài chỉ phát tiếp nếu đang nghe dở, còn đang im lặng
// thì chờ người dùng bấm play. Hết bài thì vẫn tự chuyển và đọc tiếp (au.onended).
const playing = () => !au.paused && !au.ended;
toc.onclick = e => { const b = e.target.closest('.it'); if (b) show(+b.dataset.i, playing()) };
$('#q').oninput = e => filterToc(e.target.value);
$('#menu').onclick = openSide;
$('#veil').onclick = closeSide;
$('#prev').onclick = () => show(Math.max(0, cur - 1), playing());
$('#next').onclick = () => show(Math.min(D.length - 1, cur + 1), playing());
au.onended = () => { if (cur < D.length - 1) show(cur + 1, true) };
au.onerror = () => {
  if (!au.src) return;
  err.hidden = false;
  err.textContent = `Không mở được ${AUDIO_DIR}${D[cur].id}.mp3 — kiểm tra file audio có nằm trong thư mục đó không.`;
};

/* ----- Vừa nghe vừa đọc -----
   Không có timestamp thật cho từng đoạn, nên suy ra từ tỉ lệ ký tự: giọng đọc
   đều nhịp, nên vị trí trong bài ≈ số ký tự đã đọc / tổng ký tự. */
let paras = [], cums = [], total = 0, hlIdx = -1;

function measure() {
  paras = [...read.querySelectorAll('p')];
  // `w` là độ dài từng đoạn của BẢN ĐỌC (do tools/sync-weights.js ghi vào).
  // Bản đọc dài hơn bản hiện trên trang ("1790" đọc thành "một nghìn bảy trăm
  // chín mươi"), nên đo theo nó thì đoạn tô sáng mới bám đúng giọng đọc; không
  // có thì tạm đo theo chữ hiện trên trang.
  const w = window.BOOK[D[cur].id]?.w;
  cums = []; total = 0;
  paras.forEach((p, i) => {
    total += (w?.[i] ?? p.textContent.length) + 18;  // +18 ≈ quãng nghỉ giữa đoạn
    cums.push(total);
  });
  hlIdx = -1;
}

function sync(jump) {
  if (!document.body.classList.contains('fw') || !au.duration || !paras.length) return;
  const target = au.currentTime / au.duration * total;
  let i = cums.findIndex(c => c > target);
  if (i < 0) i = paras.length - 1;
  if (i === hlIdx && !jump) return;
  paras[hlIdx]?.classList.remove('hl');
  paras[i].classList.add('hl');
  hlIdx = i;
  const r = paras[i].getBoundingClientRect(), box = read.getBoundingClientRect();
  // khi người dùng kéo thanh chạy thì nhảy thẳng tới đoạn, không cuộn mượt
  if (jump || r.top < box.top + 40 || r.bottom > box.bottom - 40)
    paras[i].scrollIntoView({ block: 'center', behavior: jump ? 'auto' : 'smooth' });
}

// timeupdate chạy ~4 lần/giây; chỉ ghi localStorage khi số giây thay đổi
let lastSec = -1;
au.ontimeupdate = () => {
  const s = au.currentTime | 0;
  if (s !== lastSec) { lastSec = s; localStorage.setItem(KEY.t, s) }
  sync();
};
// kéo thanh chạy: bám theo ngay cả khi đang tạm dừng
au.onseeking = () => sync(true);
au.onseeked = () => sync(true);

$('#fw').onchange = e => {
  document.body.classList.toggle('fw', e.target.checked);
  localStorage.setItem(KEY.fw, e.target.checked ? '1' : '');
  if (e.target.checked) { measure(); sync(true) }
  else { paras[hlIdx]?.classList.remove('hl'); hlIdx = -1 }
};
$('#fw').checked = !!localStorage.getItem(KEY.fw);
document.body.classList.toggle('fw', $('#fw').checked);

// bấm vào một đoạn để nhảy audio tới đúng chỗ đó
read.onclick = e => {
  const p = e.target.closest('p');
  if (!p || !document.body.classList.contains('fw') || !au.duration) return;
  const i = paras.indexOf(p);
  if (i < 0) return;
  au.currentTime = (i ? cums[i - 1] : 0) / total * au.duration;
  if (au.paused) au.play().catch(() => {});
};

// tốc độ đọc — giữ nguyên qua các bài và các lần mở lại
const rate = $('#rate');
rate.value = localStorage.getItem(KEY.rate) || '1';
const applyRate = () => {
  au.playbackRate = +rate.value;
  au.preservesPitch = au.webkitPreservesPitch = true;   // giữ cao độ giọng khi tăng tốc
};
rate.onchange = () => { applyRate(); localStorage.setItem(KEY.rate, rate.value) };
au.onloadedmetadata = applyRate;
applyRate();

let fs = +(localStorage.getItem(KEY.fs) || 17.5);
const setfs = v => {
  fs = Math.min(24, Math.max(14, v));
  document.documentElement.style.setProperty('--fs', fs + 'px');
  localStorage.setItem(KEY.fs, fs);
};
$('#big').onclick = () => setfs(fs + 1);
$('#small').onclick = () => setfs(fs - 1);
setfs(fs);

document.onkeydown = e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight') $('#next').click();
  if (e.key === 'ArrowLeft') $('#prev').click();
  if (e.key === ' ') { e.preventDefault(); au.paused ? au.play() : au.pause() }
};

buildToc();
show(Math.min(D.length - 1, Math.max(0, +(localStorage.getItem(KEY.i) || 0))), false);
const t = +(localStorage.getItem(KEY.t) || 0);
if (t) au.addEventListener('loadedmetadata', () => { au.currentTime = t }, { once: true });
