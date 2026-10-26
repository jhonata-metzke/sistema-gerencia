// Faz o papel do gateway do Supabase: remove o prefixo /rest/v1 e encaminha ao PostgREST (porta 3001).
const http = require('node:http')
http.createServer((req, res) => {
  const p = http.request({ host: 'localhost', port: 3001, method: req.method, path: req.url.replace(/^\/rest\/v1/, ''), headers: req.headers },
    (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res) })
  p.on('error', (e) => { res.writeHead(502); res.end(String(e)) })
  req.pipe(p)
}).listen(3000)
