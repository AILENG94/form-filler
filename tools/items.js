// Dev: list the extra fill-in items found on a form.  node tools/items.js <file-substring>
import { allForms, buildLayout, loadFixes, fixFor } from './layout-kit.js';
const sub = process.argv[2];
for (const form of allForms().filter(f => !sub || f.file.includes(sub))) {
  const { layout } = await buildLayout(form, fixFor(await loadFixes(), form));
  const items = layout.filter(f => f.item);
  const seen = new Set();
  console.log(`\n# ${form.file}: ${new Set(items.map(f => f.key)).size} items`);
  for (const f of items) {
    if (seen.has(f.key)) continue; seen.add(f.key);
    console.log(`  p${f.page} ${f.item.kind === 'choice' ? 'CHOICE' : f.type === 'comb' ? 'BOXES ' : 'TEXT  '} ${f.item.label}${f.item.kind === 'choice' ? '  [' + f.item.options.join(' / ') + ']' : ''}`);
  }
}
process.exit(0);
