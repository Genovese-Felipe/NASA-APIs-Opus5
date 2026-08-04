#!/usr/bin/env node
/**
 * Build the single-file version.
 *
 * The deployed site is fifty ES modules and a handful of JSON files, which is
 * the right shape for something served over HTTP/2 and read by people. It is
 * the wrong shape for a Claude Artifact, an email attachment, a USB stick or a
 * museum kiosk with no network — all of which want one file that works when you
 * open it.
 *
 * So this inlines everything: modules resolved and concatenated in dependency
 * order, JSON turned into constants, CSS embedded, and the module loader
 * replaced with a tiny registry that hands each module its dependencies. The
 * output is one self-contained HTML file with no external references at all.
 *
 * The star catalogue is the interesting part of the size budget: 8,751 real
 * stars is 237 KB of JSON. It is kept, because a sky with only the bright stars
 * looks obviously wrong, and 237 KB of gzip-friendly numbers is a fair price.
 *
 * `--fragment` emits the same thing without the document wrapper — style, body
 * and script only. Some embedding hosts (the Claude artifact renderer among
 * them) supply their own `<head>`, and a nested `<html>` would be discarded
 * along with everything in it.
 *
 * Usage:  node tools/build-artifact.mjs [--out standalone.html] [--fragment] [--quiet]
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const QUIET = argv.includes('--quiet');
const FRAGMENT = argv.includes('--fragment');
const outIdx = argv.indexOf('--out');
const OUT = resolve(ROOT, outIdx > -1 && argv[outIdx + 1] ? argv[outIdx + 1] : 'standalone.html');

const log = (...a) => { if (!QUIET) process.stdout.write(a.join(' ') + '\n'); };

/** Virtual origin standing in for the deployed site inside the single file. */
const VIRTUAL_ORIGIN = 'https://orrery.local';

/** @type {Map<string, {id:string, code:string, deps:string[]}>} */
const modules = new Map();
/** @type {Map<string, string>} JSON path -> parsed content. */
const jsonAssets = new Map();
/** @type {Map<string, string>} Binary asset path -> data: URL. */
const binaryAssets = new Map();

/**
 * Resolve a relative specifier against an importing file.
 * @param {string} fromFile Absolute path of the importer.
 * @param {string} spec
 * @returns {string} Absolute path.
 */
function resolveSpec(fromFile, spec) {
  return resolve(dirname(fromFile), spec);
}

/**
 * Read a module, rewrite its imports and exports, and recurse into its
 * dependencies.
 *
 * The transform is deliberately narrow because the source is deliberately
 * plain: static `import`/`export` only, no dynamic `import()` except for the
 * locale loader and the two lazily-loaded panels, both of which are handled
 * explicitly.
 *
 * @param {string} file Absolute path.
 * @returns {Promise<string>} Module id.
 */
async function addModule(file) {
  const id = relative(ROOT, file).replace(/\\/g, '/');
  if (modules.has(id)) return id;
  modules.set(id, null); // reserve, to break import cycles

  let code = await readFile(file, 'utf8');
  const deps = [];

  // --- static imports ------------------------------------------------------
  // import X from './y.js'      -> const X = __req('y').default
  // import { a, b as c } from   -> const { a, b: c } = __req('y')
  // import * as N from          -> const N = __req('y')
  // import './y.js'             -> __req('y')
  const importRe =
    /import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\}|\*\s*as\s+([\w$]+)|([\w$]+))?\s*(?:from\s*)?['"](\.[^'"]+)['"];?/g;
  code = await replaceAsync(code, importRe, async (_m, dflt2, named, star, dflt, spec) => {
    const target = resolveSpec(file, spec);
    const depId = await addModule(target);
    deps.push(depId);
    const parts = [];
    const req = `__req(${JSON.stringify(depId)})`;
    const dfltName = dflt || dflt2;
    if (star) parts.push(`const ${star} = ${req};`);
    if (dfltName) parts.push(`const ${dfltName} = ${req}.default;`);
    if (named) {
      const bindings = named
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const [orig, alias] = s.split(/\s+as\s+/).map((x) => x.trim());
          return alias ? `${orig}: ${alias}` : orig;
        })
        .join(', ');
      if (bindings) parts.push(`const { ${bindings} } = ${req};`);
    }
    if (!parts.length) parts.push(`${req};`);
    return parts.join('\n');
  });

  // --- URLs resolved against import.meta.url --------------------------------
  //
  // Data files are addressed with `new URL(something, import.meta.url)`, which
  // has no meaning once every module lives inside one <script>. Rewrite the
  // base to a virtual https origin that mirrors the repository layout, so the
  // *expression* still works — including the template-literal form the snapshot
  // loader uses — and let a fetch shim resolve it to the inlined data.
  //
  // A real https base is used rather than a custom scheme because URL relative
  // resolution only behaves normally for hierarchical schemes.
  {
    const dirUnderRoot = relative(ROOT, dirname(file)).replace(/\\/g, '/');
    code = code.replace(
      /import\.meta\.url/g,
      JSON.stringify(`${VIRTUAL_ORIGIN}/${dirUnderRoot}/`)
    );
  }

  // --- exports --------------------------------------------------------------
  code = code
    .replace(/^export\s+default\s+/m, '__exports.default = ')
    .replace(/^export\s+(const|let|var|function|class|async function)\s+/gm, '$1 ')
    .replace(/^export\s*\{([^}]*)\}\s*;?/gm, (_m, names) => {
      const assignments = names
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const [orig, alias] = s.split(/\s+as\s+/).map((x) => x.trim());
          return `__exports[${JSON.stringify(alias || orig)}] = ${orig};`;
        });
      return assignments.join('\n');
    });

  // Re-export every top-level binding the module declared, since the regex
  // above stripped the `export` keyword but not the intent.
  const exported = [];
  const declRe = /^(?:const|let|var|function|class|async function)\s+([\w$]+)/gm;
  const original = await readFile(file, 'utf8');
  for (const m of original.matchAll(/^export\s+(?:const|let|var|function|class|async function)\s+([\w$]+)/gm)) {
    exported.push(m[1]);
  }
  void declRe;
  const tail = exported.map((n) => `__exports[${JSON.stringify(n)}] = ${n};`).join('\n');

  modules.set(id, { id, code: `${code}\n${tail}`, deps });
  return id;
}

/** Async-capable String.replace. @private */
async function replaceAsync(str, re, fn) {
  const promises = [];
  str.replace(re, (...args) => {
    promises.push(fn(...args));
    return '';
  });
  const values = await Promise.all(promises);
  let i = 0;
  return str.replace(re, () => values[i++]);
}

/**
 * Locale catalogues are loaded with a dynamic `import()`. Inline them all and
 * replace the loader with a lookup.
 * @returns {Promise<string>}
 */
async function buildLocales() {
  const { readdir } = await import('node:fs/promises');
  const dir = resolve(ROOT, 'src/ui/locales');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.js'));
  const entries = [];
  for (const f of files) {
    const tag = f.replace(/\.js$/, '');
    const src = await readFile(resolve(dir, f), 'utf8');
    const body = src.replace(/^export\s+default\s+/m, 'return ');
    entries.push(`  ${JSON.stringify(tag)}: (function(){ ${body} })()`);
  }
  return `const __locales = {\n${entries.join(',\n')}\n};`;
}

/**
 * Collect every JSON file under `src/` so the fetch shim can serve it.
 * @param {string} dir
 */
async function collectBinary(dir, pattern) {
  const { readdir } = await import('node:fs/promises');
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // nothing baked yet; the build is still valid, just less pretty
  }
  for (const entry of entries) {
    if (entry.isDirectory() || !pattern.test(entry.name)) continue;
    const full = resolve(dir, entry.name);
    const bytes = await readFile(full);
    const mime = entry.name.endsWith('.png') ? 'image/png' : 'image/jpeg';
    binaryAssets.set(
      relative(ROOT, full).replace(/\\/g, '/'),
      `data:${mime};base64,${bytes.toString('base64')}`
    );
  }
}

async function collectJson(dir) {
  const { readdir } = await import('node:fs/promises');
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) await collectJson(full);
    else if (entry.name.endsWith('.json')) {
      jsonAssets.set(relative(ROOT, full).replace(/\\/g, '/'), await readFile(full, 'utf8'));
    }
  }
}

async function main() {
  const entry = resolve(ROOT, 'src/main.js');
  await collectJson(resolve(ROOT, 'src'));

  // The baked NASA basemaps. Without them the single-file build shows a
  // procedural Earth, because an embedding host's Content-Security-Policy
  // forbids reaching GIBS and there is no file beside the HTML to read.
  await collectBinary(resolve(ROOT, 'assets/basemaps'), /\.(jpg|png)$/);
  await addModule(entry);
  const entryId = relative(ROOT, entry).replace(/\\/g, '/');

  const css = await readFile(resolve(ROOT, 'src/styles/app.css'), 'utf8');
  const html = await readFile(resolve(ROOT, 'index.html'), 'utf8');
  const locales = await buildLocales();

  // Take the body of index.html, minus every external reference: the module
  // entry point and the stylesheet are being inlined, and the boot guard has
  // nothing left to guard once the module graph is part of the file. Any
  // src= that survived to here would be a dead link in a build whose entire
  // purpose is to have none.
  const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
  let body = bodyMatch ? bodyMatch[1] : '';
  body = body
    .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
    .replace(/<link rel="stylesheet"[^>]*>/g, '');

  // The i18n layer loads a catalogue with a dynamic import; point it at the
  // inlined table instead.
  for (const m of modules.values()) {
    if (!m) continue;
    m.code = m.code.replace(
      /const mod = await import\(`\.\/locales\/\$\{tag\}\.js`\);\s*catalogues\.set\(tag, mod\.default\);\s*return mod\.default;/,
      'const cat = __locales[tag];\n    if (!cat) throw new Error("no such locale");\n    catalogues.set(tag, cat);\n    return cat;'
    );
    // Lazily-imported panels are already in the bundle.
    m.code = m.code.replace(
      /await import\((['"])\.\/panels\.js\1\)/g,
      '__req("src/ui/panels.js")'
    );
    m.code = m.code.replace(
      /await import\((['"])\.\.\/data\/nasa\.js\1\)/g,
      '__req("src/data/nasa.js")'
    );
    m.code = m.code.replace(
      /await import\((['"])\/src\/([^'"]+)\1\)/g,
      (_m2, _q, rest) => `__req("src/${rest}")`
    );
  }

  const moduleSource = [...modules.values()]
    .filter(Boolean)
    .map((m) => `__def(${JSON.stringify(m.id)}, function(__exports, __req){\n${m.code}\n});`)
    .join('\n\n');

  const jsonSource = [...jsonAssets.entries()]
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${v}`)
    .join(',\n');

  const binarySource = [...binaryAssets.entries()]
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(',\n');

  const runtime = `
// --- module registry -------------------------------------------------------
// A five-line replacement for the ES module loader. Each module is a function
// that receives its exports object and a require shim; results are memoised so
// a module body runs exactly once, exactly as the real loader would.
const __registry = new Map();
const __cache = new Map();
function __def(id, fn) { __registry.set(id, fn); }
function __req(id) {
  if (__cache.has(id)) return __cache.get(id);
  const exports = {};
  __cache.set(id, exports);
  const fn = __registry.get(id);
  if (!fn) throw new Error('module not found: ' + id);
  fn(exports, __req);
  return exports;
}

// --- inlined JSON ----------------------------------------------------------
const __jsonData = {
${jsonSource}
};

// --- inlined binary assets -------------------------------------------------
// Published as data: URLs rather than served through the fetch shim, because
// an <img> or createImageBitmap wants a URL and a data: URL needs no request,
// no blob and therefore no cooperation from a Content-Security-Policy.
window.__ORRERY_ASSETS = {
${binarySource}
};

// Every data file is addressed against a virtual origin that mirrors the
// repository layout. Intercepting fetch here means the application code needs
// no knowledge that it is running as a single file.
//
// The response is CONSTRUCTED, not fetched. Wrapping the data in a Blob and
// handing back its object URL is the obvious way to do this, and it works
// everywhere except the one place this build exists for: an embedding host
// that applies a strict Content-Security-Policy. A policy of
// connect-src 'none' refuses blob: exactly as it refuses https:, so the first
// data load -- the star catalogue, during boot -- failed with "Failed to
// fetch" and took the whole application down with it before a single frame
// was drawn. new Response() performs no fetch at all, so there is no request
// for a policy to refuse.
const __VIRTUAL = 'https://orrery.local/';
const __realFetch = window.fetch.bind(window);
window.fetch = function (input, init) {
  const url = String(input && input.href ? input.href : input);
  if (url.startsWith(__VIRTUAL)) {
    const key = decodeURIComponent(url.slice(__VIRTUAL.length)).replace(/^\\/+/, '');
    const body = __jsonData[key];
    if (body !== undefined) {
      return Promise.resolve(new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  }
  return __realFetch(input, init);
};

${locales}
`;

  const styles = `<style>\n${css}\n</style>`;
  const markup = `${body}
<script>
${runtime}
${moduleSource}
__req(${JSON.stringify(entryId)});
</script>`;

  // The fragment build sets `dir`/`lang` from script rather than on <html>,
  // because it does not own that element. i18n.setLocale rewrites both on every
  // locale change; this only has to cover the first paint.
  const out = FRAGMENT
    ? `${styles}\n${markup}\n<script>document.documentElement.lang='en';document.documentElement.dir='ltr';</script>\n`
    : `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>ORRERY — A ray-traced tour of the solar system, built from NASA data</title>
<meta name="description" content="An interactive, ray-traced model of the solar system, assembled from public NASA and JPL data. Single-file build.">
<meta name="color-scheme" content="dark">
${styles}
</head>
<body>
${markup}
</body>
</html>
`;

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, out);
  const kb = Math.round(out.length / 1024);
  log(`Single-file build: ${relative(ROOT, OUT)} — ${kb} KB, ${modules.size} modules, ${jsonAssets.size} data files, ${binaryAssets.size} images`);
}

main().catch((err) => {
  process.stderr.write(`build-artifact failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
