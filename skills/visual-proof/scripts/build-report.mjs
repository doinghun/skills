// Build one self-contained HTML report (images inlined) from a manifest.
// Usage: node build-report.mjs <manifest.json> [out.html]
// Manifest: { "title": "...", "summary": "...", "rows": [
//   { "label": "Dashboard, desktop", "before": "/abs/before.png", "after": "/abs/after.png", "note": "..." } ] }
// "before" is optional (new screens). Paths are absolute or relative to the manifest.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [manifestPath, outArg] = process.argv.slice(2);
if (!manifestPath) {
  console.error('Usage: node build-report.mjs <manifest.json> [out.html]');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const base = dirname(resolve(manifestPath));
const out = resolve(outArg ?? resolve(base, 'report.html'));

const esc = (s = '') =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const img = (path, alt) => {
  if (!path) return '<div class="empty">No before: new screen</div>';
  const data = readFileSync(resolve(base, path)).toString('base64');
  return `<img src="data:image/png;base64,${data}" alt="${esc(alt)}" loading="lazy">`;
};

const rows = manifest.rows
  .map(
    (r) => `<section>
  <h2>${esc(r.label)}</h2>${r.note ? `\n  <p>${esc(r.note)}</p>` : ''}
  <div class="pair">
    <figure><figcaption>Before</figcaption>${img(r.before, `${r.label} before`)}</figure>
    <figure><figcaption>After</figcaption>${img(r.after, `${r.label} after`)}</figure>
  </div>
</section>`,
  )
  .join('\n');

writeFileSync(
  out,
  `<!doctype html>
<meta charset="utf-8">
<title>${esc(manifest.title)}</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 24px; color: #1a1b1e; background: #f8f9fa; }
  section { background: #fff; border: 1px solid #e9ecef; border-radius: 8px; padding: 16px; margin: 16px 0; }
  h2 { font-size: 17px; margin: 0 0 8px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
  figure { margin: 0; }
  figcaption { font-weight: 600; margin-bottom: 4px; }
  img { width: 100%; border: 1px solid #dee2e6; border-radius: 4px; cursor: zoom-in; }
  .empty { padding: 32px; text-align: center; color: #868e96; border: 1px dashed #ced4da; border-radius: 4px; }
  dialog { padding: 0; border: 0; max-width: 95vw; max-height: 95vh; }
  dialog img { width: auto; max-width: 95vw; cursor: zoom-out; }
</style>
<h1>${esc(manifest.title)}</h1>
${manifest.summary ? `<p>${esc(manifest.summary)}</p>` : ''}
${rows}
<dialog id="zoom"><img alt=""></dialog>
<script>
  const d = document.getElementById('zoom');
  document.querySelectorAll('section img').forEach((i) =>
    i.addEventListener('click', () => { d.querySelector('img').src = i.src; d.showModal(); }));
  d.addEventListener('click', () => d.close());
</script>
`,
);
console.log(out);
