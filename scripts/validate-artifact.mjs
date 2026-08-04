import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const project = resolve(new URL('..', import.meta.url).pathname);
const output = resolve(project, 'artifact', 'NASA-COSMOS-OPUS5-Claude-Artifact.html');
const html = await readFile(output, 'utf8');
const info = await stat(output);

const assertions = [
  ['substantial file', info.size > 80_000],
  ['single app root', (html.match(/id="app"/g) || []).length === 1],
  ['static boot screen', html.includes('class="artifact-boot"')],
  ['artifact runtime marker', html.includes('window.__OPUS5_ARTIFACT__=true')],
  ['classic inline runtime', !/<script[^>]+type="module"/i.test(html)],
  ['no local asset dependency', !/(?:src|href)="\.\/assets\//i.test(html)],
  ['no external script dependency', !/<script[^>]+src=/i.test(html)],
  ['application bundled', html.includes('NASA COSMOS') && html.includes('observatory')],
];

const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) throw new Error(`Artifact validation failed: ${failed.join(', ')}`);
console.log(JSON.stringify({ status: 'valid', bytes: info.size, checks: assertions.length }));
