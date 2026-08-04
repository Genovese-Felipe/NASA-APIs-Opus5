import { access, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../dist/', import.meta.url);
const required = ['index.html', 'manifest.webmanifest', 'sw.js'];
for (const file of required) await access(new URL(file, root));

const html = await readFile(new URL('index.html', root), 'utf8');
if (!html.includes('NASA COSMOS // OPUS 5')) throw new Error('Built HTML is missing the product identity');
if (/src="\/assets|href="\/assets/.test(html)) throw new Error('Built asset paths are not GitHub Pages-safe');

const assetsDir = new URL('assets/', root);
const assets = await readdir(assetsDir);
const js = assets.find((file) => file.endsWith('.js'));
const css = assets.find((file) => file.endsWith('.css'));
if (!js || !css) throw new Error('Built JavaScript or CSS asset is missing');
const jsSize = (await stat(join(assetsDir.pathname, js))).size;
const cssSize = (await stat(join(assetsDir.pathname, css))).size;
if (jsSize < 20_000 || cssSize < 5_000) throw new Error('Built assets are unexpectedly small');

const bundle = await readFile(join(assetsDir.pathname, js), 'utf8');
if (bundle.includes('YOUR_NASA_API_KEY')) throw new Error('A key placeholder leaked into the production bundle');
if (!bundle.includes('DEMO_KEY')) throw new Error('Expected rate-limited NASA fallback key is missing');

console.log(JSON.stringify({ status: 'valid', assets: { js, jsSize, css, cssSize } }));
