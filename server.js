// Form Filler local server: serves the app, the PDF forms, and stores layouts on this computer only.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { lookupPolicy, POLICY_FILE } from './policy-lookup.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FORMS = path.join(ROOT, 'Forms');
const LAYOUTS = path.join(ROOT, 'layouts');
const PORT = Number(process.env.PORT) || 3456;

fs.mkdirSync(LAYOUTS, { recursive: true });

// Folder name -> category shown in the app (in this order).
const CATEGORIES = [
  ['NEW BUSINESS', 'New Business'],
  ['CUSTOMER SERVICE', 'Customer Service'],
  ['CLAIM', 'Claim'],
  ['GENERALI', 'Generali'],
  ['GROUP', 'Group Insurance'],
];

const STATIC = {
  '/': 'public/index.html',
  '/lib/pdf.mjs': 'node_modules/pdfjs-dist/build/pdf.min.mjs',
  '/lib/pdf.worker.mjs': 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  '/lib/pdf-lib.esm.js': 'node_modules/pdf-lib/dist/pdf-lib.esm.min.js',
};
// Text recognition (OCR) runs in the browser from these local files, so uploaded documents never leave this computer.
const STATIC_DIRS = {
  '/lib/ocr/': 'node_modules/tesseract.js/dist',
  '/lib/ocr-core/': 'node_modules/tesseract.js-core',
  '/lib/ocr-lang/': 'node_modules/@tesseract.js-data/eng/4.0.0_best_int',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.pdf': 'application/pdf', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.gz': 'application/gzip' };

// Keep every path inside its folder.
function inside(base, rel) {
  const p = path.resolve(base, rel);
  return p.startsWith(path.resolve(base) + path.sep) ? p : null;
}
const layoutFile = id => path.join(LAYOUTS, id.replace(/[^\w\- ()&.]+/g, '_') + '.json');

function listForms() {
  const known = new Set(CATEGORIES.map(c => c[0]));
  const extra = fs.existsSync(FORMS) ? fs.readdirSync(FORMS).filter(d => !known.has(d) && fs.statSync(path.join(FORMS, d)).isDirectory()) : [];
  return [...CATEGORIES, ...extra.map(d => [d, d])].map(([folder, label]) => {
    const dir = path.join(FORMS, folder);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf')).sort() : [];
    return {
      folder, label,
      forms: files.map(f => {
        const id = `${folder}__${f.replace(/\.pdf$/i, '')}`;
        return { id, file: `${folder}/${f}`, name: f.replace(/\.pdf$/i, ''), hasLayout: fs.existsSync(layoutFile(id)) };
      }),
    };
  });
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req, limit = 60e6) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('Too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);

    if (p === '/api/forms') return send(res, 200, listForms());

    if (p.startsWith('/api/policy/')) {
      try {
        const found = await lookupPolicy(p.slice(12));
        return found ? send(res, 200, found) : send(res, 404, { error: `Policy ${p.slice(12)} was not found in the policy summary.` });
      } catch (e) {
        return send(res, 500, { error: e.code === 'ENOENT' ? `The policy summary file was not found: ${POLICY_FILE}` : e.message });
      }
    }

    if (p.startsWith('/forms/')) {
      const f = inside(FORMS, p.slice(7));
      if (!f || !fs.existsSync(f)) return send(res, 404, { error: 'Form not found' });
      return send(res, 200, fs.readFileSync(f), 'application/pdf');
    }

    if (p.startsWith('/api/layouts/')) {
      const file = layoutFile(p.slice(13));
      if (req.method === 'GET') return send(res, 200, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 'null');
      if (req.method === 'PUT') { const body = JSON.parse(await readBody(req)); fs.writeFileSync(file, JSON.stringify(body, null, 1)); return send(res, 200, { ok: true }); }
      if (req.method === 'DELETE') { if (fs.existsSync(file)) fs.unlinkSync(file); return send(res, 200, { ok: true }); }
    }



    const dir = Object.keys(STATIC_DIRS).find(d => p.startsWith(d));
    const rel = STATIC[p] || (dir ? STATIC_DIRS[dir] + '/' + p.slice(dir.length) : p.startsWith('/') ? 'public' + p : null);
    const f = rel && inside(ROOT, rel);
    if (f && fs.existsSync(f) && fs.statSync(f).isFile()) return send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)] || 'application/octet-stream');
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') { console.log(`Form Filler is already running at http://localhost:${PORT}`); process.exit(0); }
  throw e;
});
server.listen(PORT, '127.0.0.1', () => console.log(`Form Filler running at http://localhost:${PORT}  (keep this window open while you use it)`));
