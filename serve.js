// Server tĩnh có hỗ trợ HTTP Range (bắt buộc để tua audio và để Safari chịu phát).
// Dùng:  node serve.js [cổng]     rồi mở http://localhost:8080
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = +process.argv[2] || 8080;
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(req.url.split('?')[0]) } catch { return res.writeHead(400).end() }
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);

  // chặn thoát ra ngoài thư mục gốc
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return res.writeHead(403).end();

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return res.writeHead(404).end('Not found');

    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m[1] ? +m[1] : 0;
      let end = m[2] ? +m[2] : st.size - 1;
      if (!m[1]) start = Math.max(0, st.size - +m[2]);   // dạng "bytes=-500"
      end = Math.min(end, st.size - 1);
      if (start > end) {
        return res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end();
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}  (Ctrl+C để dừng)`));
