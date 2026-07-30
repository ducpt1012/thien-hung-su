#!/usr/bin/env python3
"""Dựng lại file audio từ data/book.js, chỉ dựng những bài đã thay đổi.

Pipeline (đúng như bản audio gốc của repo):

    data/book.js  ->  vi-normalize  ->  edge-tts (vi-VN-NamMinhNeural, rate -2%)
                                    ->  ffmpeg -b:a 64k -ar 24000 -ac 1

Vì sao cần bước vi-normalize riêng: văn bản trong data/book.js là chữ để ĐỌC
BẰNG MẮT ("Act 5,41", "Lêô XIII", "San Jose"). Đưa thẳng vào edge-tts thì máy
đọc sai. Bước chuẩn hóa nở chúng thành lời đọc ("Sách Công Vụ Tông Đồ, chương
năm, câu bốn mươi mốt", "Lê-ô thứ mười ba", "Xan Hô-xê"), nên bản audio và bản
chữ trên trang KHÁC nhau một cách có chủ ý.

data/tts-manifest.json ghi sha256 của văn bản ĐÃ CHUẨN HÓA đã tạo ra từng file
mp3. Lần chạy sau chỉ dựng lại bài nào có hash khác — sửa một bài không phải
render lại 13 tiếng audio.

Cần: python3, ffmpeg, và hai skill đặt tại ~/.claude/skills/
  - vi-normalize      (chuẩn hóa văn bản)
  - audiobook-studio  (synth.py — gọi edge-tts rồi ghép/encode)
edge-tts phải nằm trong PATH (hoặc trong venv đang kích hoạt).

Tốc độ vs. giữ an toàn cho API: số request edge-tts cùng lúc bị chặn ở
`--max-inflight` (mặc định 12), TÁCH RỜI khỏi số luồng `--jobs × --workers`.
Nhờ đó tăng `--jobs` chỉ làm đầy chỗ trống (bài đang ghép ffmpeg thì bài khác
giữ đường truyền) mà không tăng áp lực lên endpoint. Gọi hỏng thì nghỉ giãn dần
có jitter trước khi thử lại. Bước chuẩn hóa chạy song song và được nhớ lại
trong build/norm-cache.json nên chỉ bài vừa sửa mới phải chuẩn hóa lại.

Dùng:
    python3 tools/build-audio.py --dry-run     # xem bài nào sẽ dựng lại
    python3 tools/build-audio.py               # dựng những bài đã đổi
    python3 tools/build-audio.py --only 000a_loi-tua 003_phanxico-federich-te
    python3 tools/build-audio.py --force       # dựng lại tất cả
    python3 tools/build-audio.py --jobs 12 --max-inflight 16   # đẩy nhanh hơn
"""
import argparse
import hashlib
import json
import os
import random
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOK = ROOT / "data" / "book.js"
AUDIO = ROOT / "data" / "audio"
MANIFEST = ROOT / "data" / "tts-manifest.json"
BUILD = ROOT / "build"
NORM_CACHE = BUILD / "norm-cache.json"

SKILLS = Path.home() / ".claude" / "skills"
NORMALIZE = SKILLS / "vi-normalize" / "scripts" / "normalize.py"
STUDIO = SKILLS / "audiobook-studio" / "scripts"

VOICE = "vi-VN-NamMinhNeural"
RATE = "-2%"

# Nghỉ bao lâu sau một lần gọi edge-tts hỏng (giây), nhân đôi theo số lần hỏng
# liên tiếp rồi chặn trần.
BACKOFF_BASE = 2.0
BACKOFF_MAX = 30.0


def load_book():
    """data/book.js là `window.DATA=[ {...},\\n{...} ];` — lấy phần mảng JSON."""
    text = BOOK.read_text(encoding="utf-8")
    return json.loads(text[text.index("[") : text.rindex("]") + 1])


def tts_text(chapter):
    return f"{chapter['title']}\n\n{chapter['body']}\n"


def normalize(raw: str, workdir: Path) -> str:
    """Chạy vi-normalize, trả về văn bản dùng cho edge-tts.

    `workdir` phải RIÊNG cho mỗi lần gọi: tên file bên trong là cố định
    (in.txt / out/in.norm.txt), dùng chung một thư mục thì các luồng ghi đè
    lên nhau và bài này nhận văn bản của bài kia.
    """
    workdir.mkdir(parents=True, exist_ok=True)
    src = workdir / "in.txt"
    src.write_text(raw, encoding="utf-8")
    out = workdir / "out"
    r = subprocess.run(
        [sys.executable, str(NORMALIZE), str(src), "--outdir", str(out)],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise RuntimeError(f"vi-normalize lỗi: {r.stderr.strip() or r.stdout.strip()}")
    return (out / "in.norm.txt").read_text(encoding="utf-8")


def probe(f: Path) -> float:
    """Thời lượng thật của file, 0 nếu ffprobe không đọc được."""
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(f)],
        capture_output=True, text=True,
    )
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


_SY = None
_SY_LOCK = threading.Lock()


def _studio():
    """Nạp synth.py của audiobook-studio một lần, an toàn khi gọi từ nhiều luồng."""
    global _SY
    with _SY_LOCK:
        if _SY is None:
            sys.path.insert(0, str(STUDIO))
            import synth as SY  # noqa: PLC0415 — chỉ nạp khi thật sự render
            _SY = SY
    return _SY


class _GatedSubprocess:
    """Bọc `subprocess` của synth.py: mọi lệnh edge-tts phải qua semaphore.

    `jobs × workers` là số LUỒNG, không phải số request an toàn. Mỗi lần gọi
    edge-tts là một kết nối tới endpoint miễn phí của Microsoft; mở quá nhiều
    cùng lúc thì nó không báo lỗi mà trả về audio cụt, và cái giá là dựng lại
    cả bài. Semaphore này chặn trần TỔNG số request đang bay, tách rời khỏi số
    luồng — nhờ vậy tăng `--jobs` để lấp chỗ trống (bài này đang chuẩn hóa hoặc
    đang ghép bằng ffmpeg thì bài khác giữ đường truyền) mà áp lực lên API
    không tăng theo.

    Chặn ở tầng subprocess, không phải ở `_synth_chunk`, để vòng "self-heal"
    tuần tự bên trong synth_text cũng bị tính vào trần — nếu không thì đúng lúc
    endpoint đang quá tải (lúc nhiều bài cùng hỏng) lô này lại vượt trần.
    ffprobe/ffmpeg chạy local nên cho đi thẳng, không chiếm chỗ.
    """

    def __init__(self, mod, gate: threading.Semaphore, edge: str):
        self._mod, self._gate, self._edge = mod, gate, edge
        self._lock = threading.Lock()
        self._misses = 0          # số lần hỏng liên tiếp, để giãn dần
        self.waited = 0.0         # tổng thời gian đã nghỉ, để báo cuối lô

    def __getattr__(self, name):  # PIPE, CalledProcessError, … dùng như cũ
        return getattr(self._mod, name)

    @staticmethod
    def _media(args):
        try:
            return Path(args[args.index("--write-media") + 1])
        except (ValueError, IndexError):
            return None

    def run(self, args, **kw):
        if not (isinstance(args, (list, tuple)) and args and args[0] == self._edge):
            return self._mod.run(args, **kw)

        with self._gate:
            r = self._mod.run(args, **kw)

        out = self._media(args)
        ok = r.returncode == 0 and out is not None and out.exists() and out.stat().st_size > 800
        with self._lock:
            if ok:
                self._misses = 0
                return r
            self._misses += 1
            nap = min(BACKOFF_MAX, BACKOFF_BASE * 2 ** (self._misses - 1))
            self.waited += nap
        # Nghỉ NGOÀI semaphore (chỗ trống nhường luồng khác) và ngoài lock.
        # Cần nghỉ vì cả `_synth_chunk` lẫn vòng self-heal của synth.py đều thử
        # lại NGAY ba lần liền; endpoint đang chặn thì thử ngay chỉ chắc chắn bị
        # chặn tiếp. Giãn ở đây làm mọi lớp thử lại tự dịu đi, không phải sửa skill.
        time.sleep(nap * random.uniform(0.5, 1.5))
        return r


def install_gate(limit: int) -> _GatedSubprocess:
    SY = _studio()
    shim = _GatedSubprocess(subprocess, threading.Semaphore(limit), SY.edge_bin())
    SY.subprocess = shim
    return shim


def synth(text: str, dest: Path, workers: int = 3, attempts: int = 3) -> float:
    """Render một bài, ghi vào chỗ tạm rồi mới thay file thật.

    edge-tts đôi khi trả về một chunk rỗng (nghẽn mạng / bị giới hạn tốc độ);
    lúc đó ffmpeg ghép sẽ chết. Ghi ra `.part` rồi kiểm bằng ffprobe trước khi
    thay vào data/audio/ để không bao giờ để lại file hỏng, và thử lại vài lần
    trước khi bỏ qua bài đó — một bài lỗi không được làm chết cả lô 114 bài.
    """
    SY = _studio()

    # phải giữ đuôi .mp3 để ffmpeg biết container, và đặt trong build/ để
    # data/audio/ không bao giờ lẫn file tạm (check-data.js sẽ báo là mp3 mồ côi)
    BUILD.mkdir(exist_ok=True)
    part = BUILD / f"{dest.stem}.part.mp3"
    # sàn thời lượng rất rộng, chỉ để bắt trường hợp audio bị cụt hẳn
    floor = len(text) / 40
    last = None
    for k in range(1, attempts + 1):
        try:
            SY.synth_text(text, str(part), voice=VOICE, rate=RATE, workers=workers)
            d = probe(part)
            if d >= floor:
                part.replace(dest)
                return d
            last = f"thời lượng {d:.1f}s < sàn {floor:.1f}s (audio bị cụt)"
        except Exception as e:  # noqa: BLE001 — lỗi nào cũng đáng thử lại
            last = str(e).splitlines()[-1][:160]
        part.unlink(missing_ok=True)
        if k < attempts:
            print(f"(thử lại {k}/{attempts - 1}: {last}) ", end="", flush=True)
    raise RuntimeError(last)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="chỉ báo bài nào sẽ dựng lại")
    ap.add_argument("--force", action="store_true", help="dựng lại tất cả, bỏ qua manifest")
    ap.add_argument("--only", nargs="+", metavar="ID", help="chỉ xử lý các id này")
    # Song song hai tầng. `--workers` chỉ chia được các chunk TRONG một bài, mà
    # synth.py cắt chunk ở 3500 ký tự nên một bài trung bình (~6600 ký tự) chỉ có
    # 2-3 chunk — đặt --workers 10 là vô ích, đo được đúng 3 luồng chạy. Muốn thật
    # sự nhanh thì phải render NHIỀU BÀI cùng lúc bằng `--jobs`.
    # Tổng số luồng edge-tts = jobs × workers; càng cao càng dễ bị giới hạn tốc độ
    # (chunk rỗng), nhưng mỗi chunk tự chữa 3 lần và cả bài được thử lại 3 lần.
    #
    # Trần request (`--max-inflight`) tách rời khỏi số luồng, nên `--jobs` giờ
    # là nút tăng ĐỘ LẤP CHỖ TRỐNG chứ không phải nút tăng áp lực API: đặt cao
    # thì lúc vài bài đang chuẩn hóa/ghép ffmpeg vẫn còn bài khác giữ đường
    # truyền, mà số request cùng lúc vẫn đứng ở trần.
    ap.add_argument("--workers", type=int, default=3, metavar="N",
                    help="số luồng chunk song song trong MỘT bài (mặc định 3)")
    ap.add_argument("--jobs", type=int, default=8, metavar="N",
                    help="số BÀI render song song (mặc định 8)")
    ap.add_argument("--max-inflight", type=int, default=12, metavar="N",
                    help="trần số request edge-tts cùng lúc (mặc định 12)")
    ap.add_argument("--norm-jobs", type=int, default=min(8, (os.cpu_count() or 4)),
                    metavar="N", help="số bài chuẩn hóa song song (chỉ tốn CPU)")
    a = ap.parse_args()

    for p in (NORMALIZE, STUDIO / "synth.py"):
        if not p.exists():
            sys.exit(f"thiếu {p} — cần cài skill tương ứng trong ~/.claude/skills/")

    book = load_book()
    if a.only:
        ids = set(a.only)
        book = [c for c in book if c["id"] in ids]
        missing = ids - {c["id"] for c in book}
        if missing:
            sys.exit("không có bài: " + ", ".join(sorted(missing)))

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    BUILD.mkdir(exist_ok=True)

    # ── chuẩn hóa: song song, và nhớ kết quả giữa các lần chạy ──────────────
    # Đây là 2-3 phút cố định của MỌI lần chạy, kể cả `--dry-run` hay khi chẳng
    # có bài nào cần dựng lại. Chỉ tốn CPU, không gọi API, nên cứ chạy nhiều lõi.
    # norm-cache.json ghi sha của văn bản GỐC đã sinh ra build/<id>.norm.txt,
    # nhờ đó lần sau chỉ chuẩn hóa lại đúng bài vừa sửa.
    cache = json.loads(NORM_CACHE.read_text(encoding="utf-8")) if NORM_CACHE.exists() else {}
    normed, reused = {}, 0
    t0 = time.monotonic()

    with tempfile.TemporaryDirectory(prefix="ths_norm_") as tmp:
        work = Path(tmp)

        def prep(ch):
            raw = tts_text(ch)
            raw_sha = hashlib.sha256(raw.encode("utf-8")).hexdigest()
            dst = BUILD / f"{ch['id']}.norm.txt"
            if cache.get(ch["id"]) == raw_sha and dst.exists():
                return ch["id"], raw, dst.read_text(encoding="utf-8"), raw_sha, True
            norm = normalize(raw, work / ch["id"])
            dst.write_text(norm, encoding="utf-8")
            return ch["id"], raw, norm, raw_sha, False

        with ThreadPoolExecutor(max_workers=max(1, a.norm_jobs)) as ex:
            for cid, raw, norm, raw_sha, hit in ex.map(prep, book):
                normed[cid] = (raw, norm)
                cache[cid] = raw_sha
                reused += hit

    NORM_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n",
                          encoding="utf-8")
    print(f"chuẩn hóa {len(book)} bài trong {time.monotonic() - t0:.0f}s "
          f"(dùng lại sẵn: {reused})")

    todo, fresh, adopted = [], 0, 0
    for ch in book:
        raw, norm = normed[ch["id"]]
        digest = hashlib.sha256(norm.encode("utf-8")).hexdigest()
        mp3 = AUDIO / f"{ch['id']}.mp3"
        recorded = manifest.get(ch["id"], {}).get("sha256")

        if a.force:
            todo.append((ch, norm, digest))
        elif recorded == digest and mp3.exists():
            fresh += 1
        elif recorded is None and mp3.exists() and norm == raw:
            # Bootstrap: chưa có manifest, nhưng chuẩn hóa không đổi gì so với
            # văn bản gốc — tức mp3 hiện có đã đúng, chỉ cần ghi nhận hash.
            manifest[ch["id"]] = {"sha256": digest, "voice": VOICE, "rate": RATE}
            adopted += 1
        else:
            todo.append((ch, norm, digest))

    print(f"đã đúng: {fresh}   nhận sẵn: {adopted}   cần dựng lại: {len(todo)}")
    for ch, _, _ in todo:
        print(f"  · {ch['id']}")
    if a.dry_run or not todo:
        if not a.dry_run:
            MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                                encoding="utf-8")
        return

    failed = []
    lock = threading.Lock()
    done = [0]
    gate = install_gate(a.max_inflight)
    t_render = time.monotonic()
    print(f"render {a.jobs} bài song song × {a.workers} luồng/bài "
          f"= {a.jobs * a.workers} luồng, chặn ở {a.max_inflight} request edge-tts cùng lúc")

    def render(item):
        ch, norm, digest = item
        dest = AUDIO / f"{ch['id']}.mp3"
        try:
            dur = synth(norm, dest, workers=a.workers)
        except Exception as e:  # noqa: BLE001
            with lock:
                done[0] += 1
                failed.append((ch["id"], str(e)))
                print(f"[{done[0]}/{len(todo)}] {ch['id']} … THẤT BẠI, giữ mp3 cũ ({e})")
            return
        with lock:
            done[0] += 1
            manifest[ch["id"]] = {
                "sha256": digest, "voice": VOICE, "rate": RATE, "duration": round(dur, 3),
            }
            # ghi manifest sau từng bài để bị ngắt giữa đường vẫn không mất công
            MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                                encoding="utf-8")
            print(f"[{done[0]}/{len(todo)}] {ch['id']} … {dur / 60:.1f} phút", flush=True)

    with ThreadPoolExecutor(max_workers=max(1, a.jobs)) as ex:
        list(ex.map(render, todo))

    print(f"xong {len(todo) - len(failed)}/{len(todo)} bài "
          f"trong {(time.monotonic() - t_render) / 60:.0f} phút"
          + (f", đã nghỉ {gate.waited / 60:.1f} phút vì API trả lỗi"
             if gate.waited else ", API không trả lỗi lần nào"))
    if failed:
        print(f"\n{len(failed)} bài THẤT BẠI (mp3 cũ còn nguyên, chạy lại để dựng tiếp):")
        for cid, err in failed:
            print(f"  · {cid}: {err}")
        sys.exit(1)


if __name__ == "__main__":
    main()
