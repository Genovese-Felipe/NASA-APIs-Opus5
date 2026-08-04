#!/usr/bin/env node
/**
 * A focused linter.
 *
 * Not a general-purpose style checker — there is no ESLint here, deliberately,
 * because the whole point of this repository is that it runs from source with
 * no toolchain. What this checks is the small set of mistakes that would
 * actually break the deployed site, each of which has bitten this project or
 * would have:
 *
 *  1. Root-absolute paths. The site is served from `/NASA-APIs-Opus5/`, so
 *     `src="/src/main.js"` works locally and 404s in production.
 *  2. Syntax errors, by parsing every module.
 *  3. Backticks inside GLSL template literals, which silently terminate the
 *     JavaScript string and produce a baffling parse error.
 *  4. `innerHTML` outside the one helper that is allowed to use it, since the
 *     Content Security Policy and untrusted API responses make it dangerous.
 *  5. Hosts used in `fetch()` that are missing from the CSP `connect-src`.
 *  6. Imports that point at files which do not exist.
 *  7. Leftover debugging: `console.log`, `debugger`, `.only(`.
 *
 * Usage:  node tools/lint.mjs
 * Exit code 1 on any error.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, relative, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

/** @param {string} file @param {string} message */
const err = (file, message) => errors.push(`${relative(ROOT, file)}: ${message}`);
const warn = (file, message) => warnings.push(`${relative(ROOT, file)}: ${message}`);

/**
 * Walk a directory tree, skipping the things that are not ours.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    // Generated trees and generated single-file builds are output, not source.
    // Linting them re-reports every finding twice and, worse, holds the bundler
    // to rules written for the hand-authored site.
    if (['node_modules', '.git', 'dist', 'artifact', '_site', 'test-results', 'playwright-report'].includes(entry.name)) {
      continue;
    }
    if (entry.name === 'standalone.html' && dir === ROOT) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/**
 * Is `index` inside a `//` line comment or a block comment?
 *
 * Deliberately simple: it scans backwards from the offset rather than lexing
 * the file. A `//` earlier on the same line, or an unclosed block comment
 * before it, both count. Good enough to keep prose out of the module graph
 * without pulling in a parser.
 *
 * @param {string} text @param {number} index
 */
function inComment(text, index) {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const before = text.slice(lineStart, index);
  if (before.includes('//') || /^\s*\*/.test(before)) return true;
  const open = text.lastIndexOf('/*', index);
  return open !== -1 && text.lastIndexOf('*/', index) < open;
}

async function main() {
  const files = await walk(ROOT);
  const js = files.filter((f) => extname(f) === '.js' || extname(f) === '.mjs');
  const html = files.filter((f) => extname(f) === '.html');

  // --- 1 + 6. paths and imports --------------------------------------------
  for (const file of [...js, ...html]) {
    const text = await readFile(file, 'utf8');
    const isTest = file.includes('/tests/') || file.includes('/tools/');

    // Root-absolute URLs in markup and in module specifiers.
    if (!isTest) {
      for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["'](\/[^"'/][^"']*)["']/g)) {
        // Protocol-relative and root-relative-to-site paths are both wrong for
        // a project page; 404.html is the documented exception because GitHub
        // serves it from the domain root.
        if (!file.endsWith('404.html')) err(file, `root-absolute path "${m[1]}" breaks on a project page`);
      }
      for (const m of text.matchAll(/\bfrom\s+["'](\/[^"']+)["']/g)) {
        err(file, `root-absolute import "${m[1]}"`);
      }
    }

    // Imports must resolve. Comments are skipped: the bundler documents the
    // rewrites it performs by quoting example import statements, and those are
    // prose, not module graph.
    if (extname(file) === '.js' || extname(file) === '.mjs') {
      for (const m of text.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)) {
        if (inComment(text, m.index)) continue;
        const target = resolve(dirname(file), m[1]);
        if (!existsSync(target)) err(file, `import target does not exist: ${m[1]}`);
      }
    }
  }

  // --- 2. parse every module ------------------------------------------------
  // Parsed in a subprocess with `node --check`, never imported. Importing would
  // execute top-level side effects — starting the dev server, re-downloading a
  // star catalogue — and several modules legitimately throw outside a browser.
  for (const file of js) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      const message = (result.stderr || '').split('\n').filter(Boolean).slice(0, 3).join(' / ');
      err(file, `syntax error: ${message}`);
    }
  }

  // --- 3. backticks in shader templates ------------------------------------
  for (const file of js.filter((f) => f.includes('shaders/'))) {
    const text = await readFile(file, 'utf8');
    let inTemplate = false;
    text.split('\n').forEach((line, i) => {
      const opens = /\/\* glsl \*\/ `/.test(line) || /`#version 300 es\s*$/.test(line);
      const closes = /^\s*`;\s*$/.test(line) || /`;\s*$/.test(line);
      if (inTemplate && !closes && line.includes('`')) {
        err(file, `line ${i + 1}: backtick inside a GLSL template literal terminates the string`);
      }
      if (opens && !closes) inTemplate = true;
      else if (closes) inTemplate = false;
    });
  }

  // --- 4. innerHTML ---------------------------------------------------------
  for (const file of js) {
    if (file.includes('/tests/') || file.includes('/tools/')) continue;
    const text = await readFile(file, 'utf8');
    text.split('\n').forEach((line, i) => {
      if (!/\.innerHTML\s*=/.test(line)) return;
      // dom.js has one deliberate, documented use behind an explicit `html:`
      // property; everything else must build nodes.
      if (file.endsWith('ui/dom.js')) return;
      err(file, `line ${i + 1}: innerHTML assignment (use ui/dom.js helpers instead)`);
    });
  }

  // --- 5. fetch hosts versus the CSP ---------------------------------------
  const indexHtml = await readFile(resolve(ROOT, 'index.html'), 'utf8');
  // Pull the policy out of the meta tag itself. Matching "connect-src" anywhere
  // in the document finds the HTML comment that explains the policy instead,
  // which is how this check silently passed nothing for its first run.
  const metaMatch = indexHtml.match(
    /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=["']([\s\S]*?)["']\s*>/i
  );
  if (!metaMatch) err(resolve(ROOT, 'index.html'), 'no Content-Security-Policy meta tag found');

  // With `default-src 'none'` every resource type the page uses needs its own
  // directive, and the failure mode when one is missing is quiet: the browser
  // blocks the request, logs to a console nobody is reading, and the page looks
  // almost right. The web manifest was missing for exactly this reason. So each
  // kind of reference in the markup is checked against the directive that
  // governs it.
  if (metaMatch) {
    const policy = metaMatch[1];
    const governs = [
      [/<link[^>]+rel=["']manifest["']/i, 'manifest-src', 'a web manifest'],
      [/<link[^>]+rel=["']stylesheet["']/i, 'style-src', 'a stylesheet'],
      [/<script\b/i, 'script-src', 'a script'],
      [/<img\b|<link[^>]+rel=["']icon["']/i, 'img-src', 'an image or icon'],
    ];
    if (/default-src\s+'none'/.test(policy)) {
      for (const [pattern, directive, what] of governs) {
        if (!pattern.test(indexHtml)) continue;
        if (new RegExp(`(^|;)\\s*${directive}\\b`).test(policy)) continue;
        err(
          resolve(ROOT, 'index.html'),
          `the document references ${what} but the CSP has no ${directive}, and default-src is 'none'`
        );
      }
    }
  }

  const cspMatch = metaMatch ? metaMatch[1].match(/connect-src([^;]*)/) : null;
  const allowed = cspMatch
    ? new Set(cspMatch[1].split(/\s+/).filter((s) => s.startsWith('https://')).map(hostOf))
    : new Set();

  // The registry is the authority on which hosts the browser actually contacts:
  // entries marked 'snapshot' or 'retired' are deliberately absent from the CSP
  // precisely because the page must never reach them. Importing it is safe — it
  // is pure data with no side effects.
  const { APIS } = await import('../src/data/registry.js');
  const liveHosts = new Set(APIS.filter((a) => a.access === 'browser').map((a) => hostOf(a.base)));
  for (const api of APIS) {
    const host = hostOf(api.base);
    if (api.access === 'browser') {
      if (!allowed.has(host)) {
        err(resolve(ROOT, 'index.html'), `CSP connect-src is missing ${host} (used by ${api.id})`);
      }
    } else if (allowed.has(host) && !liveHosts.has(host)) {
      // A host is only suspicious when NO live API needs it. The retired
      // Mars Photos and Earth Imagery endpoints live on api.nasa.gov, which
      // APOD and NeoWs also need, so that host must stay allowed.
      warn(resolve(ROOT, 'index.html'), `CSP allows ${host}, but ${api.id} is ${api.access} and nothing live uses that host`);
    }
  }

  // Anything else that looks like a fetch target must also be covered.
  for (const file of js) {
    if (file.includes('/tests/') || file.includes('/tools/') || file.endsWith('data/registry.js')) continue;
    const text = await readFile(file, 'utf8');
    for (const m of text.matchAll(/https:\/\/([a-z0-9.-]+)/gi)) {
      const host = m[1].toLowerCase();
      const line = lineContaining(text, m.index);
      // Documentation links, attribution and outbound anchors are not fetched.
      if (/^\s*\*|docs:|reference_url|@see|target: '_blank'|rel:/.test(line)) continue;
      if (!/fetch|url:|url\(|src|import\(/.test(line)) continue;
      if (host.endsWith('github.com') || host.endsWith('github.io')) continue;
      if (!allowed.has(host)) {
        err(file, `host ${host} is fetched but not listed in the CSP connect-src`);
      }
    }
  }

  // --- 7. leftovers ---------------------------------------------------------
  for (const file of js) {
    const text = await readFile(file, 'utf8');
    text.split('\n').forEach((line, i) => {
      if (file.includes('/tools/')) return;
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (/\bconsole\.log\(/.test(line)) warn(file, `line ${i + 1}: console.log`);
      if (/\bdebugger\b/.test(line)) err(file, `line ${i + 1}: debugger statement`);
      if (/\b(test|describe|it)\.only\(/.test(line)) err(file, `line ${i + 1}: .only() would skip the rest of the suite`);
      if (/\bTODO\b|\bFIXME\b|\bXXX\b/.test(line)) warn(file, `line ${i + 1}: unresolved marker`);
    });
  }

  // --- report ---------------------------------------------------------------
  for (const w of warnings) process.stdout.write(`warning: ${w}\n`);
  for (const e of errors) process.stderr.write(`error: ${e}\n`);

  if (errors.length) {
    process.stderr.write(`\n${errors.length} error(s).\n`);
    process.exit(1);
  }
  process.stdout.write(
    `Lint OK: ${js.length} modules, ${html.length} documents` +
      (warnings.length ? ` (${warnings.length} warning(s))` : '') + '\n'
  );
}

/** @param {string} url */
function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return url.replace(/^https:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  }
}

/** @param {string} text @param {number} index */
function lineContaining(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  const end = text.indexOf('\n', index);
  return text.slice(start, end === -1 ? undefined : end);
}

main().catch((e) => {
  process.stderr.write(`lint failed: ${e.stack || e.message}\n`);
  process.exit(1);
});
