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
| **Tổng** | **114 bài · 13 giờ 37 phút** |

Danh mục đầy đủ kèm thời lượng từng bài: [`00-DANH-MUC.txt`](00-DANH-MUC.txt)

## Trang web

- Danh mục bên trái gom theo tháng, có ô tìm tên thánh
- Nội dung sách bên phải, chỉnh cỡ chữ, tự đổi giao diện sáng/tối
- Trình phát: chỉnh tốc độ 0,75×–2× (giữ nguyên cao độ giọng), tự chuyển bài, nhớ chỗ đang nghe
- **Vừa nghe vừa đọc**: tô sáng đoạn đang phát và tự cuộn theo; kéo thanh chạy hoặc bấm vào một đoạn đều nhảy tới đúng chỗ
- Điện thoại: danh mục dạng ngăn kéo

Trang thuần HTML/CSS/JS, không cần máy chủ. Chạy thử tại máy:

```bash
node serve.js       # http://localhost:8080
```

(`serve.js` chỉ cần cho việc chạy local — nó hỗ trợ HTTP Range để tua audio,
thứ mà `python3 -m http.server` không có. GitHub Pages đã hỗ trợ sẵn.)

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
