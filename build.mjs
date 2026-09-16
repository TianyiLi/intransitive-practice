import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const output = new URL('./dist/', import.meta.url);
await mkdir(output, { recursive: true });
const assets = ['index.html', 'style.css', 'app.mjs', 'engine.mjs', 'strategy.mjs', 'strategy-worker.mjs', 'bot-controller.mjs', 'records.mjs'];
for (const name of assets) await copyFile(new URL(name, import.meta.url), new URL(name, output));
await writeFile(new URL('.nojekyll', output), '');
console.log(`Prepared ${assets.length} static assets in dist/`);
