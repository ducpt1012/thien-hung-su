// Trình đọc–nghe Thiên Hùng Sử. Dữ liệu bài đọc nạp từ data/book.js (window.DATA).
const D = window.DATA, $ = s => document.querySelector(s);
const AUDIO_DIR = 'data/audio/';
const toc = $('#toc'), read = $('#read'), au = $('#au'), now = $('#now'), err = $('#err');
const KEY = { i: 'ths-i', t: 'ths-t', fw: 'ths-fw', rate: 'ths-rate', fs: 'ths-fs' };

let cur = 0;
let items = [];          // các <button class="it"> đang hiển thị, theo thứ tự trong DOM
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* ---------- Danh mục ----------
   Dựng một lần rồi chỉ ẩn/hiện khi tìm kiếm, thay vì dựng lại 114 nút mỗi lần đổi bài. */
function buildToc() {
  let out = '', last = '';
  D.forEach((it, i) => {
    if (it.section !== last) { out += `<div class="grp" data-sec="${esc(it.section)}">${it.section}</div>`; last = it.section; }
    const n = it.id.slice(0, 4).replace(/^0+(?=\d)/, '');
    out += `<button class="it" data-i="${i}">` +
           `<span class="num">${/^\d+$/.test(n) ? n : '•'}</span>${esc(it.title)}` +
           (it.meta ? `<span class="d">${esc(it.meta)}</span>` : '') + `</button>`;
  });
  out += '<div class="grp" id="none" hidden>Không tìm thấy</div>';
  toc.innerHTML = out;
  items = [...toc.querySelectorAll('.it')];
  // chuỗi để lọc, tính sẵn một lần
  items.forEach((b, i) => { b._k = (D[i].title + ' ' + D[i].meta).toLowerCase(); });
}

function filterToc(filter = '') {
  const f = filter.trim().toLowerCase();
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
function show(i, autoplay) {
  cur = i;
  const it = D[i];
  const paras = it.body.split('\n').filter(s => s.trim())
    .map(s => `<p${s.length < 90 ? ' class="short"' : ''}>${esc(s)}</p>`).join('');
  read.innerHTML = `<article><h2>${esc(it.title)}</h2>` +
    `<div class="meta">${it.meta ? esc(it.meta) : ''}</div>` + paras + '</article>';
  read.scrollTop = 0;
  // đổi src thì phải load() lại, nếu không trình duyệt giữ nguồn cũ
  au.src = AUDIO_DIR + encodeURIComponent(it.id) + '.mp3';
  au.load();
  now.textContent = it.title;
  err.hidden = true;
  document.title = it.title + ' — Thiên Hùng Sử';
  if (autoplay) au.play().catch(() => {});
  markCurrent();
  localStorage.setItem(KEY.i, i);
  measure();
  closeSide();
}

const openSide = () => { $('#side').classList.add('open'); $('#veil').classList.add('on') };
const closeSide = () => { $('#side').classList.remove('open'); $('#veil').classList.remove('on') };

toc.onclick = e => { const b = e.target.closest('.it'); if (b) show(+b.dataset.i, true) };
$('#q').oninput = e => filterToc(e.target.value);
$('#menu').onclick = openSide;
$('#veil').onclick = closeSide;
$('#prev').onclick = () => show(Math.max(0, cur - 1), true);
$('#next').onclick = () => show(Math.min(D.length - 1, cur + 1), true);
au.onended = () => { if (cur < D.length - 1) show(cur + 1, true) };
au.onerror = () => {
  err.hidden = false;
  err.textContent = `Không mở được ${AUDIO_DIR}${D[cur].id}.mp3 — kiểm tra file audio có nằm trong thư mục đó không.`;
};

/* ----- Vừa nghe vừa đọc -----
   Không có timestamp thật cho từng đoạn, nên suy ra từ tỉ lệ ký tự: giọng đọc
   đều nhịp, nên vị trí trong bài ≈ số ký tự đã đọc / tổng ký tự. */
let paras = [], cums = [], total = 0, hlIdx = -1;

function measure() {
  paras = [...read.querySelectorAll('p')];
  cums = []; total = 0;
  paras.forEach(p => { total += p.textContent.length + 18; cums.push(total); }); // +18 ≈ quãng nghỉ giữa đoạn
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
