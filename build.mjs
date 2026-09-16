import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const output = new URL('./dist/', import.meta.url);
await mkdir(output, { recursive: true });
await mkdir(new URL('assets/', output), { recursive: true });
const assets = ['index.html', 'style.css', 'app.mjs', 'engine.mjs', 'strategy.mjs', 'strategy-worker.mjs', 'bot-controller.mjs', 'records.mjs', 'assets/rock.png', 'assets/paper.png', 'assets/scissors.png'];
const contents = await Promise.all(assets.map(name => readFile(new URL(name, import.meta.url))));
const hash = createHash('sha256');
hash.update(await readFile(new URL('./build.mjs', import.meta.url)));
for (const bytes of contents) hash.update(bytes);
const version = hash.digest('hex').slice(0, 12);
for (const [i, name] of assets.entries()) {
  let body = contents[i];
  if (/\.(html|css|mjs)$/.test(name)) {
    let text = body.toString('utf8').replaceAll('__ASSET_VERSION__', version);
    for (const asset of assets) text = text.replaceAll(`./${asset}`, `./${asset}?v=${version}`);
    body = text;
  }
  await writeFile(new URL(name, output), body);
}
await writeFile(new URL('.nojekyll', output), '');
console.log(`Prepared ${assets.length} static assets in dist/`);
