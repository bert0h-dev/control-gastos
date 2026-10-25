// Servidor de producción: sirve la app compilada (dist/) y la API con SQLite.
// Uso: npm run build && npm start   (variables opcionales: PORT, HOST, GASTOS_DB)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { apiMiddleware, DB_PATH } from './api.js';

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';   // 0.0.0.0 para entrar desde el celular en la misma red
const DIST = join(import.meta.dirname, '..', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

const api = apiMiddleware();

async function serveStatic(req, res){
  // normalize evita salir de dist/ con rutas como /../../
  const path = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^([/\\])+/, '');
  let file = join(DIST, path || 'index.html');
  if (!file.startsWith(DIST)) { res.statusCode = 403; return res.end(); }
  try {
    const data = await readFile(file).catch(() => readFile(file = join(DIST, 'index.html')));
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    if (file.includes(`${join('dist', 'assets')}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(data);
  } catch {
    res.statusCode = 500;
    res.end('No se encontró dist/. Ejecuta primero: npm run build');
  }
}

createServer((req, res) => api(req, res, () => serveStatic(req, res))).listen(PORT, HOST, () => {
  console.log(`Control de Gastos en http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Base de datos: ${DB_PATH}`);
});
