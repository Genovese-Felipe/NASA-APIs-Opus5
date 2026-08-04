import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const project = resolve(new URL('..', import.meta.url).pathname);
const dist = resolve(project, 'dist');
const assetsDir = resolve(dist, 'assets');
const assets = await readdir(assetsDir);
const jsName = assets.find((file) => file.endsWith('.js'));
const cssName = assets.find((file) => file.endsWith('.css'));
if (!jsName || !cssName) throw new Error('Build assets were not found');

let html = await readFile(resolve(dist, 'index.html'), 'utf8');
const css = await readFile(resolve(assetsDir, cssName), 'utf8');
const js = (await readFile(resolve(assetsDir, jsName), 'utf8')).replace(/\/\/# sourceMappingURL=.*$/m, '');

html = html
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="stylesheet"[^>]*>/, `\n    <style>${css}</style>`)
  .replace(/\s*<script type="module"[^>]*src="[^"]+"><\/script>/, `\n    <script>window.__OPUS5_ARTIFACT__=true;</script>\n    <script type="module">${js}<\/script>`);

if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('Artifact still contains local build dependencies');
await mkdir(resolve(project, 'artifact'), { recursive: true });
const output = resolve(project, 'artifact', 'NASA-COSMOS-OPUS5-Claude-Artifact.html');
await writeFile(output, html, 'utf8');
console.log(JSON.stringify({ status: 'created', output, bytes: Buffer.byteLength(html) }));
