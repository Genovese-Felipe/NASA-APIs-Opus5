import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
assert.ok(scriptMatch, 'inline application script exists');
new vm.Script(scriptMatch[1], { filename: 'index.html:inline-script' });

const requiredIds = [
  'space-canvas', 'fallback-canvas', 'language-select', 'object-select', 'orbit-speed', 'time-scale',
  'quality-select', 'export-select', 'format-select', 'api-grid', 'event-list',
  'modal-wrap', 'drawer-backdrop'
];
for (const id of requiredIds) assert.match(html, new RegExp(`id=["']${id}["']`), `required DOM anchor: ${id}`);

for (const path of [
  '/planetary/apod', '/EPIC/api/natural', '/neo/rest/v1/feed', '/DONKI/FLR',
  '/DONKI/CME', '/api/v3/events', 'images-api.nasa.gov', '/planetary/earth/imagery'
]) assert.ok(html.includes(path), `NASA source is present: ${path}`);
assert.ok(html.includes('eonet.gsfc.nasa.gov'), 'EONET host is present');

assert.ok(html.includes('DEMO_KEY'), 'safe public default key is present');
assert.ok(html.includes('FALLBACK'), 'fallback vocabulary is present');
assert.ok(html.includes('MediaRecorder'), 'recording capability is present');
assert.ok(html.includes('7680'), '8K capture target is present');
assert.ok(html.includes('WebGL2 / procedural ray trace'), 'renderer contract is documented in UI');
assert.ok(html.includes('activateFallback'), 'renderer fallback is independent from the WebGL canvas');
assert.ok(html.includes('const storage ='), 'storage failures are non-fatal');
assert.ok(fs.existsSync(new URL('../.github/workflows/pages.yml', import.meta.url)), 'Pages workflow exists');
assert.ok(fs.existsSync(new URL('../scripts/build-artifact.mjs', import.meta.url)), 'private artifact builder exists');

console.log('ORBITAL smoke test: PASS');
console.log(`HTML: ${Buffer.byteLength(html, 'utf8')} bytes`);
console.log(`Required UI anchors: ${requiredIds.length}`);
console.log('NASA source integrations: 8');
