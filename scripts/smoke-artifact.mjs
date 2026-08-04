import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const project = resolve(new URL('..', import.meta.url).pathname);
const output = resolve(project, 'artifact', 'NASA-COSMOS-OPUS5-Standalone-Artifact.html');
const html = await readFile(output, 'utf8');
const browserErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => browserErrors.push(String(error?.message || error)));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'about:blank',
  virtualConsole,
  beforeParse(window) {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new window.DOMException('Storage is unavailable for opaque origins', 'SecurityError'); },
    });
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new window.DOMException('Storage is unavailable for opaque origins', 'SecurityError'); },
    });
    window.fetch = async () => { throw new TypeError('Offline smoke test'); };
    window.matchMedia = () => ({
      matches: false, media: '', onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
    });
    window.HTMLCanvasElement.prototype.getContext = () => null;
  },
});

await new Promise((resolveWait) => setTimeout(resolveWait, 250));

const { document } = dom.window;
if (!document.querySelector('.observatory')) throw new Error('Artifact did not mount its application shell in a storage-restricted viewer');
const fallback = document.querySelector('#webgl-fallback');
if (!fallback || fallback.hasAttribute('hidden')) throw new Error('Artifact did not expose the non-WebGL fallback');
if (!document.querySelector('#quality-select') || !document.querySelector('#record-button')) throw new Error('Primary controls are missing');

const fatal = browserErrors.filter((message) => /uncaught|securityerror|syntaxerror/i.test(message));
if (fatal.length) throw new Error(`Artifact emitted fatal browser errors: ${fatal.join(' | ')}`);
dom.window.close();
console.log(JSON.stringify({ status: 'smoke-passed', storage: 'blocked', webgl: 'blocked', shell: 'mounted' }));
