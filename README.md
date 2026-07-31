# Thiên Hùng Sử — 117 Hiển Thánh Tử Đạo Việt Nam

Sách nói (audiobook) dựng từ bản PDF *Thiên Hùng Sử — 117 Hiển Thánh Tử Đạo Việt Nam*,
kèm trang đọc–nghe song song.

**Nghe trực tuyến:** https://ducpt1012.github.io/thien-hung-su/

## Nội dung

| Phần | Số bài |
|---|---|
| Dẫn nhập — Lời tựa, Tâm thư, Giải thích bức họa, Bài giảng Đức Giáo Hoàng Gioan Phaolô II | 4 |
| Hạnh tích các thánh, xếp theo tháng tử đạo | 105 |
| Phụ trương — lịch sử truyền giáo và 4 bài suy niệm | 5 |
| **Tổng** | **114 bài · 13 giờ 34 phút** |

Danh mục đầy đủ kèm thời lượng từng bài: [`docs/DANH-MUC.txt`](docs/DANH-MUC.txt)

## Trang web

- Danh mục bên trái gom theo tháng, có ô tìm tên thánh
- Nội dung sách bên phải, chỉnh cỡ chữ, tự đổi giao diện sáng/tối
- Trình phát: chỉnh tốc độ 0,75×–2× (giữ nguyên cao độ giọng), hết bài tự đọc tiếp bài sau,
  nhớ chỗ đang nghe; chọn bài không tự bật tiếng — chỉ đọc tiếp khi đang nghe dở
- **Vừa nghe vừa đọc**: tô sáng đoạn đang phát và tự cuộn theo, bám theo mốc thời gian
  đo sẵn của từng đoạn; kéo thanh chạy hoặc bấm vào một đoạn đều nhảy tới đúng chỗ
- Điện thoại: danh mục dạng ngăn kéo

Trang thuần HTML/CSS/JS, không framework. Mở trang chỉ tải danh mục
(`data/catalog.js`, ~4 KB nén) nên hiện ngay và bấm nghe được ngay; toàn văn bài
nào tải lẻ khi mở bài đó (`data/text/<id>.js`, trung vị 3,4 KB nén), hai bài kề
được kéo sẵn để bấm ‹ › là có chữ ngay. Mở thẳng `index.html` bằng trình duyệt
cũng chạy được: mọi dữ liệu nạp qua `<script src>` chứ không qua `fetch`, nên
không vướng CORS của `file://`. Ô tìm kiếm không cần gõ dấu: "le bao tinh" vẫn
thấy "Lê Bảo Tịnh".

`tools/serve.js` chỉ cần khi muốn chạy đúng như trên web — nó hỗ trợ HTTP Range
để tua audio, thứ mà `python3 -m http.server` không có. GitHub Pages và
Cloudflare Pages đã hỗ trợ sẵn.

## Cấu trúc

```
index.html                 khung HTML của trang
assets/
  app.css                  giao diện
  app.js                   danh mục, trình phát, chế độ vừa nghe vừa đọc
data/
  book.js                  toàn văn 114 bài + mốc thời gian từng đoạn (window.DATA, mỗi bài
                           một dòng) — NGUỒN SỰ THẬT, chỉ công cụ đọc; trang không tải file này
  catalog.js               danh mục (window.CATALOG) — sinh từ book.js, trang nạp lúc mở
  text/<id>.js             toàn văn một bài (window.BOOK[id]) — sinh từ book.js, nạp khi mở bài
  audio/*.mp3              114 file audio, tên file = trường `id` trong book.js
  tts-manifest.json        trạng thái lần dựng audio gần nhất
docs/DANH-MUC.txt          danh mục kèm thời lượng
tools/
  serve.js                 server tĩnh có HTTP Range, chỉ dùng khi chạy local
  check-data.js            kiểm tra dữ liệu khớp audio, danh mục và dữ liệu tách
  split-book.js            tách book.js thành catalog.js + text/*.js cho trang
  update-catalog.js        cập nhật thời lượng trong docs/DANH-MUC.txt
  sync-times.js            đo mốc thời gian từng đoạn ngay trên file mp3
  build-audio.py           dựng file mp3
  sync-weights.js          số liệu dự phòng cho bài chưa đo được mốc thời gian
.github/workflows/check.yml chạy `npm run check` mỗi lần push
_headers                   cache-control cho Cloudflare Pages
.nojekyll                  tắt Jekyll của GitHub Pages
```

Trang được xuất bản ngay từ gốc repo, nên `index.html`, `assets/`, `data/`,
`_headers` và `.nojekyll` buộc phải ở gốc: GitHub Pages chỉ cho chọn nguồn là
`/` hoặc `/docs`, còn `_headers` thì Cloudflare Pages chỉ đọc ở gốc thư mục xuất
bản — đặt vào thư mục con là mất tác dụng mà không báo lỗi. Vì không có bước
build nào, gốc repo cũng chính là thư mục xuất bản; chỉ phần công cụ và tài liệu
được đưa ra ngoài.

## Phát triển

```bash
npm start           # http://localhost:8080  (npm start -- 3000 để đổi cổng)
npm run check       # dữ liệu có khớp file audio và danh mục không
```

Thêm hay sửa một bài: sửa `data/book.js`, chạy `npm run build:text` (tách lại
`data/catalog.js` + `data/text/` cho trang), đặt file `<id>.mp3` vào `data/audio/`,
thêm mục tương ứng vào `docs/DANH-MUC.txt`, rồi chạy `npm run check` — bước check
sẽ báo nếu quên tách lại. Đổi phần chữ hay đổi file mp3 của một bài thì chạy thêm
`npm run sync-times` để đo lại mốc thời gian từng đoạn cho chế độ vừa nghe vừa đọc. Thứ tự bài trên trang theo đúng thứ tự trong
`data/book.js`; danh mục gom nhóm theo trường `section`. Không có dependency nào —
`package.json` chỉ để giữ mấy câu lệnh trên.

## Bản quyền

**Tiến Sĩ Trần An Bài** — Chủ tịch Cộng đồng Công Giáo Việt Nam

Copyright 1990 — All Rights Reserved.
Cộng đồng Công Giáo Việt Nam, San Jose, California, Hoa Kỳ. Giữ bản quyền.

> Mọi trích dịch, in lại, thâu âm, chụp hình dưới bất cứ hình thức nào, phải ghi rõ xuất xứ.

Bản PDF gốc: https://tusachthienglieng.files.wordpress.com/2018/06/thien-hung-su_dao_trung_hieu_edit1.pdf
