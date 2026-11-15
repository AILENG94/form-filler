// Builds layouts/*.json for every form: auto-detection + the per-form fixes in tools/form-fixes.js.
// Run after changing form-fixes.js:  node tools/build-layouts.js [file-substring]
// Note: this overwrites layouts saved from the app's "Adjust layout" for the forms it builds.
import fs from 'fs'; import path from 'path';
import { allForms, buildLayout, loadFixes, fixFor, ROOT } from './layout-kit.js';

const only = process.argv[2];
const fixes = await loadFixes();
const used = new Set();
fs.mkdirSync(path.join(ROOT, 'layouts'), { recursive: true });
for (const form of allForms()) {
  if (only && !form.file.includes(only)) continue;
  const k = Object.keys(fixes).find(k => form.file.includes(k));
  if (k) used.add(k);
  const { layout } = await buildLayout(form, fixFor(fixes, form));
  const file = path.join(ROOT, 'layouts', form.id.replace(/[^\w\- ()&.]+/g, '_') + '.json');
  const fields = layout.map(({ label, ...f }) => f); // the label is only for building
  fs.writeFileSync(file, JSON.stringify({ form: `${form.folder}/${form.file}`, saved: new Date().toISOString(), fields }, null, 1));
  console.log(`${String(fields.length).padStart(3)} fields  ${form.folder} / ${form.file}${k ? '' : '   (no fixes)'}`);
}
if (!only) for (const k of Object.keys(fixes)) if (!used.has(k)) console.log('UNUSED FIX KEY:', k);
process.exit(0);
