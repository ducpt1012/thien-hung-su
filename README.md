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

## Cấu trúc

```
index.html                 khung HTML của trang
assets/
  app.css                  giao diện
  app.js                   danh mục, trình phát, chế độ vừa nghe vừa đọc
data/
  book.js                  toàn văn 114 bài (window.DATA, mỗi bài một dòng)
  audio/*.mp3              114 file audio, tên file = trường `id` trong book.js
  tts-manifest.json        sha256 bản đọc đã tạo ra từng mp3, để dựng lại tăng dần
docs/DANH-MUC.txt          danh mục kèm thời lượng
tools/
  serve.js                 server tĩnh có HTTP Range, chỉ dùng khi chạy local
  check-data.js            kiểm tra dữ liệu khớp audio và danh mục
  build-audio.py           dựng lại mp3 từ book.js (chỉ bài đã đổi)
  sync-weights.js          ghi độ dài đoạn của bản đọc, cho chế độ vừa nghe vừa đọc
  update-catalog.js        cập nhật thời lượng trong docs/DANH-MUC.txt
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

Thêm hay sửa một bài: sửa `data/book.js`, đặt file `<id>.mp3` vào `data/audio/`,
thêm mục tương ứng vào `docs/DANH-MUC.txt`, rồi chạy `npm run check`. Thứ tự bài
trên trang theo đúng thứ tự trong `data/book.js`; danh mục gom nhóm theo trường
`section`. Trang web không có bước build và không có dependency nào —
`package.json` chỉ để giữ mấy câu lệnh trên.

## Dựng lại audio

Bản chữ và bản đọc **khác nhau có chủ ý**: trên trang giữ đúng chữ tác giả
(`Act 5,41`, `Lêô XIII`, `San Jose`), còn giọng đọc thì nở ra thành lời
(`Sách Công Vụ Tông Đồ, chương năm, câu bốn mươi mốt`, `Lê-ô thứ mười ba`,
`Xan Hô-xê`). Nếu đưa thẳng chữ trên trang vào máy đọc thì nó đọc sai viết tắt,
sai số La Mã và sai tên nước ngoài.

```
data/book.js  ──vi-normalize──>  build/<id>.norm.txt  ──edge-tts──>  data/audio/<id>.mp3
                                                       vi-VN-NamMinhNeural, rate -2%
                                                       ffmpeg -b:a 64k -ar 24000 -ac 1
```

```bash
python3 tools/build-audio.py --dry-run   # bài nào sẽ dựng lại
npm run build:audio                      # dựng những bài đã đổi
npm run sync-weights                     # cập nhật độ dài đoạn cho trang
npm run catalog                           # cập nhật thời lượng trong danh mục
npm run check && npm run check:catalog    # kiểm lại
```

`data/tts-manifest.json` giữ sha256 của bản đọc đã tạo ra từng mp3, nên sửa một
bài không phải render lại 13 tiếng audio. Cần `ffmpeg`, `edge-tts`, và hai skill
`vi-normalize` + `audiobook-studio` trong `~/.claude/skills/`.

Dựng cả 114 bài thì tốc độ nằm ở số kết nối `edge-tts` cùng lúc (một kết nối chỉ
nhanh hơn thời lượng thật khoảng 0,6×). `--max-inflight` chặn trần số request,
TÁCH RỜI khỏi số luồng `--jobs × --workers`, nên tăng `--jobs` chỉ làm đầy chỗ
trống — lúc vài bài đang ghép bằng ffmpeg thì bài khác giữ đường truyền — mà áp
lực lên endpoint vẫn đứng ở trần. Gọi hỏng thì tự nghỉ giãn dần có jitter.
Đo trên máy 12 lõi: trần 16 được ~2 bài/phút, trần 32 được ~5,7 bài/phút và vẫn
không bài nào phải dựng lại.

```bash
python3 tools/build-audio.py --jobs 24 --workers 3 --max-inflight 32
```

Bước chuẩn hóa chạy song song và được nhớ trong `build/norm-cache.json` (khóa
theo sha văn bản gốc), nên nó chỉ tốn thời gian đúng ở những bài vừa sửa.

Muốn sửa cách đọc một tên riêng thì thêm vào `lexicon/proper.tsv` (hoặc
`overrides.tsv` cho cụm nhiều chữ) của skill `vi-normalize`, chạy lại
`build-audio.py` — chỉ những bài có tên đó bị dựng lại.

## Trang web

- Danh mục bên trái gom theo tháng, có ô tìm tên thánh
- Nội dung sách bên phải, chỉnh cỡ chữ, tự đổi giao diện sáng/tối
- Trình phát: chỉnh tốc độ 0,75×–2× (giữ nguyên cao độ giọng), tự chuyển bài, nhớ chỗ đang nghe
- **Vừa nghe vừa đọc**: tô sáng đoạn đang phát và tự cuộn theo; kéo thanh chạy hoặc bấm vào một đoạn đều nhảy tới đúng chỗ
- Điện thoại: danh mục dạng ngăn kéo

Trang thuần HTML/CSS/JS, không framework, không bước build. Mở thẳng
`index.html` bằng trình duyệt cũng chạy được: toàn văn nạp qua `<script src>`
chứ không qua `fetch`, nên không vướng CORS của `file://`.

`tools/serve.js` chỉ cần khi muốn chạy đúng như trên web — nó hỗ trợ HTTP Range
để tua audio, thứ mà `python3 -m http.server` không có. GitHub Pages và
Cloudflare Pages đã hỗ trợ sẵn.

## Giọng đọc

Tổng hợp bằng `edge-tts`, giọng `vi-VN-NamMinhNeural`. Văn bản được chuẩn hóa trước
khi đọc: ngày tháng (`27.05.1900` → "ngày 27 tháng 5 năm 1900"), số La Mã tên Giáo
Hoàng (`Lêo XIII` → "Lê-ô thứ mười ba"), trích dẫn Kinh Thánh (`Mt 10,32` → "Tin Mừng
Thánh Mát-thêu, chương mười, câu ba mươi hai"), viết tắt (`tr. 440` → "trang số 440"),
cùng việc nối lại các câu bị PDF cắt ngang theo dòng và theo trang.

## Bản quyền

**Tiến Sĩ Trần An Bài** — Chủ tịch Cộng đồng Công Giáo Việt Nam

Copyright 1990 — All Rights Reserved.
Cộng đồng Công Giáo Việt Nam, San Jose, California, Hoa Kỳ. Giữ bản quyền.

> Mọi trích dịch, in lại, thâu âm, chụp hình dưới bất cứ hình thức nào, phải ghi rõ xuất xứ.

Bản PDF gốc: https://tusachthienglieng.files.wordpress.com/2018/06/thien-hung-su_dao_trung_hieu_edit1.pdf
