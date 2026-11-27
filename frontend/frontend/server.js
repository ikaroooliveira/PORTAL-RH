// Servidor estático + proxy /api/* -> backend Java (evita CORS). Uso: node server.js  (BACKEND=http://localhost:8080 PORT=3000)
const http = require('http'), fs = require('fs'), path = require('path');
const BACKEND = new URL(process.env.BACKEND || 'http://localhost:8080'), PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const p = http.request({ host: BACKEND.hostname, port: BACKEND.port, path: req.url, method: req.method, headers: { ...req.headers, host: BACKEND.host } },
      (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on('error', () => { res.writeHead(502, { 'Content-Type': 'application/problem+json' }); res.end(JSON.stringify({ title: 'Backend indisponível', detail: `Sem resposta em ${BACKEND.origin}` })); });
    return req.pipe(p);
  }
  let f = path.join(__dirname, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(__dirname)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('Não encontrado'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT, () => console.log(`Portal em http://localhost:${PORT}  ->  API ${BACKEND.origin}/api`));
