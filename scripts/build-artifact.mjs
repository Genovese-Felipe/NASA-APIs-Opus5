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
const js = (await readFile(resolve(assetsDir, jsName), 'utf8') )
  .replace(/\/\/# sourceMappingURL=.*$/m, '')
  .replaceAll('</script', '<\\/script');

const artifactBootCss = `
.artifact-boot{min-height:100vh;display:grid;place-items:center;padding:32px;background:radial-gradient(circle at 50% 35%,#12344d 0,#06111d 38%,#02050a 72%);color:#eef8ff;font:500 16px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center}
.artifact-boot-card{width:min(620px,92vw);padding:36px;border:1px solid rgba(143,218,255,.28);border-radius:24px;background:rgba(4,16,28,.82);box-shadow:0 22px 80px rgba(0,0,0,.58);backdrop-filter:blur(18px)}
.artifact-boot-mark{display:inline-grid;place-items:center;width:58px;height:58px;margin-bottom:18px;border:1px solid #76dcff;border-radius:50%;color:#76dcff;letter-spacing:.08em;box-shadow:0 0 32px rgba(71,199,255,.25)}
.artifact-boot h1{margin:0 0 6px;font-size:clamp(26px,5vw,44px);line-height:1;letter-spacing:-.04em}.artifact-boot p{margin:10px auto;max-width:52ch;color:#b8ccda}.artifact-boot small{display:block;margin-top:20px;color:#7f9aab}
.artifact-boot-pulse{width:88px;height:2px;margin:24px auto 0;background:linear-gradient(90deg,transparent,#6ee7ff,transparent);animation:artifact-pulse 1.5s ease-in-out infinite}@keyframes artifact-pulse{50%{transform:scaleX(.35);opacity:.45}}
`;

const artifactBoot = `<section class="artifact-boot" role="status" aria-live="polite"><div class="artifact-boot-card"><span class="artifact-boot-mark">O5</span><h1>NASA COSMOS // OPUS 5</h1><p>Initializing the portable computational observatory…</p><div class="artifact-boot-pulse" aria-hidden="true"></div><small>Self-contained artifact · live NASA sources with an offline demonstration fallback</small></div></section>`;

const artifactRuntime = `<script>
window.__OPUS5_ARTIFACT__=true;
(function(){
  function revealFailure(message){
    if(document.querySelector('.observatory')) return;
    var boot=document.querySelector('.artifact-boot');
    if(!boot) return;
    var paragraph=boot.querySelector('p');
    if(paragraph) paragraph.textContent=message||'The advanced renderer was blocked, but this artifact is intact. Download it and open it in a current Chrome, Edge, Firefox, or Safari browser.';
    var pulse=boot.querySelector('.artifact-boot-pulse');
    if(pulse) pulse.remove();
  }
  window.addEventListener('error',function(){revealFailure();});
  window.setTimeout(function(){if(!document.querySelector('.observatory'))revealFailure('This preview blocked the interactive runtime. Download this HTML file and open it in a current browser; no installation is required.');},1800);
})();
</script><script>${js}</script>`;

html = html
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="stylesheet"[^>]*>/, `\n    <style>${artifactBootCss}${css}</style>`)
  .replace(/\s*<script type="module"[^>]*src="[^"]+"><\/script>/, '')
  .replace('<div id="app"></div>', `<div id="app">${artifactBoot}</div>`)
  .replace('</body>', `${artifactRuntime}\n  </body>`);

if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('Artifact still contains local build dependencies');
await mkdir(resolve(project, 'artifact'), { recursive: true });
const output = resolve(project, 'artifact', 'NASA-COSMOS-OPUS5-Claude-Artifact.html');
await writeFile(output, html, 'utf8');
console.log(JSON.stringify({ status: 'created', output, bytes: Buffer.byteLength(html) }));
