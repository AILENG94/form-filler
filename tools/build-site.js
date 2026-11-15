// Builds the static web version into docs/ (served by GitHub Pages): the app, the PDF forms, the saved layouts and the
// reading libraries. There is no server there, so policy lookup is off and the agent's details are typed once per device.
//   node tools/build-site.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs');
const CATEGORIES = [['NEW BUSINESS', 'New Business'], ['CUSTOMER SERVICE', 'Customer Service'], ['CLAIM', 'Claim'], ['GENERALI', 'Generali'], ['GROUP', 'Group Insurance']];
const LOCAL_ONLY = new Set(['agent-defaults.js', 'mode.js']); // personal details / computer-version flag: never published

fs.rmSync(OUT, { recursive: true, force: true });
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
const copyDir = (from, to, filter = () => true) => {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.isDirectory()) copyDir(path.join(from, e.name), path.join(to, e.name), filter);
    else if (filter(e.name)) copy(path.join(from, e.name), path.join(to, e.name));
  }
};

// the app
copyDir(path.join(ROOT, 'public'), OUT, name => !LOCAL_ONLY.has(name));
fs.writeFileSync(path.join(OUT, 'mode.js'), '// web version: no server\nwindow.FF_STATIC = true;\n');
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

// libraries (same files server.js serves under /lib/)
const NM = path.join(ROOT, 'node_modules');
copy(path.join(NM, 'pdfjs-dist/build/pdf.min.mjs'), path.join(OUT, 'lib/pdf.mjs'));
copy(path.join(NM, 'pdfjs-dist/build/pdf.worker.min.mjs'), path.join(OUT, 'lib/pdf.worker.mjs'));
copy(path.join(NM, 'pdf-lib/dist/pdf-lib.esm.min.js'), path.join(OUT, 'lib/pdf-lib.esm.js'));
copyDir(path.join(NM, 'tesseract.js/dist'), path.join(OUT, 'lib/ocr'));
copyDir(path.join(NM, 'tesseract.js-core'), path.join(OUT, 'lib/ocr-core'), n => /\.(js|wasm)$/.test(n) && n !== 'index.js');
copyDir(path.join(NM, '@tesseract.js-data/eng/4.0.0_best_int'), path.join(OUT, 'lib/ocr-lang'));

// forms, form list, layouts
const layoutFile = id => path.join(ROOT, 'layouts', id.replace(/[^\w\- ()&.]+/g, '_') + '.json');
const list = CATEGORIES.map(([folder, label]) => {
  const dir = path.join(ROOT, 'Forms', folder);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf')).sort() : [];
  return {
    folder, label,
    forms: files.map(f => {
      const id = `${folder}__${f.replace(/\.pdf$/i, '')}`;
      copy(path.join(dir, f), path.join(OUT, 'forms', folder, f));
      const lf = layoutFile(id), has = fs.existsSync(lf);
      fs.mkdirSync(path.join(OUT, 'data/layouts'), { recursive: true });
      fs.writeFileSync(path.join(OUT, 'data/layouts', id + '.json'), has ? fs.readFileSync(lf) : 'null');
      return { id, file: `${folder}/${f}`, name: f.replace(/\.pdf$/i, ''), hasLayout: has };
    }),
  };
});
fs.writeFileSync(path.join(OUT, 'data/forms.json'), JSON.stringify(list));

const size = d => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log(`docs/ built: ${list.reduce((n, c) => n + c.forms.length, 0)} forms, ${(size(OUT) / 1e6).toFixed(1)} MB`);
